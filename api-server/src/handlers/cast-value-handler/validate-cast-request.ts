import {
  CastValueRequestParams,
  ValidCastValueRequestParams,
} from "#handlers/cast-value-handler/cast-value-request.type";
import { nullToUndefined_forObject } from "#lib/empty-utils";
import { isNuaValidationError, NuaValidationError } from "nua-llm-core";
import { validateJsonSchema } from "nua-llm-core";
import { parseCanonicalModelName } from "nua-llm-core";

export const validateCastValueRequestParams = (
  params: CastValueRequestParams,
): ValidCastValueRequestParams | NuaValidationError => {
  const { input, output } = params;

  if (!(input && input.prompt)) {
    return {
      kind: "validation-error",
      message: "input.prompt must be provided",
    };
  }

  if (!(output && output.schema && typeof output.schema == "object")) {
    return {
      kind: "validation-error",
      message: "output.schema must exist and be a valid JSON schema object",
    };
  }

  if (!(typeof output.name === "string" && output.name.length > 0)) {
    return {
      kind: "validation-error",
      message: "output.name must be a non-empty string",
    };
  }

  const schemaValidation = validateJsonSchema(output.schema);
  if (isNuaValidationError(schemaValidation)) {
    return schemaValidation;
  }

  const notifications: ValidCastValueRequestParams["notify"] =
    nullToUndefined_forObject(params["notify"]);

  const model = parseCanonicalModelName(params.model);
  if (isNuaValidationError(model)) {
    return model;
  }

  const options = {
    invalidateCache: params.options?.invalidateCache ?? false,
  };

  return {
    kind: "valid-cast-value-request-params",
    input: {
      prompt: input.prompt,
      data: input.data,
    },
    output: {
      name: output.name,
      schema: output.schema,
      effectiveSchema: output.schema, // no runtime modification on the expected schema, since this is a "cast" operation; array operation would do wrapping
    },
    notify: notifications,
    options: options,
    model: model,
  };
};
