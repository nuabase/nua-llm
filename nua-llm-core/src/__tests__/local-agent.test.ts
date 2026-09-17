import { Logger } from "../lib/logger";
import { runAgent } from "../modules/agent/run-agent";
import { claudeCodeAdapter } from "../modules/engine/local-agent/adapters/claude-code";
import { codexAdapter } from "../modules/engine/local-agent/adapters/codex";
import { AgentAdapter } from "../modules/engine/local-agent/adapters/types";
import { localAgent } from "../modules/engine/local-agent/create-local-agent";
import { LocalAgent } from "../modules/engine/local-agent/local-agent";
import { Semaphore } from "../modules/engine/local-agent/semaphore";
import { ModelInput } from "../modules/model-info";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * A local agent whose CLI is the running Node binary: each attempt prints nothing
 * and the adapter answers "7", recording the model it was asked to invoke.
 */
function stubAgent(adapter: AgentAdapter, defaultModel: string | undefined) {
  const invokedModels: (string | undefined)[] = [];
  const recordingAdapter: AgentAdapter = {
    ...adapter,
    buildInvocation: (_request, model) => {
      invokedModels.push(model);
      return { args: ["-e", ""], stdin: "" };
    },
    readResult: () => ({
      kind: "answered",
      answer: { kind: "text", text: "7" },
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: undefined,
      costUsdEstimate: undefined,
    }),
  };
  const agent = new LocalAgent(
    {
      adapter: recordingAdapter,
      binaryPath: process.execPath,
      timeoutMs: 10_000,
      unsetEnv: [],
      limiter: new Semaphore(1),
      logger: silentLogger,
    },
    defaultModel,
  );
  return { agent, invokedModels };
}

/** Routes `model` on `agent`, runs one attempt, and returns the origin it reports. */
async function originOfAttempt(agent: LocalAgent, model: ModelInput | undefined) {
  const route = agent.route(model);
  if (route.kind !== "routed") throw new Error(route.message);
  const outcome = await route.engine.attempt({ prompt: "p", maxTokens: 100, enforcement: { kind: "in-prompt" } });
  if (outcome.kind !== "answered") throw new Error(outcome.failure.message);
  return outcome.origin;
}

describe("LocalAgent.route", () => {
  it("runs the configured default model when a call names none", async () => {
    const { agent, invokedModels } = stubAgent(claudeCodeAdapter, "sonnet");
    expect(await originOfAttempt(agent, undefined)).toMatchObject({ agent: "claude-code", model: "sonnet" });
    expect(invokedModels).toEqual(["sonnet"]);
  });

  it("leaves the model to the CLI when nothing is configured", async () => {
    const { agent, invokedModels } = stubAgent(codexAdapter, undefined);
    expect(await originOfAttempt(agent, undefined)).toMatchObject({ agent: "codex", model: undefined });
    expect(invokedModels).toEqual([undefined]);
  });

  it("runs an alias as the CLI's own model name", async () => {
    const { agent, invokedModels } = stubAgent(claudeCodeAdapter, "sonnet");
    await originOfAttempt(agent, { alias: "haiku" });
    expect(invokedModels).toEqual(["haiku"]);
  });

  it("cannot route an alias the CLI has no equivalent for", () => {
    const { agent } = stubAgent(codexAdapter, undefined);
    expect(agent.route({ alias: "haiku" })).toEqual({
      kind: "unroutable",
      message: 'Model alias "haiku" has no codex equivalent',
    });
  });

  it("cannot be given to runAgent, which needs an LLM provider's API", () => {
    const runOnAgent = (agent: LocalAgent) =>
      // @ts-expect-error runAgent takes provider engines only
      runAgent(agent, { messages: [], tools: [] });
    expect(typeof runOnAgent).toBe("function");
  });

  it("cannot route a provider model", () => {
    const { agent } = stubAgent(claudeCodeAdapter, undefined);
    expect(agent.route({ provider: "groq", model: "sample-model" })).toMatchObject({
      kind: "unroutable",
      message: expect.stringMatching(/model aliases, not provider models/),
    });
  });
});

describe("localAgent", () => {
  it("sets up an agent whose binary exists, without running it", () => {
    const agent = localAgent({ agent: "codex", binaryPath: process.execPath, logger: silentLogger });
    expect(agent.agent).toBe("codex");
    expect(agent.logger).toBe(silentLogger);
  });

  it("throws right away when the binary is not on PATH", () => {
    const originalPath = process.env.PATH;
    process.env.PATH = "";
    try {
      expect(() => localAgent({ agent: "claude-code" })).toThrow(/claude was not found on PATH/);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it("refuses .cmd shims", () => {
    expect(() => localAgent({ agent: "codex", binaryPath: "C:\\sample\\codex.cmd" })).toThrow(/\.cmd shim/);
  });

  it("rejects invalid options", () => {
    const binaryPath = process.execPath;
    expect(() => localAgent({ agent: "codex", binaryPath, concurrency: 0 })).toThrow(/concurrency/);
    expect(() => localAgent({ agent: "codex", binaryPath, model: " " })).toThrow(/omit it/);
    expect(() => localAgent({ agent: "sample" as never, binaryPath })).toThrow(/Unknown local agent/);
  });
});
