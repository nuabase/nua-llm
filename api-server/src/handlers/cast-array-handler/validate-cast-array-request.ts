import {
  CastArrayRequestParams,
  ValidCastArrayRequestParams,
} from "#handlers/cast-array-handler/cast-array-request.type";
import { validateMappableInputData } from "#handlers/cast-array-handler/validate-mappable-input-data";
import { validateCastValueRequestParams } from "#handlers/cast-value-handler/validate-cast-request";
import { nullToUndefined } from "#lib/empty-utils";
import { getErrorMessageFromException } from "#lib/error-utils";
import { isNuaValidationError, NuaValidationError } from "nua-llm-core";

function resolvePrimaryKey(v: unknown): string | NuaValidationError {
  // default to 'id' if not provided
  if (nullToUndefined(v) == undefined) return "id";

  if (typeof v === "string" && v.trim() !== "") return v.trim();

  return {
    kind: "validation-error",
    message: "input.primaryKey must be a non-empty string",
  };
}

export const validateCastArrayRequestParams = (
  params: CastArrayRequestParams,
):
  | Omit<ValidCastArrayRequestParams, "output.effectiveSchema">
  | NuaValidationError => {
  // All validations that apply to cast request applies here. So let's do that first.
  const baseValidatedParams = validateCastValueRequestParams({
    ...params,
    kind: "cast-value-request-params",
  });

  if (isNuaValidationError(baseValidatedParams)) return baseValidatedParams;

  // --- Now validations for array operation (NOTE: from the original params. we're validating, not parsing, so we're relying
  // on the original values.) ---->

  const { input, output } = params;

  // Determine the primary key to use for the data array
  const primaryKey = resolvePrimaryKey(input?.primaryKey);
  if (isNuaValidationError(primaryKey)) {
    return primaryKey;
  }

  // Because we're constructing a wrapped schema of array of objects, with each object being {<primaryKey>, <outputName>},
  // we can't have them be the same. The reason to do that is because I think the LLM will respond better with as much
  // semantically meaningful things we expect out of it. So the rare case of the primaryKey and outputName being the same
  // is going to be relegated.
  if (output?.name === primaryKey) {
    return {
      kind: "validation-error",
      message: "output.name must be different from the input.primaryKey",
    };
  }

  const inputData = validateMappableInputData(input?.data, primaryKey);
  if (isNuaValidationError(inputData)) {
    return inputData;
  }

  return {
    kind: "valid-cast-array-request-params",
    input: {
      prompt: baseValidatedParams.input.prompt,
      data: inputData,
      primaryKey: primaryKey,
    },
    output: {
      name: baseValidatedParams.output.name,
      schema: baseValidatedParams.output.schema,
      effectiveSchema: baseValidatedParams.output.schema,
    },
    notify: baseValidatedParams.notify,
    options: baseValidatedParams.options,
    model: baseValidatedParams.model,
  };
};
