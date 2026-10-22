import { z } from "zod";
import { Logger } from "../lib/logger";
import { describeSchema, JsonSchema } from "../lib/schema-utils";
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
  schema: z.number(),
  jsonSchema: { type: "number" },
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

  it("drops $schema from a list's schema", () => {
    const { schema } = listSchema(z.string(), { primaryKey: "id", outputName: "account" });
    expect(wrapInEnvelope(describeSchema(schema)).properties).toEqual({
      value: {
        type: "array",
        items: {
          type: "object",
          required: ["id", "account"],
          properties: {
            id: { type: ["string", "number"] },
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

    const envelope = wrapInEnvelope(schema);
    expect(envelope.$defs).toEqual({ row: { items: [{}] } });
    expect(envelope.properties).toEqual({
      value: {
        type: "object",
        properties: { $schema: { type: "string" } },
        patternProperties: { "^x-": {} },
        additionalProperties: {},
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

  describe("refs", () => {
    const Account = z.object({ name: z.string() }).meta({ id: "Account" });
    const accountDefs = {
      Account: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    };

    it("moves the definitions of a root schema with an id to the envelope's root", () => {
      expect(wrapInEnvelope(describeSchema(Account))).toEqual({
        type: "object",
        properties: { value: { $ref: "#/$defs/Account" } },
        required: ["value"],
        additionalProperties: false,
        $defs: accountDefs,
      });
    });

    it("moves the definitions of a nested schema with an id to the envelope's root", () => {
      const envelope = wrapInEnvelope(describeSchema(z.array(Account)));
      expect(envelope.properties).toEqual({ value: { type: "array", items: { $ref: "#/$defs/Account" } } });
      expect(envelope.$defs).toEqual(accountDefs);
    });

    it("moves the definitions of a list's item schema to the envelope's root", () => {
      const { schema } = listSchema(Account, { primaryKey: "id", outputName: "account" });
      const envelope = wrapInEnvelope(describeSchema(schema));
      expect(envelope.properties).toEqual({
        value: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: ["string", "number"] }, account: { $ref: "#/$defs/Account" } },
            required: ["id", "account"],
          },
        },
      });
      expect(envelope.$defs).toEqual(accountDefs);
    });

    it("points a recursive schema's self-ref at the value field", () => {
      type Category = { name: string; children: Category[] };
      const Category: z.ZodType<Category> = z.object({
        name: z.string(),
        get children() {
          return z.array(Category);
        },
      });
      expect(wrapInEnvelope(describeSchema(Category)).properties).toEqual({
        value: {
          type: "object",
          properties: { name: { type: "string" }, children: { type: "array", items: { $ref: "#/properties/value" } } },
          required: ["name", "children"],
        },
      });
    });

    it("points local refs outside the definitions at the value field, in the definitions too", () => {
      const envelope = wrapInEnvelope({
        properties: { a: { $ref: "#/properties/b" }, b: { $ref: "#anchor" }, c: { $ref: "other.json#/x" } },
        definitions: { row: { $ref: "#" }, cell: { $ref: "#/definitions/row" } },
      });
      expect(envelope.properties).toEqual({
        value: {
          properties: {
            a: { $ref: "#/properties/value/properties/b" },
            b: { $ref: "#anchor" },
            c: { $ref: "other.json#/x" },
          },
        },
      });
      expect(envelope.definitions).toEqual({
        row: { $ref: "#/properties/value" },
        cell: { $ref: "#/definitions/row" },
      });
    });

    it("leaves a $ref property name and a literal $ref value alone", () => {
      const literal = { $ref: "#" };
      expect(
        wrapInEnvelope({ properties: { $ref: { const: literal } } }).properties,
      ).toEqual({ value: { properties: { $ref: { const: literal } } } });
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
      reusablePrefix: inPromptPrompt.reusablePrefix,
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
    expect(result).toEqual({
      success: false,
      error: "not logged in",
      reason: "not logged in",
      attempts: 1,
      prompt: inPromptPrompt,
    });
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
      expect(result.reason).toMatch(/^Validation failed/);
      expect(result.attempts).toBe(3);
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

  it("returns the schema's parsed value, with defaults filled in and unknown keys dropped", async () => {
    const schema = z.object({ city: z.string(), country: z.string().default("France") });
    const engine = scriptedEngine([text('{"city":"Paris","nickname":"City of Light"}')]);
    const result = await runCast(engine, { ...request, schema, jsonSchema: describeSchema(schema) }, silentLogger);
    expect(result).toMatchObject({ success: true, data: { city: "Paris", country: "France" } });
  });

  it("says why an answer does not fit the schema", async () => {
    const engine = scriptedEngine([text('"seven"'), text('"seven"'), text('"seven"')]);
    const pending = cast(engine);
    await jest.runAllTimersAsync();
    expect(await pending).toMatchObject({
      success: false,
      reason: expect.stringContaining("expected number, received string"),
    });
  });
});
