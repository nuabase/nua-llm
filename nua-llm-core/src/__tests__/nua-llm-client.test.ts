import { Logger } from "../lib/logger";
import { listSchema } from "../modules/cast/list-schema";
import { EngineRouter, Route } from "../modules/engine/engine-router";
import { AttemptOutcome, AttemptRequest, LlmEngine } from "../modules/engine/llm-engine";
import { ModelInput } from "../modules/model-info";
import { NuaLlmClient } from "../nua-llm-client";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** An engine that enforces schemas natively and answers every attempt with `envelope`. */
function nativeEngine(envelope: unknown): LlmEngine & { requests: AttemptRequest[] } {
  const requests: AttemptRequest[] = [];
  return {
    requests,
    nativeSchema: (schema) => schema,
    attempt: async (request): Promise<AttemptOutcome> => {
      requests.push(request);
      return {
        kind: "answered",
        answer: { kind: "structured", envelope },
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        origin: { engine: "local-agent", agent: "claude-code", model: "sonnet", costUsdEstimate: 0.01 },
      };
    },
  };
}

/** A router that always answers with `route`, recording the model choices it was asked about. */
function fixedRouter(route: Route): EngineRouter & { asked: (ModelInput | undefined)[] } {
  const asked: (ModelInput | undefined)[] = [];
  return {
    asked,
    logger: silentLogger,
    route: (model) => {
      asked.push(model);
      return route;
    },
  };
}

describe("NuaLlmClient", () => {
  it("casts a value on the engine its router picks for the call's model", async () => {
    const engine = nativeEngine({ value: 7 });
    const router = fixedRouter({ kind: "routed", engine });
    const client = new NuaLlmClient(router);

    const result = await client.castValue({
      model: { alias: "haiku" },
      input: { prompt: "How many days are in a week?" },
      output: { name: "days", schema: { type: "number" } },
    });

    expect(router.asked).toEqual([{ alias: "haiku" }]);
    expect(result).toMatchObject({
      success: true,
      data: 7,
      schemaEnforcement: "native",
      origin: { engine: "local-agent", agent: "claude-code" },
      prompt: { full: engine.requests[0].prompt },
    });
    expect(result.success && result.prompt.full).toContain(result.success && result.prompt.system);
  });

  it("casts a list against the list schema it is given", async () => {
    const rows = [{ id: 1, account: "Expenses:Food" }];
    const engine = nativeEngine({ value: rows });
    const client = new NuaLlmClient(fixedRouter({ kind: "routed", engine }));

    const result = await client.castArray({
      input: { prompt: "Pick the account", data: [{ id: 1, text: "NOPII RESTAURANT sample" }] },
      output: listSchema({ type: "string" }, { primaryKey: "id", outputName: "account" }),
    });

    expect(result).toMatchObject({ success: true, data: rows });
    expect(engine.requests[0].enforcement).toMatchObject({
      kind: "native",
      schema: { properties: { value: { type: "array", items: { required: ["id", "account"] } } } },
    });
  });

  it("rejects rows without the list schema's primary key before routing", async () => {
    const router = fixedRouter({ kind: "unroutable", message: "not asked" });
    const client = new NuaLlmClient(router);

    const result = await client.castArray({
      input: { prompt: "p", data: [{ key: 1, text: "sample" }] },
      output: listSchema({ type: "string" }, { primaryKey: "id", outputName: "account" }),
    });

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/primary key 'id'/) });
    expect(router.asked).toEqual([]);
  });

  it("reports why no engine can run the call", async () => {
    const client = new NuaLlmClient(fixedRouter({ kind: "unroutable", message: "no codex equivalent" }));

    const result = await client.castValue({
      input: { prompt: "p" },
      output: { name: "n", schema: { type: "number" } },
    });

    expect(result).toEqual({ success: false, error: "no codex equivalent" });
  });
});
