import { ApiResponseLlmRequest } from "#handlers/requests-handler/types";
import { NuaInternalError } from "nua-llm-core";
import { LlmRequestModel } from "../../models/llm-request-model";
import { User } from "../../models/users-model";

export const getLlmRequest = async (
  llm_request_id: string,
  currentUser: User,
): Promise<NuaInternalError | ApiResponseLlmRequest | null> => {
  const table = new LlmRequestModel();
  const llmRequest = await table.findById(llm_request_id, currentUser);

  if (!llmRequest) {
    return null;
  }

  let jsonResult: undefined | object;
  if (llmRequest.llm_status === "success" && llmRequest.result) {
    try {
      jsonResult = JSON.parse(llmRequest.result);
    } catch {
      const err: NuaInternalError = {
        kind: "internal-error",
        message: "Unable to parse stored LLM result",
      };
      return err;
    }
  }

  const apiResponse: ApiResponseLlmRequest = {
    id: llmRequest.id,
    requestType: llmRequest.request_type,
    llmStatus: llmRequest.llm_status,
    sseStatus: llmRequest.sse_status,
    webhookStatus: llmRequest.webhook_status,
    input: {
      prompt: llmRequest.input_prompt,
      data: llmRequest.input_data,
      primaryKey: llmRequest.input_primary_key,
    },
    output: {
      name: llmRequest.output_name,
      schema: llmRequest.output_schema,
      effectiveSchema: llmRequest.output_effective_schema,
    },
    result: jsonResult,
    error: llmRequest.error,
    fullPrompt: llmRequest.full_prompt,
    model: llmRequest.model,
    provider: llmRequest.provider,
    startedAt: llmRequest.started_at,
    finishedAt: llmRequest.finished_at,
    createdAt: llmRequest.created_at,
    updatedAt: llmRequest.updated_at,
  };

  return apiResponse;
};
