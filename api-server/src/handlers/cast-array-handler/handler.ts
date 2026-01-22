import type { ExecuteCastRequestJobParams } from "#bg-tasks/execute-cast-request";
import {
  CastArrayRequestParams,
  ValidCastArrayRequestParams,
} from "#handlers/cast-array-handler/cast-array-request.type";
import { validateCastArrayRequestParams } from "#handlers/cast-array-handler/validate-cast-array-request";
import { sendUnauthorized_unlessUser } from "#handlers/user-request-gating";
import { workerUtils } from "#lib/graphile-worker-utils";
import { wrapArraySchema } from "nua-llm-core";
import { isNuaValidationError, NuaValidationError } from "nua-llm-core";
import executeLlmRequest from "#modules/execute-llm-request/execute-llm-request";
import { validateJsonSchema } from "nua-llm-core";
import { Request, Response as ExpressResponse, Router } from "express";
import { sendBadRequest, sendServerError } from "../../lib/responders";
import { apiLogging } from "../../middleware/api-logging";
import { bearerApiKeyAuth } from "../../middleware/auth";
import { requestContext } from "../../middleware/request-context";
import {
  LlmRequestModel,
  LlmRequestType,
} from "../../models/llm-request-model";

const router = Router();

function addEffectiveSchema(
  validParams: Omit<ValidCastArrayRequestParams, "effectiveSchema">,
): ValidCastArrayRequestParams {
  return {
    ...validParams,
    output: {
      ...validParams.output,
      effectiveSchema: wrapArraySchema(
        validParams.output.schema as Record<string, unknown>,
        {
          primaryKey: validParams.input.primaryKey,
          outputName: validParams.output.name,
        },
      ),
    },
  };
}

async function createCastArrayRecord(
  req: Request,
  requestType: "cast/array",
  res: ExpressResponse,
) {
  const params: CastArrayRequestParams = req.body;

  const currentUser = sendUnauthorized_unlessUser(req, res);
  if (!currentUser) return;

  // Validates params as well as the JSON Schema
  const validParams = validateCastArrayRequestParams(params);
  if (isNuaValidationError(validParams)) {
    sendBadRequest(req, res, validParams.message);
    return null;
  }

  // The cast-array magic: make the schema an array of objects with the primary key and the root object
  // name as required properties.
  const requestParams = addEffectiveSchema(validParams);

  // Assertion
  const schemaValidation = validateJsonSchema(
    requestParams.output.effectiveSchema,
  );
  if (isNuaValidationError(schemaValidation)) {
    const err: NuaValidationError = {
      ...schemaValidation,
      message: `unexpected-situation. Wrapping schema into array schema form creates an invalid schema: ${schemaValidation.message}`,
    };
    sendServerError(req, res, err.message);
    return null;
  }

  const table = new LlmRequestModel();
  const newRecord = await table.create(currentUser, req.endConsumerId, {
    requestType,
    reqParams: requestParams,
  });
  req.ctx?.logger.info(`created llm_request with id ${newRecord.id}`);

  return newRecord;
}

router.post(
  "/",
  requestContext("POST /cast/array"),
  apiLogging("cast-array-handler"),
  bearerApiKeyAuth,
  async (req: Request, res: ExpressResponse) => {
    const currentUser = sendUnauthorized_unlessUser(req, res);
    if (!currentUser) return;

    const newRecord = await createCastArrayRecord(req, "cast/array", res);
    if (!newRecord) {
      return;
    }

    const jobPayload: ExecuteCastRequestJobParams = {
      user_id: currentUser.id,
      id: newRecord.id,
    };

    // Create a background job to process the LLM request
    workerUtils.addJob("execute-cast-request", jobPayload, { maxAttempts: 6 });

    res.json({ id: newRecord.id });
  },
);

router.post(
  "/now",
  requestContext("POST /cast/array/now"),
  apiLogging("cast-array-handler"),
  bearerApiKeyAuth,
  async (req: Request, res: ExpressResponse) => {
    const currentUser = sendUnauthorized_unlessUser(req, res);
    if (!currentUser) return;

    const newRecord = await createCastArrayRecord(req, "cast/array", res);
    if (!newRecord) {
      return;
    }

    // Execute the cast request immediately
    const transformedResult = await executeLlmRequest(
      newRecord.id,
      currentUser,
      {
        logger: req.ctx?.logger!,
        addJob: workerUtils.addJob,
      },
    );

    res.json(transformedResult);
  },
);

export default router;
