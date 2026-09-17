import { AttemptRequest } from "../../llm-engine";
import { classifyAgentFailure, stderrTail } from "./failure-classification";
import { AgentAdapter, AgentProcessResult, AgentReply } from "./types";

// Replaces Claude Code's coding-agent system prompt, which would otherwise add
// thousands of tokens and a software-engineering persona to every call.
const SYSTEM_PROMPT = [
  "You are a data transformation function called by a program.",
  "You have no tools. Follow the instructions in the user message exactly",
  "and reply only with the requested JSON.",
].join(" ");

type ClaudeResultJson = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  api_error_status?: number | null;
  result?: string;
  structured_output?: Record<string, unknown> | null;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
};

export const claudeCodeAdapter: AgentAdapter = {
  id: "claude-code",
  binaryName: "claude",
  apiKeyEnvVars: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  modelAliases: { haiku: "haiku", sonnet: "sonnet", opus: "opus" },

  // Claude Code accepts any JSON Schema with an object root.
  nativeSchema(envelopeSchema) {
    return envelopeSchema;
  },

  buildInvocation(request: AttemptRequest, model: string | undefined) {
    // Never pass --bare: it skips the keychain, so the subscription login is not used.
    const args = [
      "-p",
      "--output-format",
      "json",
      "--tools",
      "",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--system-prompt",
      SYSTEM_PROMPT,
    ];
    if (model !== undefined) {
      args.push("--model", model);
    }
    if (request.enforcement.kind === "native") {
      args.push("--json-schema", JSON.stringify(request.enforcement.schema));
    }
    return { args, stdin: request.prompt };
  },

  readResult(result: AgentProcessResult, request: AttemptRequest): AgentReply {
    let json: ClaudeResultJson;
    try {
      json = JSON.parse(result.stdout);
    } catch {
      return {
        kind: "failed",
        failure: classifyAgentFailure(
          "claude",
          `exited with code ${result.exitCode} without a JSON result: ${stderrTail(result)}`,
        ),
      };
    }

    if (json.is_error) {
      const message = json.result || `error (${json.subtype ?? "unknown"})`;
      if (json.api_error_status === 400 && /input_schema|json.?schema/i.test(message)) {
        return {
          kind: "failed",
          failure: { kind: "schema-rejected", message: `claude rejected the output schema: ${message}` },
        };
      }
      if (json.api_error_status === 401 || json.api_error_status === 403 || json.api_error_status === 429) {
        return { kind: "failed", failure: { kind: "fatal", message: `claude: ${message}` } };
      }
      return { kind: "failed", failure: classifyAgentFailure("claude", message) };
    }

    if (json.subtype !== "success") {
      return {
        kind: "failed",
        failure: {
          kind: "transient",
          message: `claude did not finish successfully (${json.subtype ?? "no subtype"})`,
        },
      };
    }

    const usage = json.usage ?? {};
    const promptTokens =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    const completionTokens = usage.output_tokens ?? 0;
    const reported = {
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      model: Object.keys(json.modelUsage ?? {})[0],
      costUsdEstimate: json.total_cost_usd,
    };

    if (request.enforcement.kind === "in-prompt") {
      return { kind: "answered", answer: { kind: "text", text: json.result ?? "" }, ...reported };
    }

    if (!json.structured_output) {
      return {
        kind: "failed",
        failure: {
          kind: "transient",
          message: `claude returned no structured output. Reply: ${json.result ?? ""}`,
        },
      };
    }
    return {
      kind: "answered",
      answer: { kind: "structured", envelope: json.structured_output },
      ...reported,
    };
  },

  loginStatusArgs: ["auth", "status"],

  readLoginStatus(result) {
    try {
      const status = JSON.parse(result.stdout) as { loggedIn?: boolean; authMethod?: string };
      return { loggedIn: status.loggedIn === true, detail: status.authMethod };
    } catch {
      return { loggedIn: false, detail: stderrTail(result) || result.stdout.trim() };
    }
  },
};
