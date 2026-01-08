import { CastArrayPromptInput, MappableInputData } from "../../lib/types";
import {
  replaceTemplateVarName,
  templateVarName,
} from "../../lib/prompt-template-utils";

const builder = () => {
  // The LLM response seems better (concise and to-the point) when there is an output type name.
  const BASE_SYSTEM_PROMPT_WHEN_OUTPUT_TYPE_NAME_PROVIDED = [
    `Your task is to transform the provided <input-data> into a JSON array, that represents a list of`,
    `${templateVarName("OUTPUT_TYPE_NAME")}. The schema for this JSON array is defined below in <json-schema-spec> for you reference.`,
    `It uses the JSON Schema spec.`,
    `Respond with only the instance, not the schema. It should not be wrapped in any wrapper object -- return exactly what the JSON schema is expecting.`,
    `Your entire response should be just the value of the JSON array containing objects with '${templateVarName("OUTPUT_TYPE_NAME")}'`,
    `and its primary key '${templateVarName("PRIMARY_KEY")}', as valid JSON.`,
    `We will validate the result with the AJV Node library, using ajv.parse, against the JSON schema, and we expect it to validate correctly.`,
    `Note that the primary key of each element in the input-data is '${templateVarName("PRIMARY_KEY")}'. In the output JSON array,`,
    `each object should have the same key with the same value of the original data, so we can map the input element against the output element.`,
  ].join(" ");

  const buildSystemPrompt = (
    primaryKey: string,
    outputName: string,
  ): string => {
    let a = BASE_SYSTEM_PROMPT_WHEN_OUTPUT_TYPE_NAME_PROVIDED;
    a = replaceTemplateVarName(a, "PRIMARY_KEY", primaryKey);
    a = replaceTemplateVarName(a, "OUTPUT_TYPE_NAME", outputName);
    return a;
  };

  const buildFullPrompt = (
    req: CastArrayPromptInput,
    uncachedInputDataRows: MappableInputData,
  ): string => {
    const prompt = req.input.prompt;
    const fullPrompt = [
      prompt || "Transform the provided data according to the schema.", // user prompt
      buildSystemPrompt(req.input.primaryKey, req.output.name),
      `<json-schema-spec> ${JSON.stringify(req.output.effectiveSchema)} </json-schema-spec>`,
      `<input-data>${JSON.stringify(uncachedInputDataRows)}</input-data>`,
    ].join("\n");
    return fullPrompt;
  };

  return {
    buildSystemPrompt,
    buildFullPrompt,
  };
};

const castArrayPromptBuilder = builder();

export default castArrayPromptBuilder;
