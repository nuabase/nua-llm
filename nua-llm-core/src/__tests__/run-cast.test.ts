import { Logger } from "../lib/logger";
import { JsonSchema } from "../lib/schema-utils";
import { unwrapEnvelope, wrapInEnvelope } from "../modules/cast/envelope";
import { CastRequest } from "../modules/cast/cast-request";
import { listSchema } from "../modules/cast/list-schema";
import { renderPrompt } from "../modules/cast/prompts/render-prompt";
import { runCast } from "../modules/cast/run-cast";
import {
  AnswerOrigin,
  AttemptOutcome,
  AttemptRequest,
  LlmEngine,
} from "../modules/engine/llm-engine";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };
const origin: AnswerOrigin = { engine: "http", provider: "groq", model: "sample-model" };

const request: CastRequest = {
  kind: "value",
  prompt: "How many days are in a week?",
  data: null,
  outputName: "days",
  schema: { type: "number" },
  maxTokens: 100,
};
const inPromptPrompt = renderPrompt(request, "in-prompt");
const nativePrompt = renderPrompt(request, "native");

/** An engine that replies with the given outcomes in order and records each request. */
function scriptedEngine(
  outcomes: AttemptOutcome[],
  nativeSchema: (envelope: JsonSchema) => JsonSchema | null = () => null,
): LlmEngine & { requests: AttemptRequest[] } {
  const requests: AttemptRequest[] = [];
  return {
    requests,
    nativeSchema,
    attempt: async (attemptRequest) => {
      requests.push(attemptRequest);
      const outcome = outcomes.shift();
      if (!outcome) throw new Error("engine was called more times than scripted");
      return outcome;
    },
  };
}

const text = (value: string): AttemptOutcome => ({
  kind: "answered",
  answer: { kind: "text", text: value },
  usage,
  origin,
});

const structured = (envelope: unknown): AttemptOutcome => ({
  kind: "answered",
  answer: { kind: "structured", envelope },
  usage,
  origin,
});

const failed = (kind: "transient" | "fatal" | "schema-rejected", message: string): AttemptOutcome => ({
  kind: "failed",
  failure: { kind, message },
});

const cast = (engine: LlmEngine) => runCast<number>(engine, request, silentLogger);

describe("envelope", () => {
  it("wraps any schema in an object with a value field and drops $schema", () => {
    expect(
      wrapInEnvelope({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "string" }),
    ).toEqual({
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    });
  });

  it("drops $schema from a list's item schema", () => {
    const { jsonSchema } = listSchema(
      { $schema: "http://json-schema.org/draft-07/schema#", type: "string" },
      { primaryKey: "id", outputName: "account" },
    );
    expect(wrapInEnvelope(jsonSchema).properties).toEqual({
      value: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "account"],
          properties: {
            id: { anyOf: [{ type: "string" }, { type: "number" }, { type: "integer" }] },
            account: { type: "string" },
          },
        },
      },
    });
  });

  it("drops $schema from every subschema, but not from property names or literal values", () => {
    const dialect = "https://json-schema.org/draft/2020-12/schema";
    const literal = { $schema: dialect };
    const schema = {
      $schema: dialect,
      type: "object",
      properties: { $schema: { $schema: dialect, type: "string" } },
      patternProperties: { "^x-": { $schema: dialect } },
      additionalProperties: { $schema: dialect },
      $defs: { row: { $schema: dialect, items: [{ $schema: dialect }] } },
      anyOf: [{ $schema: dialect, not: { $schema: dialect } }, true],
      if: { $schema: dialect },
      then: { $schema: dialect, prefixItems: [{ $schema: dialect }] },
      dependencies: { a: ["b"], c: { $schema: dialect } },
      const: literal,
      enum: [literal],
      default: literal,
      examples: [literal],
    };

    expect(wrapInEnvelope(schema).properties).toEqual({
      value: {
        type: "object",
        properties: { $schema: { type: "string" } },
        patternProperties: { "^x-": {} },
        additionalProperties: {},
        $defs: { row: { items: [{}] } },
        anyOf: [{ not: {} }, true],
        if: {},
        then: { prefixItems: [{}] },
        dependencies: { a: ["b"], c: {} },
        const: literal,
        enum: [literal],
        default: literal,
        examples: [literal],
      },
    });
  });

  it("unwraps falsy values", () => {
    expect(unwrapEnvelope({ value: 0 })).toEqual({ found: true, value: 0 });
    expect(unwrapEnvelope({ other: 1 })).toEqual({ found: false });
  });
});

describe("runCast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("extracts JSON from a text answer and validates it", async () => {
    const engine = scriptedEngine([text("```json\n7\n```")]);
    const result = await cast(engine);
    expect(result).toEqual({
      success: true,
      data: 7,
      usage,
      prompt: inPromptPrompt,
      origin,
      schemaEnforcement: "in-prompt",
    });
    expect(engine.requests[0]).toEqual({
      prompt: inPromptPrompt.full,
      maxTokens: 100,
      enforcement: { kind: "in-prompt" },
    });
  });

  it("sends the native prompt and schema when the engine can enforce it, and unwraps the answer", async () => {
    const engine = scriptedEngine([structured({ value: 0 })], (envelope) => envelope);
    const result = await cast(engine);
    expect(result).toMatchObject({ success: true, data: 0, schemaEnforcement: "native" });
    expect(result).toMatchObject({ prompt: nativePrompt });
    expect(engine.requests[0]).toMatchObject({
      prompt: nativePrompt.full,
      enforcement: { kind: "native", schema: wrapInEnvelope({ type: "number" }) },
    });
  });

  it("switches to in-prompt enforcement right away when the engine rejects the schema", async () => {
    const engine = scriptedEngine(
      [failed("schema-rejected", "bad schema"), text("7")],
      (envelope) => envelope,
    );
    const result = await cast(engine);
    expect(result).toMatchObject({ success: true, data: 7, schemaEnforcement: "in-prompt" });
    expect(result).toMatchObject({ prompt: inPromptPrompt });
    expect(engine.requests.map((r) => r.prompt)).toEqual([nativePrompt.full, inPromptPrompt.full]);
  });

  it("gives up on the first fatal failure", async () => {
    const engine = scriptedEngine([failed("fatal", "not logged in")]);
    const result = await cast(engine);
    expect(result).toEqual({ success: false, error: "not logged in", prompt: inPromptPrompt });
    expect(engine.requests).toHaveLength(1);
  });

  it("retries transient failures and invalid answers, then reports the last error", async () => {
    const engine = scriptedEngine([
      failed("transient", "overloaded"),
      text("not json at all"),
      text('"seven"'),
    ]);
    const pending = cast(engine);
    await jest.runAllTimersAsync();
    const result = await pending;
    expect(engine.requests).toHaveLength(3);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/failed after 3 attempts/);
      expect(result.error).toMatch(/Validation failed/);
    }
  });

  it("reports the prompt that was last sent, not the one planned next", async () => {
    const engine = scriptedEngine(
      [failed("transient", "overloaded"), failed("transient", "overloaded"), failed("schema-rejected", "bad schema")],
      (envelope) => envelope,
    );
    const pending = cast(engine);
    await jest.runAllTimersAsync();
    expect(await pending).toMatchObject({ success: false, prompt: nativePrompt });
  });

  it("retries a structured answer without the envelope field", async () => {
    const engine = scriptedEngine([structured({ result: 7 }), structured({ value: 7 })], (e) => e);
    const pending = cast(engine);
    await jest.runAllTimersAsync();
    expect(await pending).toMatchObject({ success: true, data: 7 });
  });

  it("fails without calling the engine when the schema does not compile", async () => {
    const engine = scriptedEngine([]);
    const result = await runCast(engine, { ...request, schema: { type: "not-a-type" } }, silentLogger);
    expect(result).toEqual({ success: false, error: expect.stringMatching(/Invalid output schema/) });
    expect(engine.requests).toHaveLength(0);
  });
});
