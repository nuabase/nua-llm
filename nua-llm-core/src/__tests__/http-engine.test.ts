import { Logger } from "../lib/logger";
import { sendAgentTurn } from "../modules/agent/agent-turn";
import { runAgent } from "../modules/agent/run-agent";
import { AttemptRequest } from "../modules/engine/llm-engine";
import { HttpEngine } from "../modules/engine/http/http-engine";
import { providerEngines } from "../modules/engine/http/provider-engines";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const request: AttemptRequest = {
  prompt: "Return 7",
  maxTokens: 100,
  enforcement: { kind: "in-prompt" },
};

const target = { provider: "groq", model: "sample-model", apiKey: "sample-key" } as const;

function respondWith(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe("HttpEngine.attempt", () => {
  const engine = new HttpEngine(target, silentLogger);

  it("returns the reply text with usage and origin", async () => {
    respondWith(200, {
      choices: [{ message: { content: "7" } }],
      usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
    });
    expect(await engine.attempt(request)).toEqual({
      kind: "answered",
      answer: { kind: "text", text: "7" },
      usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 },
      origin: { engine: "http", provider: "groq", model: "sample-model" },
    });
  });

  it("reports a rejected API key as fatal", async () => {
    respondWith(401, { error: { message: "Invalid API Key" } });
    const outcome = await engine.attempt(request);
    expect(outcome).toMatchObject({ kind: "failed", failure: { kind: "fatal" } });
  });

  it("reports server errors as transient", async () => {
    respondWith(503, { error: { message: "Overloaded" } });
    const outcome = await engine.attempt(request);
    expect(outcome).toMatchObject({ kind: "failed", failure: { kind: "transient" } });
  });

  it("reports network errors as transient", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("socket hang up"));
    const outcome = await engine.attempt(request);
    expect(outcome).toMatchObject({
      kind: "failed",
      failure: { kind: "transient", message: expect.stringContaining("socket hang up") },
    });
  });

  it("never enforces a schema natively", () => {
    expect(engine.nativeSchema()).toBeNull();
  });
});

describe("sendAgentTurn", () => {
  it("throws when the provider call fails, for the agent loop to report", async () => {
    respondWith(401, { error: { message: "Invalid API Key" } });
    await expect(
      sendAgentTurn({ target, maxTokens: 100, messages: [{ role: "user", content: "hi" }], tools: [] }, silentLogger),
    ).rejects.toThrow(/Groq API request failed/);
  });
});

describe("providerEngines", () => {
  const providers = providerEngines({ logger: silentLogger, providers: { groq: { apiKey: "sample-key" } } });

  it("routes a model alias to the configured provider's model", async () => {
    const route = providers.route({ alias: "fast" });
    if (route.kind !== "routed") throw new Error(route.message);

    respondWith(200, { choices: [{ message: { content: "7" } }] });
    const outcome = await route.engine.attempt(request);
    expect(outcome).toMatchObject({ origin: { engine: "http", provider: "groq", model: "qwen/qwen3.8-27b" } });
  });

  it("uses its default model when a call names none", () => {
    const withDefault = providerEngines({
      logger: silentLogger,
      providers: { groq: { apiKey: "sample-key" } },
      model: { provider: "groq", model: "sample-default" },
    });
    expect(withDefault.resolve(undefined)).toEqual({
      kind: "resolved",
      target: { provider: "groq", model: "sample-default", apiKey: "sample-key" },
    });
  });

  it("cannot route a model whose provider has no API key", () => {
    expect(providers.route({ provider: "gemini", model: "gemini-2.5-flash" })).toMatchObject({
      kind: "unroutable",
      message: expect.stringMatching(/not configured/),
    });
  });

  it("ends an agent run before any call when the model cannot be routed", async () => {
    global.fetch = jest.fn();
    const result = await runAgent(providers, {
      model: { alias: "sonnet" },
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    expect(result).toMatchObject({ success: false, completionReason: "error" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
