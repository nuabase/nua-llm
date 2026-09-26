import { AttemptFailure, AttemptRequest } from "../../llm-engine";
import { classifyAgentFailure, stderrTail } from "./failure-classification";
import { AgentAdapter, AgentProcessResult, AgentReply } from "./types";

// Replaces Pi's coding-agent system prompt, which would otherwise add a
// software-engineering persona and its project context to every call.
const SYSTEM_PROMPT = [
  "You are a data transformation function called by a program.",
  "You have no tools. Follow the instructions in the user message exactly",
  "and reply only with the requested JSON.",
].join(" ");

type PiContentBlock = { type?: string; text?: string };

type PiUsage = {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
};

type PiMessage = {
  role?: string;
  content?: PiContentBlock[];
  provider?: string;
  model?: string;
  usage?: PiUsage;
  stopReason?: string;
  errorMessage?: string;
};

type PiEvent = {
  type?: string;
  message?: PiMessage;
  success?: boolean;
  finalError?: string;
};

export const piAdapter: AgentAdapter = {
  id: "pi",
  binaryName: "pi",
  // Every environment credential Pi's providers recognize. Under `auth:
  // "subscription"` these are removed so Pi bills its own `auth.json` login.
  apiKeyEnvVars: [
    "AI_GATEWAY_API_KEY",
    "ANT_LING_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_OAUTH_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AZURE_OPENAI_API_KEY",
    "BASETEN_API_KEY",
    "CEREBRAS_API_KEY",
    "CLOUDFLARE_API_KEY",
    "COPILOT_GITHUB_TOKEN",
    "DEEPSEEK_API_KEY",
    "FIREWORKS_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_CLOUD_API_KEY",
    "GROQ_API_KEY",
    "HF_TOKEN",
    "KIMI_API_KEY",
    "META_API_KEY",
    "MINIMAX_API_KEY",
    "MINIMAX_CN_API_KEY",
    "MISTRAL_API_KEY",
    "MOONSHOT_API_KEY",
    "NVIDIA_API_KEY",
    "OPENAI_API_KEY",
    "OPENCODE_API_KEY",
    "OPENROUTER_API_KEY",
    "QWEN_TOKEN_PLAN_API_KEY",
    "QWEN_TOKEN_PLAN_CN_API_KEY",
    "RADIUS_API_KEY",
    "TOGETHER_API_KEY",
    "XAI_API_KEY",
    "XIAOMI_API_KEY",
    "XIAOMI_TOKEN_PLAN_AMS_API_KEY",
    "XIAOMI_TOKEN_PLAN_CN_API_KEY",
    "XIAOMI_TOKEN_PLAN_SGP_API_KEY",
    "ZAI_API_KEY",
    "ZAI_CODING_CN_API_KEY",
  ],
  // Pi uses its own `provider/id` model names; set one with localAgent({ model }).
  modelAliases: {},

  nativeSchema() {
    // Pi has no schema flag; cast falls back to in-prompt enforcement.
    return null;
  },

  buildInvocation(request: AttemptRequest, model: string | undefined) {
    const args = [
      "--mode",
      "json",
      "--no-session",
      "--no-tools",
      "--no-builtin-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-context-files",
      "--system-prompt",
      SYSTEM_PROMPT,
      "--offline",
    ];
    if (model !== undefined) {
      args.push("--model", model);
    }
    // Pi prepends piped stdin to the first prompt, so the prompt stays on stdin
    // rather than an argv positional (which would hit argv length limits).
    return { args, stdin: request.prompt };
  },

  readResult(result: AgentProcessResult, request: AttemptRequest): AgentReply {
    const events = parseEvents(result.stdout);

    const assistant = events
      .filter((event) => event.type === "message_end" && event.message?.role === "assistant")
      .map((event) => event.message as PiMessage)
      .pop();

    if (assistant && (assistant.stopReason === "error" || assistant.errorMessage)) {
      return failed(classifyAgentFailure("pi", assistant.errorMessage ?? "pi stopped with an error"));
    }

    const retryFailed = events.find((event) => event.type === "auto_retry_end" && event.success === false);
    if (retryFailed) {
      return failed(classifyAgentFailure("pi", retryFailed.finalError ?? "auto retry failed"));
    }

    if (!assistant) {
      return failed(
        classifyAgentFailure(
          "pi",
          `exited with code ${result.exitCode} without a reply: ${stderrTail(result)}`,
        ),
      );
    }

    // Thinking and toolCall blocks are ignored; tools are disabled, so only text matters.
    const text = (assistant.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    const usage = assistant.usage ?? {};
    const promptTokens = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
    const completionTokens = usage.output ?? 0;
    const reported = {
      usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
      model: assistant.model,
      costUsdEstimate: usage.cost?.total,
    };

    if (request.enforcement.kind === "in-prompt") {
      return { kind: "answered", answer: { kind: "text", text }, ...reported };
    }

    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch {
      return failed({ kind: "transient", message: `pi reply is not JSON: ${text}` });
    }
    return { kind: "answered", answer: { kind: "structured", envelope }, ...reported };
  },

  // Pi has no provider-agnostic login check: `pi auth check` requires --provider
  // or --model, and the provider differs per user (it is not known until Pi's
  // settings are read). Report installed Pi as logged in; the first real call
  // surfaces any auth error, which classifyAgentFailure marks fatal.
  loginStatusArgs: ["--version"],

  readLoginStatus(result) {
    return {
      loggedIn: result.exitCode === 0,
      detail: "installed; auth is verified on the first call",
    };
  },
};

function failed(failure: AttemptFailure): AgentReply {
  return { kind: "failed", failure };
}

/** Parses Pi's strict-JSONL stdout, skipping blank and non-object lines. */
function parseEvents(stdout: string): PiEvent[] {
  const events: PiEvent[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.replace(/\r$/, "").trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        events.push(parsed as PiEvent);
      }
    } catch {
      // Stdout should be protocol-only, but skip anything that is not JSON.
    }
  }
  return events;
}
