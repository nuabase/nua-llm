import "../register-path-aliases";
import { getErrorMessageFromZodParse } from "#lib/zod-utils";
import { config } from "#lib/config";
import { nuaFetch } from "#lib/http-utils";
import { NuaJobHelpers } from "#modules/execute-llm-request/execute-llm-request";
import { LlmRequest, LlmRequestModel } from "../models/llm-request-model";
import { Task } from "graphile-worker";
import { randomUUID } from "crypto";
import * as z from "zod";

const jobParamsSchema = z.object({
  llm_request_id: z.string().min(1),
});

export type JobParams = z.infer<typeof jobParamsSchema>;

// This action: close thing is for signalling Pushpin. It'll send the appropriate SSE event to the client.
const terminateSseStreamPayload = (llmRequestId: string) => ({
  items: [
    {
      channel: llmRequestId,
      id: randomUUID(),
      formats: { "http-stream": { action: "close" } },
    },
  ],
});

const publishPayload = (llmRequest: LlmRequest, helpers: NuaJobHelpers) => {
  if (!llmRequest.result) {
    const message = `unexpected-situation. LLM request record result is empty. llmRequestId: ${llmRequest.id}`;
    helpers.logger.error(message);
    return;
  }

  const sseEventType = `nuabase.llm_request.${llmRequest.llm_status}`;
  const eventPayload = {
    ...JSON.parse(llmRequest.result), // we could in the future do a Zod parsing against CastApiResponse, but for now
    sseEventType: sseEventType, // we'll assume the data is correct. The issue is if the schema evolves.. will have to
    // do this sooner or later, since we'll have cached data in redis, and if the schema has changed since then, the
    // clients might get older or newer version.
  };

  // The SSE event name is "message", so client code can be simple and just do EventSource.onmessage; if instead it was
  // the more specific eventPayload.type, then browser has to do `eventSource.addEventListener("nuabase.llm_request.completed")`.
  // But .onmessage is what all SSE tutorials show - it fires when event type is `message`, or empty. So we'll stick to it.
  const sseContent = [
    `event: message`,
    `id: ${randomUUID()}`,
    `data: ${JSON.stringify(eventPayload)}`,
    "",
  ].join("\n");

  // Note that this is the type Pushpin expects; the actual SSE payload is in `formats.http-stream-content`
  // https://pushpin.org/docs/usage/#publishing
  const publishPayload = {
    items: [
      {
        channel: llmRequest.id,
        id: randomUUID(),
        "prev-id": "",
        formats: { "http-stream": { content: `${sseContent}\n\n` } }, // Note the \n\n -- it is required for one message termination in SSE
      },
    ],
  };

  return publishPayload;
};

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

  // The normal happy path for this background job to be executed is this:
  // a) a client connects to the SSE url, waits for a message
  // b) the llm request is completed, and this job is invoked.

  // However, we're going to invoke this job when just (a) happens, because sometimes the clients might
  // even connect only _after_ the job is done. This would happen if the request was already cached, and so
  // before the client has a chance to get the SSE url and initiate a connection, we'd have completed the llm request
  // and fired away the sse message to the channel (but there would've been no one to listen to it then). So,
  // as a backup case if the client is connecting later (in sse-handler/handler.ts), we would invoke this job, just to
  // ensure that if the job has already been completed, we send the payload. Thus this check. If the job is not completed,
  // then there is nothing to send. It'll get anyway sent after that.
  if (
    !(llmRequest.llm_status === "success" || llmRequest.llm_status === "failed")
  )
    return;

  const userId = llmRequest.user_id;

  const publishPayloadData = publishPayload(llmRequest, helpers);
  if (!publishPayloadData) return;

  const result = await nuaFetch(
    config.pushpinPublishInternalServiceUrl + "/publish",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(publishPayloadData),
    },
  );

  if (!result.ok) {
    helpers.logger.error(
      `unexpected-situation. Failed to publish SSE to Pushpin. user_id: ${userId}, llm_request_id: ${params.llm_request_id}, error: ${result.error}`,
    );
    throw new Error(result.error);
  }

  const terminateResult = await nuaFetch(
    config.pushpinPublishInternalServiceUrl + "/publish",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(terminateSseStreamPayload(llmRequest.id)),
    },
  );

  if (!terminateResult.ok) {
    helpers.logger.error(
      `unexpected-situation. Failed to terminate SSE stream via Pushpin. user_id: ${userId}, llm_request_id: ${params.llm_request_id}, error: ${terminateResult.error}`,
    );
    // Don't throw because the job is anyway done. Also, this is a very unlikely situation - it'll happen only if we
    // are unable to talk to Pushpin. In that case, the previous publish also won't work.
  }

  await llmTable.update(llmRequest.id, { sse_status: "sent" });
};

export default taskExecutor;
