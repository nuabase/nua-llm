import { Logger } from "../lib/logger";
import { runAgent } from "../modules/agent/run-agent";
import { claudeCodeAdapter } from "../modules/engine/local-agent/adapters/claude-code";
import { codexAdapter } from "../modules/engine/local-agent/adapters/codex";
import { AgentAdapter, AgentCallOptions } from "../modules/engine/local-agent/adapters/types";
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
 * A local agent whose CLI is the running Node binary, running `script`: each
 * attempt prints nothing and the adapter answers "7", recording the model and
 * effort it was asked to invoke.
 */
function stubAgent(
  adapter: AgentAdapter,
  defaultModel: string | undefined,
  { concurrency = 1, script = "" }: { concurrency?: number; script?: string } = {},
) {
  const invoked: AgentCallOptions[] = [];
  const recordingAdapter: AgentAdapter = {
    ...adapter,
    buildInvocation: (_request, options) => {
      invoked.push(options);
      return { args: ["-e", script], stdin: "" };
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
      unsetEnv: [],
      limiter: new Semaphore(concurrency),
      logger: silentLogger,
    },
    { model: defaultModel, timeoutMs: 10_000 },
  );
  const invokedModels = () => invoked.map((options) => options.model);
  return { agent, invoked, invokedModels };
}

/** Routes `model` on `agent`, runs one attempt, and returns the origin it reports. */
async function originOfAttempt(agent: LocalAgent, model: ModelInput | undefined) {
  const route = agent.route(model);
  if (route.kind !== "routed") throw new Error(route.message);
  const outcome = await route.engine.attempt({
    prompt: "p",
    reusablePrefix: "",
    maxTokens: 100,
    enforcement: { kind: "in-prompt" },
  });
  if (outcome.kind !== "answered") throw new Error(outcome.failure.message);
  return outcome.origin;
}

describe("LocalAgent.route", () => {
  it("runs the configured default model when a call names none", async () => {
    const { agent, invokedModels } = stubAgent(claudeCodeAdapter, "sonnet");
    expect(await originOfAttempt(agent, undefined)).toMatchObject({ agent: "claude-code", model: "sonnet" });
    expect(invokedModels()).toEqual(["sonnet"]);
  });

  it("leaves the model to the CLI when nothing is configured", async () => {
    const { agent, invokedModels } = stubAgent(codexAdapter, undefined);
    expect(await originOfAttempt(agent, undefined)).toMatchObject({ agent: "codex", model: undefined });
    expect(invokedModels()).toEqual([undefined]);
  });

  it("runs an alias as the CLI's own model name", async () => {
    const { agent, invokedModels } = stubAgent(claudeCodeAdapter, "sonnet");
    await originOfAttempt(agent, { alias: "haiku" });
    expect(invokedModels()).toEqual(["haiku"]);
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

describe("LocalAgent.with", () => {
  it("runs the model and effort it is given, leaving the agent it came from as it was", async () => {
    const { agent, invoked } = stubAgent(codexAdapter, "sample-model");
    await originOfAttempt(agent.with({ model: "sample-other-model", effort: "low" }), undefined);
    await originOfAttempt(agent, undefined);
    expect(invoked).toEqual([
      { model: "sample-other-model", effort: "low" },
      { model: "sample-model", effort: undefined },
    ]);
  });

  it("keeps what it isn't given, and runs the CLI's default model when given undefined", async () => {
    const { agent, invoked } = stubAgent(codexAdapter, "sample-model");
    const low = agent.with({ effort: "low" });
    await originOfAttempt(low, undefined);
    await originOfAttempt(low.with({ model: undefined }), undefined);
    expect(invoked).toEqual([
      { model: "sample-model", effort: "low" },
      { model: undefined, effort: "low" },
    ]);
  });

  it("shares one limit on processes running at once across the agents made from it", async () => {
    const { agent } = stubAgent(codexAdapter, undefined, { script: "setTimeout(() => {}, 300)" });
    const started = Date.now();
    await Promise.all([
      originOfAttempt(agent.with({ model: "sample-model" }), undefined),
      originOfAttempt(agent.with({ model: "sample-other-model" }), undefined),
    ]);
    // With a limit of one, the second process starts only once the first has ended.
    expect(Date.now() - started).toBeGreaterThanOrEqual(600);
  });

  it("rejects an empty model", () => {
    const { agent } = stubAgent(codexAdapter, undefined);
    expect(() => agent.with({ model: " " })).toThrow(/non-empty/);
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
