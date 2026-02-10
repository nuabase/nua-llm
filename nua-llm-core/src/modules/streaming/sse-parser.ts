/**
 * Generic SSE (Server-Sent Events) stream parser.
 * Reads a ReadableStream<Uint8Array> and yields each `data:` payload as a string.
 * Handles OpenAI's `[DONE]` sentinel and Gemini's stream-close-means-done.
 * Uses only web-standard APIs (no node: imports).
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on double-newline (SSE event boundary).
      // Events can be separated by \n\n or \r\n\r\n.
      const parts = buffer.split(/\r?\n\r?\n/);
      // The last part is an incomplete event (or empty string) - keep it in the buffer
      buffer = parts.pop()!;

      for (const part of parts) {
        for (const line of part.split(/\r?\n/)) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            // OpenAI signals end of stream with [DONE]
            if (data === "[DONE]") {
              return;
            }
            yield data;
          }
          // Ignore other SSE fields (event:, id:, retry:, comments)
        }
      }
    }

    // Flush any remaining buffered data
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return;
          }
          yield data;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
