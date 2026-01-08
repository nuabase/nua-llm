import { ValidCastArrayRequestParams } from "#handlers/cast-array-handler/cast-array-request.type";
import { ValidCastValueRequestParams } from "#handlers/cast-value-handler/cast-value-request.type";
import { dbLlmMain } from "#lib/db";
import { getErrorMessageFromException } from "#lib/error-utils";
import { isNuaValidationError } from "nua-llm-core";
import { NuaJobHelpers } from "#modules/execute-llm-request/execute-llm-request";
import {
  CanonicalModelName,
  parseCanonicalModelName,
} from "nua-llm-core";
import { Knex } from "knex";
import { User } from "../users-model";
import { castArrayPromptBuilder, castPromptBuilder } from "nua-llm-core";

/* Mapped to the llm_requests table in console/db/llm_main_schema.rb */
export type LlmRequestStatus = "pending" | "processing" | "success" | "failed";
export type SseRequestStatus = "n/a" | "pending" | "sent" | "failed";
export type WebhookRequestStatus = "n/a" | "pending" | "sent" | "failed";

export interface LlmRequest {
  id: string;
  request_type: LlmRequestType;
  user_id: string;
  end_consumer_id: string | null;
  llm_status: LlmRequestStatus;
  sse_status: SseRequestStatus;
  webhook_status: WebhookRequestStatus;
  input_prompt: string | null;
  input_data: string | null;
  input_primary_key: string | null;
  output_schema: string;
  output_name: string;
  output_effective_schema: string;
  system_prompt: string;
  full_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number;
  max_retries: number;
  provider: string;
  invalidate_cache: boolean;
  result: string | null;
  error: string | null;
  llm_usage_prompt_tokens: number | null;
  llm_usage_completion_tokens: number | null;
  llm_usage_total_tokens: number | null;
  cache_usage_prompt_tokens: number | null;
  cache_usage_completion_tokens: number | null;
  cache_usage_total_tokens: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type LlmRequestType = "cast/value" | "cast/array";

export type UpdateLlmRequest = Partial<
  Omit<LlmRequest, "id" | "created_at" | "updated_at">
>;

type CreateParams =
  | { requestType: "cast/value"; reqParams: ValidCastValueRequestParams }
  | {
    requestType: "cast/array";
    reqParams: ValidCastArrayRequestParams;
  };

export class LlmRequestModel {
  private db: Knex = dbLlmMain;

  constructor() { }

  async create(user: User, endConsumerId: string | null, createParams: CreateParams): Promise<LlmRequest> {
    const { requestType, reqParams } = createParams;
    const now = new Date();

    const webhookRequestStatus: WebhookRequestStatus = reqParams.notify
      ?.webhookUrl
      ? "pending"
      : "n/a";

    // We always publish SSE events to a channel, whether there is someone listening or not.
    const sseRequestStatus: SseRequestStatus = "pending";

    let systemPrompt, fullPrompt, primaryKey;
    switch (requestType) {
      case "cast/value": {
        const { buildSystemPrompt, buildFullPrompt } = castPromptBuilder;
        systemPrompt = buildSystemPrompt(reqParams);
        fullPrompt = buildFullPrompt(reqParams);
        break;
      }
      case "cast/array": {
        const { buildSystemPrompt, buildFullPrompt } = castArrayPromptBuilder;
        primaryKey = reqParams.input.primaryKey;
        systemPrompt = buildSystemPrompt(primaryKey, reqParams.output.name);
        fullPrompt = ""; // We're not going to save the full prompt for mapped requests, because if some rows have
        // cache hit, we will exclude them from the LLM request. So we'll save the prompt only after the request is made.
        break;
      }
      default: {
        const _exhaustive: never = requestType;
        throw new Error(`Unhandled request type: ${_exhaustive}`);
      }
    }

    const requestData: Omit<LlmRequest, "id"> = {
      user_id: user.id,
      end_consumer_id: endConsumerId,
      request_type: requestType,
      input_prompt: reqParams.input.prompt,
      input_data: reqParams.input.data
        ? JSON.stringify(reqParams.input.data)
        : null,
      input_primary_key: primaryKey || null,
      output_name: reqParams.output.name,
      output_schema: JSON.stringify(reqParams.output.schema),
      output_effective_schema: JSON.stringify(reqParams.output.effectiveSchema),
      system_prompt: systemPrompt,
      full_prompt: fullPrompt,
      llm_status: "pending",
      webhook_status: webhookRequestStatus,
      sse_status: sseRequestStatus,
      error: null,
      result: null,
      model: reqParams.model,
      max_tokens: 8192,
      temperature: 0.7,
      max_retries: 2,
      provider: "openrouter",
      invalidate_cache: reqParams.options.invalidateCache,
      started_at: null,
      finished_at: null,
      llm_usage_completion_tokens: null,
      llm_usage_prompt_tokens: null,
      llm_usage_total_tokens: null,
      cache_usage_prompt_tokens: null,
      cache_usage_completion_tokens: null,
      cache_usage_total_tokens: null,
      created_at: now,
      updated_at: now,
    };

    const [insertedRecord] = await this.db("llm_requests")
      .insert(requestData)
      .returning("*");
    return insertedRecord;
  }

  async findById_noUserAuth(id: string): Promise<LlmRequest | null> {
    const request = await this.db("llm_requests").where({ id }).first();
    return request || null;
  }

  async findById(id: string, user: User): Promise<LlmRequest | null> {
    const request = await this.db("llm_requests")
      .where({ id, user_id: user.id })
      .first();
    return request || null;
  }

  async update(id: string, data: UpdateLlmRequest): Promise<LlmRequest | null> {
    const [updatedRecord] = await this.db("llm_requests")
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning("*");
    return updatedRecord || null;
  }

  // Raises if any condition needed to start execution is not met.
  // Returns null if the job should not be retried.
  async beginExecutionExn(
    id: string,
    user: User,
    helpers: NuaJobHelpers,
  ): Promise<{
    llmRequest: LlmRequest;
    effectiveSchema: object;
    model: CanonicalModelName;
  } | null> {
    const llmRequest = await this.findById(id, user);
    if (!llmRequest) {
      const message = `unexpected-situation. In executeCastRequest task execution, failed to find LLM request with id ${id}`;
      helpers.logger.error(message);
      throw new Error(message);
    }

    if (llmRequest.llm_status !== "pending") {
      const message = `unexpected-situation. Not processing job because LLM request with id ${id} is not in pending status. It is ${llmRequest.llm_status}`;
      helpers.logger.error(message);
      // We don't throw an error because we don't want to retry this job. And this is anyway
      // an unexpected situation and shouldn't happen anyway. If it does, we'll look at the log and
      // fix it.
      return null;
    }

    const model = parseCanonicalModelName(llmRequest.model);
    if (isNuaValidationError(model)) {
      const message = `unexpected-situation. Not processing job because LLM request with id ${id} has an invalid model: ${llmRequest.model}`;
      helpers.logger.error(message);
      return null; // no retry
    }

    await this.update(llmRequest.id, {
      llm_status: "processing",
      started_at: new Date(),
    });

    let effectiveSchema;
    try {
      effectiveSchema = JSON.parse(llmRequest.output_effective_schema);
    } catch (e) {
      const emsg = getErrorMessageFromException(e);
      const message = `unexpected-situation. Failed to parse effective_schema JSON for request ${id}: ${emsg}`;
      helpers.logger.error(message);
      await this.update(llmRequest.id, {
        llm_status: "failed",
        error: emsg,
        finished_at: new Date(),
      });
      return null;
    }

    return { llmRequest, effectiveSchema, model };
  }
}
