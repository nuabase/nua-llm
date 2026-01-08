import type { ExecuteCastRequestJobParams } from "#bg-tasks/execute-cast-request";
import { CastValueRequestParams } from "#handlers/cast-value-handler/cast-value-request.type";
import { validateCastValueRequestParams } from "#handlers/cast-value-handler/validate-cast-request";
import { sendUnauthorized_unlessUser } from "#handlers/user-request-gating";
import { workerUtils } from "#lib/graphile-worker-utils";
import { isNuaValidationError } from "nua-llm-core";
import { buildSseUrl } from "#modules/execute-llm-request/build-sse-url";
import executeLlmRequest from "#modules/execute-llm-request/execute-llm-request";
import { Request, Response as ExpressResponse, Router } from "express";
import { sendBadRequest } from "../../lib/responders";
import { apiLogging } from "../../middleware/api-logging";
import { bearerApiKeyAuth } from "../../middleware/auth";
import { requestContext } from "../../middleware/request-context";
import { LlmRequestModel } from "../../models/llm-request-model";

const router = Router();

async function prepareCastRequest(
  req: Request,
  requestType: "cast/value",
  res: ExpressResponse,
) {
  const params: CastValueRequestParams = req.body;

  const currentUser = sendUnauthorized_unlessUser(req, res);
  if (!currentUser) return;

  // Validates params as well as the JSON Schema
  const validParams = validateCastValueRequestParams(params);
  if (isNuaValidationError(validParams)) {
    sendBadRequest(req, res, validParams.message);
    return null;
  }

  const table = new LlmRequestModel();
  const newRecord = await table.create(currentUser, req.endConsumerId, {
    requestType,
    reqParams: validParams,
  });
  req.ctx?.logger.info(`created llm_request with id ${newRecord.id}`);

  return newRecord;
}

router.post(
  "/",
  requestContext("POST /cast/value"),
  apiLogging("cast-handler"),
  bearerApiKeyAuth,
  async (req: Request, res: ExpressResponse) => {
    const currentUser = sendUnauthorized_unlessUser(req, res);
    if (!currentUser) return;

    const newRecord = await prepareCastRequest(req, "cast/value", res);
    if (!newRecord) {
      return;
    }

    const jobPayload: ExecuteCastRequestJobParams = {
      user_id: currentUser.id,
      id: newRecord.id,
    };

    // Create a background job to process the LLM request
    workerUtils.addJob("execute-cast-request", jobPayload, { maxAttempts: 6 });

    res.json({
      id: newRecord.id,
      sseUrl: buildSseUrl(newRecord.id, currentUser),
    });
  },
);

router.post(
  "/now",
  requestContext("POST /cast/value/now"),
  apiLogging("cast-handler"),
  bearerApiKeyAuth,
  async (req: Request, res: ExpressResponse) => {
    const currentUser = sendUnauthorized_unlessUser(req, res);
    if (!currentUser) return;

    const newRecord = await prepareCastRequest(req, "cast/value", res);
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
