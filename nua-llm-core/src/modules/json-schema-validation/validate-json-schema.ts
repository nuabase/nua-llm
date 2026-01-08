import { getErrorMessageFromException } from "../../lib/error-utils";
import { NuaValidationError } from "../../lib/nua-errors";
import { ajvInstances } from "./ajv-instances";

export const validateJsonSchema = (
  schema: Object,
): true | NuaValidationError => {
  // Validate whether there is a $schema property in the schema; don't crash if value undefined or null
  if (!schema || typeof schema !== "object") {
    return {
      kind: "validation-error",
      message: "Schema must be a valid object",
    };
  }

  const ajvInstance = ajvInstances.getInstanceForSchema(schema);
  const isValidSchema = ajvInstance.validateSchema(schema);

  let errors = "";
  if (ajvInstance.errors) {
    errors = ajvInstance.errors
      .map((e) => JSON.stringify(e, null, 2))
      .join("; ");
  } else if (isValidSchema) {
    // validateSchema doesn't seem to catch any errors, so we need to compile the schema to get the errors
    try {
      ajvInstance.compile(schema);
      return true;
    } catch (e) {
      errors = getErrorMessageFromException(e);
    }
  } else {
    errors = "unexpected-situation-no-errors-found-for-invalid-schema";
  }

  return {
    kind: "validation-error",
    message: `Unable to validate JSON schema: ${errors}`,
  };
};
