import { toStrictSchema } from "../../../../lib/strict-json-schema";
import { AttemptRequest } from "../../llm-engine";
import { classifyAgentFailure, stderrTail } from "./failure-classification";
import { AgentAdapter, AgentProcessResult, AgentReply } from "./types";

const SCHEMA_FILE = "output-schema.json";
const LAST_MESSAGE_FILE = "last-message.txt";

type CodexEvent = {
  type?: string;
  message?: string;
  error?: { message?: string };
  item?: { type?: string; text?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
};

export const codexAdapter: AgentAdapter = {
  id: "codex",
  binaryName: "codex",
  apiKeyEnvVars: ["OPENAI_API_KEY", "CODEX_API_KEY"],
  // Codex's models have no equivalent among the aliases; set one with localAgent({ model }).
  modelAliases: {},

  // Codex accepts only OpenAI strict-mode schemas.
  nativeSchema(envelopeSchema) {
    return toStrictSchema(envelopeSchema);
  },

  buildInvocation(request: AttemptRequest, model: string | undefined) {
    // Codex has no flag to remove its tools. The empty working directory and
    // the read-only sandbox keep it from touching anything.
    const args = [
      "exec",
      "-",
      "--skip-git-repo-check",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--sandbox",
      "read-only",
      "-c",
      "model_reasoning_effort=low",
      "--json",
      "-o",
      LAST_MESSAGE_FILE,
    ];
    if (model !== undefined) {
      args.push("-m", model);
    }
    const files: { name: string; content: string }[] = [];
    if (request.enforcement.kind === "native") {
      args.push("--output-schema", SCHEMA_FILE);
      files.push({ name: SCHEMA_FILE, content: JSON.stringify(request.enforcement.schema) });
    }
    return { args, stdin: request.prompt, files, outputFiles: [LAST_MESSAGE_FILE] };
  },

  readResult(result: AgentProcessResult, request: AttemptRequest): AgentReply {
    const events = parseEvents(result.stdout);

    const failed = events.find((e) => e.type === "turn.failed" || e.type === "error");
    if (failed) {
      const message = failed.error?.message ?? failed.message ?? "unknown error";
      if (/invalid_json_schema/.test(message)) {
        return {
          kind: "failed",
          failure: { kind: "schema-rejected", message: `codex rejected the output schema: ${message}` },
        };
      }
      return { kind: "failed", failure: classifyAgentFailure("codex", message) };
    }

    const agentMessages = events.filter((e) => e.item?.type === "agent_message");
    const lastMessage =
      result.outputFiles[LAST_MESSAGE_FILE] ?? agentMessages[agentMessages.length - 1]?.item?.text;

    if (result.exitCode !== 0 || lastMessage === undefined) {
      return {
        kind: "failed",
        failure: classifyAgentFailure(
          "codex",
          `exited with code ${result.exitCode} without a reply: ${stderrTail(result)}`,
        ),
      };
    }

    const completed = events.filter((e) => e.type === "turn.completed");
    const promptTokens = completed.reduce((sum, e) => sum + (e.usage?.input_tokens ?? 0), 0);
    const completionTokens = completed.reduce((sum, e) => sum + (e.usage?.output_tokens ?? 0), 0);
    const reported = {
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      // Codex does not report which model answered.
      model: undefined,
      costUsdEstimate: undefined,
    };

    if (request.enforcement.kind === "in-prompt") {
      return { kind: "answered", answer: { kind: "text", text: lastMessage }, ...reported };
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(lastMessage);
    } catch {
      return {
        kind: "failed",
        failure: { kind: "transient", message: `codex reply is not JSON: ${lastMessage}` },
      };
    }
    return { kind: "answered", answer: { kind: "structured", envelope }, ...reported };
  },

  loginStatusArgs: ["login", "status"],

  readLoginStatus(result) {
    const detail = `${result.stdout}\n${result.stderr}`.trim();
    return { loggedIn: result.exitCode === 0, detail };
  },
};

function parseEvents(stdout: string): CodexEvent[] {
  const events: CodexEvent[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Codex may interleave non-JSON log lines; skip them.
    }
  }
  return events;
}
