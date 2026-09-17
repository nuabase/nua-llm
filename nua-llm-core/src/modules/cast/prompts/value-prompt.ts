import { replaceTemplateVarName, templateVarName } from "../../../lib/prompt-template-utils";
import { SchemaEnforcementKind } from "../../engine/llm-engine";
import { RenderedPrompt, ValueCastRequest } from "../cast-request";
import { ENVELOPE_KEY } from "../envelope";

const DESCRIBE_OUTPUT = [
  `Please respond with a single JSON object that represents '${templateVarName("OUTPUT_TYPE_NAME")}'.`,
  `The schema for this object (which uses the JSON Schema spec), is defined below for your reference.`,
  `Your task is to create an instance of this object. Respond with only the instance, not the schema.`,
];

// The LLM response seems better (concise and to-the point) when there is an output type name.
// The in-prompt text is stored with API requests; keep it unchanged.
const SYSTEM_PROMPTS: Record<SchemaEnforcementKind, string> = {
  "in-prompt": [
    ...DESCRIBE_OUTPUT,
    `Your entire response should be just the value of '${templateVarName("OUTPUT_TYPE_NAME")}', as valid JSON.`,
    `And it should not be wrapped in any wrapper object -- return exactly what the JSON schema is expecting.`,
    `We will validate the result with the AJV Node library, using ajv.parse, against the given schema, and we expect`,
    `it to validate correctly.`,
    `IMPORTANT: Output raw JSON only. No markdown code fences, no explanation, no commentary, no extra fields beyond the schema. Do not correct yourself -- produce the right answer on the first try.`,
  ].join(" "),
  native: [
    ...DESCRIBE_OUTPUT,
    `Your reply is enforced by a JSON schema that wraps the result in an object:`,
    `put the value of '${templateVarName("OUTPUT_TYPE_NAME")}' in its "${ENVELOPE_KEY}" field.`,
    `We will validate the "${ENVELOPE_KEY}" field with the AJV Node library against the schema below, and we expect`,
    `it to validate correctly.`,
  ].join(" "),
};

export function renderValuePrompt(cast: ValueCastRequest, enforcement: SchemaEnforcementKind): RenderedPrompt {
  const system = replaceTemplateVarName(SYSTEM_PROMPTS[enforcement], "OUTPUT_TYPE_NAME", cast.outputName);
  const full = [
    cast.prompt || "Transform the provided data according to the schema.",
    system,
    `<json-schema-spec> ${JSON.stringify(cast.schema)} </json-schema-spec>`,
    cast.data ? `<input-data>${JSON.stringify(cast.data)}</input-data>` : "",
  ].join("\n");
  return { system, full };
}
