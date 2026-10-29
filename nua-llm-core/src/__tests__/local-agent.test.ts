import { Logger } from "../lib/logger";
import { runAgent } from "../modules/agent/run-agent";
import { claudeCodeAdapter } from "../modules/engine/local-agent/adapters/claude-code";
import { codexAdapter } from "../modules/engine/local-agent/adapters/codex";
import { AgentAdapter, AgentCallOptions } from "../modules/engine/local-agent/adapters/types";
import { localAgent } from "../modules/engine/local-agent/create-local-agent";
import { LocalAgent } from "../modules/engine/local-agent/local-agent";
import { Semaphore } from "../modules/engine/local-agent/semaphore";
import { AttemptControls, AttemptOutcome } from "../modules/engine/llm-engine";
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
  {
    concurrency = 1,
    script = "",
    logger = silentLogger,
  }: { concurrency?: number; script?: string; logger?: Logger } = {},
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
      logger,
    },
    { model: defaultModel, timeoutMs: 10_000 },
  );
  const invokedModels = () => invoked.map((options) => options.model);
  return { agent, invoked, invokedModels };
}

/** Routes `model` on `agent` and runs one attempt. */
function attemptOn(agent: LocalAgent, model: ModelInput | undefined, controls?: AttemptControls): Promise<AttemptOutcome> {
  const route = agent.route(model);
  if (route.kind !== "routed") throw new Error(route.message);
  return route.engine.attempt(
    { prompt: "p", reusablePrefix: "", maxTokens: 100, enforcement: { kind: "in-prompt" } },
    controls,
  );
}

/** Runs one attempt, and returns the origin it reports. */
async function originOfAttempt(agent: LocalAgent, model: ModelInput | undefined, controls?: AttemptControls) {
  const outcome = await attemptOn(agent, model, controls);
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

  it("passes the agent's output to the listener of the attempt it belongs to", async () => {
    const { agent } = stubAgent(codexAdapter, undefined, { concurrency: 2, script: "console.log(process.pid)" });
    const first: string[] = [];
    const second: string[] = [];
    await Promise.all([
      originOfAttempt(agent, undefined, { onOutput: (chunk) => first.push(chunk) }),
      originOfAttempt(agent, undefined, { onOutput: (chunk) => second.push(chunk) }),
    ]);
    expect(first.join("")).toMatch(/^\d+\n$/);
    expect(second.join("")).toMatch(/^\d+\n$/);
    expect(first.join("")).not.toBe(second.join(""));
  });

  it("says which limit stopped an agent, what it had printed, and how to raise the limit", async () => {
    const { agent } = stubAgent(claudeCodeAdapter, undefined, {
      script: "console.error('sample stderr'); setTimeout(() => {}, 60000)",
    });
    await expect(originOfAttempt(agent.with({ idleTimeoutMs: 200 }), undefined)).rejects.toThrow(
      /printed nothing for 0\.2 s \(idleTimeoutMs 200\)\. It had printed 14 characters before that\. Raise idleTimeoutMs, or set it to null for no limit\. Its stderr ended: sample stderr/,
    );
    await expect(
      originOfAttempt(agent.with({ timeoutMs: 200, idleTimeoutMs: null }), undefined),
    ).rejects.toThrow(
      /its limit \(timeoutMs 200\)\. It had printed 14 characters, the last 0\.\d s before it was stopped\. Raise timeoutMs\./,
    );

    const { agent: silent } = stubAgent(claudeCodeAdapter, undefined, { script: "setTimeout(() => {}, 60000)" });
    await expect(
      originOfAttempt(silent.with({ timeoutMs: 200, idleTimeoutMs: null }), undefined),
    ).rejects.toThrow(/its limit \(timeoutMs 200\)\. It had printed nothing\. Raise timeoutMs\./);
  });

  it("logs a listener's first throw and runs the agent on", async () => {
    const warnings: unknown[][] = [];
    const logger = { ...silentLogger, warn: (...args: unknown[]) => void warnings.push(args) };
    const { agent } = stubAgent(codexAdapter, undefined, {
      script: "console.log('a'); setTimeout(() => console.log('b'), 50)",
      logger,
    });
    let calls = 0;
    const origin = await originOfAttempt(agent, undefined, {
      onOutput: () => {
        calls++;
        throw new Error("sample listener failure");
      },
    });
    expect(origin).toMatchObject({ agent: "codex" });
    expect(calls).toBe(2);
    expect(warnings).toEqual([
      [expect.stringMatching(/onOutput listener threw/), expect.objectContaining({ error: "sample listener failure" })],
    ]);
  });

  it("stops a running agent when the signal aborts", async () => {
    const { agent } = stubAgent(codexAdapter, undefined, { script: "setTimeout(() => {}, 60000)" });
    const started = Date.now();
    const outcome = await attemptOn(agent, undefined, { signal: AbortSignal.timeout(100) });
    expect(outcome).toEqual({ kind: "failed", failure: { kind: "cancelled", message: "The call was cancelled." } });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("drops a cancelled attempt from the queue without running it, and keeps the queue moving", async () => {
    const { agent, invoked } = stubAgent(codexAdapter, undefined, { script: "setTimeout(() => {}, 400)" });
    const controller = new AbortController();
    const running = originOfAttempt(agent, undefined);
    const queued = attemptOn(agent, undefined, { signal: controller.signal });
    const next = originOfAttempt(agent, undefined);
    controller.abort();
    expect(await queued).toMatchObject({ kind: "failed", failure: { kind: "cancelled" } });
    await Promise.all([running, next]);
    // The cancelled attempt never built an invocation.
    expect(invoked).toHaveLength(2);
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
    expect(() => localAgent({ agent: "codex", binaryPath, model: " " })).toThrow(/non-empty/);
    for (const ms of [0, -1, NaN, Infinity, 2 ** 31]) {
      expect(() => localAgent({ agent: "codex", binaryPath, timeoutMs: ms })).toThrow(/timeoutMs must be/);
      expect(() => localAgent({ agent: "codex", binaryPath, idleTimeoutMs: ms })).toThrow(/idleTimeoutMs must be/);
    }
    expect(() => localAgent({ agent: "codex", binaryPath, idleTimeoutMs: null })).not.toThrow();
    expect(() => localAgent({ agent: "sample" as never, binaryPath })).toThrow(/Unknown local agent/);
  });
});
