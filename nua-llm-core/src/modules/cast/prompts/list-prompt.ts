import { replaceTemplateVarName, templateVarName } from "../../../lib/prompt-template-utils";
import { SchemaEnforcementKind } from "../../engine/llm-engine";
import { ListCastRequest, RenderedPrompt } from "../cast-request";
import { ENVELOPE_KEY } from "../envelope";

const DESCRIBE_OUTPUT = [
  `Your task is to transform the provided <input-data> into a JSON array, that represents a list of`,
  `${templateVarName("OUTPUT_TYPE_NAME")}. The schema for this JSON array is defined below in <json-schema-spec> for you reference.`,
  `It uses the JSON Schema spec.`,
];

const MATCH_PRIMARY_KEYS = [
  `Note that the primary key of each element in the input-data is '${templateVarName("PRIMARY_KEY")}'. In the output JSON array,`,
  `each object should have the same key with the same value of the original data, so we can map the input element against the output element.`,
];

// The LLM response seems better (concise and to-the point) when there is an output type name.
// The in-prompt text is stored with API requests; keep it unchanged.
const SYSTEM_PROMPTS: Record<SchemaEnforcementKind, string> = {
  "in-prompt": [
    ...DESCRIBE_OUTPUT,
    `Respond with only the instance, not the schema. It should not be wrapped in any wrapper object -- return exactly what the JSON schema is expecting.`,
    `Your entire response should be just the value of the JSON array containing objects with '${templateVarName("OUTPUT_TYPE_NAME")}'`,
    `and its primary key '${templateVarName("PRIMARY_KEY")}', as valid JSON.`,
    `We will validate the result with the AJV Node library, using ajv.parse, against the JSON schema, and we expect it to validate correctly.`,
    ...MATCH_PRIMARY_KEYS,
  ].join(" "),
  native: [
    ...DESCRIBE_OUTPUT,
    `Respond with only the instance, not the schema. Your reply is enforced by a JSON schema that wraps the result in an object:`,
    `put the JSON array, containing objects with '${templateVarName("OUTPUT_TYPE_NAME")}' and its primary key '${templateVarName("PRIMARY_KEY")}', in its "${ENVELOPE_KEY}" field.`,
    `We will validate the "${ENVELOPE_KEY}" field with the AJV Node library against the JSON schema, and we expect it to validate correctly.`,
    ...MATCH_PRIMARY_KEYS,
  ].join(" "),
};

export function renderListPrompt(cast: ListCastRequest, enforcement: SchemaEnforcementKind): RenderedPrompt {
  const withPrimaryKey = replaceTemplateVarName(SYSTEM_PROMPTS[enforcement], "PRIMARY_KEY", cast.primaryKey);
  const system = replaceTemplateVarName(withPrimaryKey, "OUTPUT_TYPE_NAME", cast.outputName);
  const full = [
    cast.prompt || "Transform the provided data according to the schema.",
    system,
    `<json-schema-spec> ${JSON.stringify(cast.schema)} </json-schema-spec>`,
    `<input-data>${JSON.stringify(cast.rows)}</input-data>`,
  ].join("\n");
  return { system, full };
}
