import { config } from "#lib/config";
import { createSseToken } from "#modules/sse-token";
import { User } from "../../models/users-model";

export function buildSseUrl(llmRequestId: string, user: User) {
  const token = createSseToken(user, llmRequestId);
  // The URL path should match our sse-handler route. The config value will contain the protocol.
  return `${config.pushpinPublicConsumerUrl}/sse/${llmRequestId}?token=${token}`;

  // Note: The public consumer URL would point to a Dokku app where Pushpin runs. So it passes thru nginx and then
  // to Pushpin. Pushpin has a routes file where we tell it to send those incoming requests to this server (api.nuabase)
  // where the sse-handler route will get it. If it has valid token, then it'll return back (to Pushpin) a GRIP
  // header. Then pushpin will return to the client with an appropriate event-stream started response.
  //
  // That's how the first-contact from an end consumer to our SSE happens.
  //
  // Then, whenever the job is done, our background job send-sse-after-llm-request-completion, will publish the
  // results to this channel (llmRequestId), to the Pushpin internal URL that we use to publish messages to. It is
  // not publicly visible.
  //
  // That's it. Pushpin then looks for connected clients and fans out the message thru the previously established
  // SSE event stream.
}
