import { CastValuePromptInput } from "../../lib/types";
import {
  replaceTemplateVarName,
  templateVarName,
} from "../../lib/prompt-template-utils";

const builder = () => {
  // The LLM response seems better (concise and to-the point) when there is an output type name.
  const BASE_SYSTEM_PROMPT_WHEN_OUTPUT_TYPE_NAME_PROVIDED = [
    `Please respond with a single JSON object that represents '${templateVarName("OUTPUT_TYPE_NAME")}'.`,
    `The schema for this object (which uses the JSON Schema spec), is defined below for your reference.`,
    `Your task is to create an instance of this object. Respond with only the instance, not the schema.`,
    `Your entire response should be just the value of '${templateVarName("OUTPUT_TYPE_NAME")}', as valid JSON.`,
    `And it should not be wrapped in any wrapper object -- return exactly what the JSON schema is expecting.`,
    `We will validate the result with the AJV Node library, using ajv.parse, against the given schema, and we expect`,
    `it to validate correctly.`,
  ].join(" ");

  const buildSystemPrompt = (reqParams: CastValuePromptInput): string => {
    let a = BASE_SYSTEM_PROMPT_WHEN_OUTPUT_TYPE_NAME_PROVIDED;
    a = replaceTemplateVarName(a, "OUTPUT_TYPE_NAME", reqParams.output.name);
    return a;
  };

  const buildFullPrompt = (reqParams: CastValuePromptInput): string => {
    const { prompt, data } = reqParams.input;
    const { effectiveSchema } = reqParams.output;

    const fullPrompt = [
      prompt || "Transform the provided data according to the schema.", // user prompt
      buildSystemPrompt(reqParams),
      `<json-schema-spec> ${JSON.stringify(effectiveSchema)} </json-schema-spec>`,
      data ? `<input-data>${JSON.stringify(data)}</input-data>` : "",
    ].join("\n");
    return fullPrompt;
  };

  return {
    buildSystemPrompt,
    buildFullPrompt,
  };
};

const castPromptBuilder = builder();

export default castPromptBuilder;
