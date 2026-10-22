import { z } from "zod";
import { renderPrompt } from "../modules/cast/prompts/render-prompt";

// Pins the in-prompt text, so it does not change by accident.
// These strings are the prompts from before native schema enforcement was added, except that
// they no longer name AJV now that results are validated with Zod.

describe("renderPrompt", () => {
  it("renders the in-prompt value prompt", () => {
    const prompt = renderPrompt(
      {
        kind: "value",
        prompt: "Extract the city",
        data: { text: "I live in Paris" },
        outputName: "city",
        schema: z.string(),
        jsonSchema: { type: "string" },
        maxTokens: 100,
      },
      "in-prompt",
    );
    expect(prompt.full).toBe(
      "Extract the city\nPlease respond with a single JSON object that represents 'city'. The schema for this object (which uses the JSON Schema spec), is defined below for your reference. Your task is to create an instance of this object. Respond with only the instance, not the schema. Your entire response should be just the value of 'city', as valid JSON. And it should not be wrapped in any wrapper object -- return exactly what the JSON schema is expecting. We will validate the result against the given schema, and we expect it to validate correctly. IMPORTANT: Output raw JSON only. No markdown code fences, no explanation, no commentary, no extra fields beyond the schema. Do not correct yourself -- produce the right answer on the first try.\n<json-schema-spec> {\"type\":\"string\"} </json-schema-spec>\n<input-data>{\"text\":\"I live in Paris\"}</input-data>",
    );
    expect(prompt.full.split("\n")[1]).toBe(prompt.system);
    expect(prompt.full).toBe(`${prompt.reusablePrefix}\n<input-data>{"text":"I live in Paris"}</input-data>`);
  });

  it("renders the in-prompt list prompt", () => {
    const prompt = renderPrompt(
      {
        kind: "list",
        prompt: "Pick the account",
        rows: [{ id: 1, text: "NOPII RESTAURANT sample" }],
        primaryKey: "id",
        outputName: "account",
        schema: z.array(z.unknown()),
        jsonSchema: { type: "array" },
        maxTokens: 100,
      },
      "in-prompt",
    );
    expect(prompt.full).toBe(
      "Pick the account\nYour task is to transform the provided <input-data> into a JSON array, that represents a list of account. The schema for this JSON array is defined below in <json-schema-spec> for you reference. It uses the JSON Schema spec. Respond with only the instance, not the schema. It should not be wrapped in any wrapper object -- return exactly what the JSON schema is expecting. Your entire response should be just the value of the JSON array containing objects with 'account' and its primary key 'id', as valid JSON. We will validate the result against the JSON schema, and we expect it to validate correctly. Note that the primary key of each element in the input-data is 'id'. In the output JSON array, each object should have the same key with the same value of the original data, so we can map the input element against the output element.\n<json-schema-spec> {\"type\":\"array\"} </json-schema-spec>\n<input-data>[{\"id\":1,\"text\":\"NOPII RESTAURANT sample\"}]</input-data>",
    );
    expect(prompt.full.split("\n")[1]).toBe(prompt.system);
    expect(prompt.full).toBe(
      `${prompt.reusablePrefix}\n<input-data>[{"id":1,"text":"NOPII RESTAURANT sample"}]</input-data>`,
    );
  });

  it("makes the whole prompt reusable when a value cast has no data", () => {
    const prompt = renderPrompt(
      { kind: "value", prompt: "p", data: null, outputName: "days", schema: z.number(), jsonSchema: { type: "number" }, maxTokens: 100 },
      "in-prompt",
    );
    expect(prompt.full).toBe(`${prompt.reusablePrefix}\n`);
    expect(prompt.reusablePrefix).toContain("</json-schema-spec>");
  });

  it("tells the model about the envelope when the schema is enforced natively", () => {
    const prompt = renderPrompt(
      { kind: "value", prompt: "p", data: null, outputName: "days", schema: z.number(), jsonSchema: { type: "number" }, maxTokens: 100 },
      "native",
    );
    expect(prompt.system).toContain('in its "value" field');
    expect(prompt.system).not.toContain("should not be wrapped");
  });
});
