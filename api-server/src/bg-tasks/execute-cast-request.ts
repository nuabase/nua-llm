import "../register-path-aliases";
import { dbConsoleMain } from "#lib/db";
import { getErrorMessageFromZodParse } from "#lib/zod-utils";
import executeLlmRequest from "#modules/execute-llm-request/execute-llm-request";
import { UsersModel } from "../models/users-model";
import { Task } from "graphile-worker";
import * as z from "zod";

const executeCastRequestJobParamsSchema = z.object({
  user_id: z.string().min(1),
  id: z.string().min(1),
});

export type ExecuteCastRequestJobParams = z.infer<
  typeof executeCastRequestJobParamsSchema
>;

const taskExecutor: Task = async function (payload, helpers) {
  const parseResult = executeCastRequestJobParamsSchema.safeParse(payload);
  if (!parseResult.success) {
    const errorMessage = getErrorMessageFromZodParse(parseResult.error);
    const message = `unexpected-situation. Failed to validate execute-cast-request internal job payload: ${errorMessage}`;
    helpers.logger.error(message);
    throw new Error(message);
  }

  const params = parseResult.data;
  const user = await new UsersModel().findById(params.user_id);

  if (!user) {
    const message = `unexpected-situation. Failed to find user from internal job payload. user_id: ${params.user_id}`;
    helpers.logger.error(message);
    throw new Error(message);
  }

  if (!user.confirmed_at) {
    const message = `unexpected-situation. Internal job payload refers to unconfirmed user. user_id: ${params.user_id}`;
    helpers.logger.error(message);
    throw new Error(message);
  }

  await executeLlmRequest(params.id, user, helpers);
};

export default taskExecutor;
