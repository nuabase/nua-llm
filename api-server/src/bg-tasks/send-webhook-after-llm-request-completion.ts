import { svixClient } from "#lib/svix-client";
import "../register-path-aliases";
import { dbConsoleMain, dbLlmMain } from "#lib/db";
import { getErrorMessageFromZodParse } from "#lib/zod-utils";
import executeLlmRequest from "#modules/execute-llm-request/execute-llm-request";
import { LlmRequestModel } from "../models/llm-request-model";
import { UsersModel } from "../models/users-model";
import { Task } from "graphile-worker";
import * as z from "zod";

const jobParamsSchema = z.object({
  llm_request_id: z.string().min(1),
});

export type JobParams = z.infer<typeof jobParamsSchema>;

const taskExecutor: Task = async function (payload, helpers) {
  // NOTE: We'll return without raising an error for any unrecoverable errors because there is no point in retrying them

  const parseResult = jobParamsSchema.safeParse(payload);
  if (!parseResult.success) {
    const errorMessage = getErrorMessageFromZodParse(parseResult.error);
    const message = `unexpected-situation. Failed to validate internal job payload: ${errorMessage}`;
    helpers.logger.error(message);
    return;
  }

  const params = parseResult.data;

  const llmTable = new LlmRequestModel();
  const llmRequest = await llmTable.findById_noUserAuth(params.llm_request_id);

  if (!llmRequest) {
    const message = `unexpected-situation. Failed to find llmRequest from internal job payload. llmRequestId: ${params.llm_request_id}`;
    helpers.logger.error(message);
    return;
  }

  if (!llmRequest.result) {
    const message = `unexpected-situation. LLM request record result is empty. llmRequestId: ${params.llm_request_id}`;
    helpers.logger.error(message);
    return;
  }

  const userId = llmRequest.user_id;
  const user = await new UsersModel().findById(userId);

  if (!user) {
    const message = `unexpected-situation. Failed to find user from internal job payload. user_id: ${userId}`;
    helpers.logger.error(message);
    return;
  }

  if (!user.svix_uid) {
    const message = `unexpected-situation. User has no svix_uid. user_id: ${userId}`;
    helpers.logger.error(message);
    return;
  }

  try {
    await svixClient.message.create(user.svix_uid, {
      eventType: "nuabase.llm_request.completed",
      payload: {
        type: "nuabase.llm_request.completed",
        llm_request_id: params.llm_request_id,
        response: JSON.parse(llmRequest.result),
        attempt: 2,
      },
    });
  } catch (e) {
    const message = `Failed to send webhook to svix. user_id: ${userId}, llm_request_id: ${params.llm_request_id}`;
    helpers.logger.error(message);
    throw e;
  }

  await llmTable.update(llmRequest.id, { webhook_status: "sent" });
};

export default taskExecutor;
