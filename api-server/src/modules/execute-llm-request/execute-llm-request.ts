import { getErrorMessageFromException } from "#lib/error-utils";
import { executeCastArrayLlmRequest } from "#modules/execute-llm-request/cast-array/execute-cast-array-llm-request";
import { executeCastValueLlmRequest } from "#modules/execute-llm-request/cast-value/execute-cast-value-llm-request";
import {
  CastApiResponse,
  CastArrayApiResponse_Success,
  CastValueApiResponse_Success,
} from "#modules/execute-llm-request/types";
import { NormalizedUsage } from "nua-llm-core";
import { JobHelpers } from "graphile-worker";
import { Logger as WinstonLogger } from "winston";
import { LlmRequestModel } from "../../models/llm-request-model";
import { User } from "../../models/users-model";

// JobHelpers is the type that graphile-worker provides for the job payload. It has useful
// properties, but we only use logger. And we want to be able to use these functions from
// outside graphile-worker (for /cast/now for example). So a general purpose type for
// both loggers:
export type NuaJobHelpers = {
  logger: WinstonLogger | JobHelpers["logger"];
  addJob: JobHelpers["addJob"];
};

const isSuccessResponse = (
  response: CastApiResponse,
): response is CastArrayApiResponse_Success | CastValueApiResponse_Success =>
  "isSuccess" in response && response.isSuccess;

const getErrorFromResponse = (response: CastApiResponse): string | null =>
  "error" in response ? response.error : null;

const executeLlmRequest = async (
  llmRequestId: string,
  user: User,
  helpers: NuaJobHelpers,
): Promise<CastApiResponse> => {
  const { logger } = helpers;

  const table = new LlmRequestModel();
  const e = await table.beginExecutionExn(llmRequestId, user, helpers);
  let response: CastApiResponse;
  let shouldNotify: boolean;

  if (!e) {
    response = {
      error: `Unable to find the llmRequest ${llmRequestId} in the db`,
      isError: true,
    };
    shouldNotify = false;
  } else {
    shouldNotify = true;
    const { llmRequest, effectiveSchema, model } = e;

    try {
      if (llmRequest.request_type === "cast/value") {
        response = await executeCastValueLlmRequest(
          llmRequest,
          effectiveSchema,
          model,
        );
      } else if (llmRequest.request_type === "cast/array") {
        response = await executeCastArrayLlmRequest(
          llmRequest,
          effectiveSchema,
          model,
        );
      } else {
        const emsg = `Unknown request type ${llmRequest.request_type}`;
        logger.error(`unexpected-situation. ${emsg}`);
        response = { error: emsg, isError: true };
      }
    } catch (err) {
      const emsg = getErrorMessageFromException(err);
      logger.error(
        `unexpected-situation. callLLM failed. ${emsg}, llmRequest id: ${llmRequestId}`,
      );
      if (err instanceof Error)
        logger.error(JSON.stringify(err.stack, null, 2));
      response = { error: `internal error ${emsg}`, isError: true };
    }

    const finishedAt = new Date();
    const success = isSuccessResponse(response);
    const successResponse = success
      ? (response as CastArrayApiResponse_Success | CastValueApiResponse_Success)
      : undefined;
    const usage: NormalizedUsage | undefined = successResponse?.llmUsage;
    const cacheUsage: NormalizedUsage | undefined = successResponse?.cacheUsage;

    await table.update(llmRequest.id, {
      result: JSON.stringify(response),
      llm_status: success ? "success" : "failed",
      error: success ? null : getErrorFromResponse(response),
      finished_at: finishedAt,
      llm_usage_prompt_tokens: usage?.promptTokens ?? null,
      llm_usage_completion_tokens: usage?.completionTokens ?? null,
      llm_usage_total_tokens: usage?.totalTokens ?? null,
      cache_usage_prompt_tokens: cacheUsage?.promptTokens ?? null,
      cache_usage_completion_tokens: cacheUsage?.completionTokens ?? null,
      cache_usage_total_tokens: cacheUsage?.totalTokens ?? null,
    });
  }

  if (shouldNotify) {
    // FIXME: We might not need webhooks after all, since we're switching to be
    //  a front-end LLM runtime. Jasim 18-Nov-2025
    //
    // await helpers.addJob(
    //   "send-webhook-after-llm-request-completion",
    //   { llm_request_id: llmRequestId },
    //   { maxAttempts: 6 },
    // );

    await helpers.addJob(
      "send-sse-after-llm-request-completion",
      { llm_request_id: llmRequestId },
      { maxAttempts: 3 },
    );
  }

  return response;
};

export default executeLlmRequest;
