import {
  LlmRequestStatus,
  LlmRequestType,
  SseRequestStatus,
  WebhookRequestStatus,
} from "../../models/llm-request-model";

// REMEMBER: Any changes here must be reflected in the types for the TS SDK.
export type ApiResponseLlmRequest = {
  id: string;
  requestType: LlmRequestType;
  llmStatus: LlmRequestStatus;
  sseStatus: SseRequestStatus;
  webhookStatus: WebhookRequestStatus;
  input: {
    prompt: string | null;
    data: string | null;
    primaryKey: string | null;
  };
  output: {
    name: string;
    schema: string;
    effectiveSchema: string;
  };
  result: object | undefined | null;
  error: string | null;
  fullPrompt: string;
  model: string;
  provider: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
