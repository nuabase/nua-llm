import { sendUnauthorized_unlessUser } from "#handlers/user-request-gating";
import { workerUtils } from "#lib/graphile-worker-utils";
import { isNuaError } from "nua-llm-core";
import { sseTokenAuth } from "#middleware/sse-token-auth";
import { Request, Response as ExpressResponse, Router } from "express";
import {
  sendNotFound,
  sendServerError,
  sendUnauthorized,
} from "../../lib/responders";
import { apiLogging } from "../../middleware/api-logging";
import { bearerApiKeyAuth } from "../../middleware/auth";
import { requestContext } from "../../middleware/request-context";
import { getLlmRequest } from "../requests-handler/get-request";

const router = Router();

router.get(
  "/:llm_request_id",
  requestContext("GET /sse/:llm_request_id"),
  apiLogging("sse-handler"),
  sseTokenAuth,
  async (req: Request, res: ExpressResponse) => {
    // TODO: check if this request is coming from Pushpin. there is an isGripRequest thing
    // in the pushpin node js library. The request headers seem to have:
    // grip-sig and grip-feature. I think we can decode grip-sig some jwt stuff, and figure
    // it out without any libraries.

    const { llm_request_id } = req.params;

    const currentUser = sendUnauthorized_unlessUser(req, res);
    if (!currentUser) return;

    const llmRequest = await getLlmRequest(llm_request_id, currentUser);

    if (!llmRequest) {
      return sendNotFound(
        req,
        res,
        `LLM request with id ${llm_request_id} not found`,
      );
    }

    if (isNuaError(llmRequest)) {
      sendServerError(req, res, llmRequest.message);
      return;
    }

    // If in case the job has already been completed (can happen if it is a cached response),
    // then we want to ensure the late connectors to the sse stream get the results. More on
    // this in the "happy path" comment in the job.
    await workerUtils.addJob(
      "send-sse-after-llm-request-completion",
      { llm_request_id: llmRequest.id },
      { maxAttempts: 3 },
    );

    // Pushpin API asking it to start an SSE connection with the original client
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Grip-Hold", "stream");
    res.setHeader("Grip-Channel", llm_request_id);
    res.status(200).send();
  },
);

export default router;
