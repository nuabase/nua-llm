import { sendUnauthorized_unlessUser } from "#handlers/user-request-gating";
import { Request, Response as ExpressResponse, Router } from "express";
import { sendNotFound, sendUnauthorized } from "../../lib/responders";
import { apiLogging } from "../../middleware/api-logging";
import { bearerApiKeyAuth } from "../../middleware/auth";
import { requestContext } from "../../middleware/request-context";
import { getLlmRequest } from "./get-request";

const router = Router();

router.get(
  "/:llm_request_id",
  requestContext("GET /requests/:llm_request_id"),
  apiLogging("requests-handler"),
  bearerApiKeyAuth,
  async (req: Request, res: ExpressResponse) => {
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

    res.json(llmRequest);
  },
);

export default router;
