import { parseSSEStream } from "../modules/streaming/sse-parser";

function makeStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function makeChunkedStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const results: string[] = [];
  for await (const data of parseSSEStream(stream)) {
    results.push(data);
  }
  return results;
}

describe("parseSSEStream", () => {
  it("should yield data payloads from SSE events", async () => {
    const sse = 'data: {"text":"hello"}\n\ndata: {"text":"world"}\n\n';
    const results = await collect(makeStream(sse));
    expect(results).toEqual(['{"text":"hello"}', '{"text":"world"}']);
  });

  it("should stop on [DONE] sentinel", async () => {
    const sse = 'data: {"a":1}\n\ndata: [DONE]\n\ndata: {"b":2}\n\n';
    const results = await collect(makeStream(sse));
    expect(results).toEqual(['{"a":1}']);
  });

  it("should handle chunks split across boundaries", async () => {
    const results = await collect(
      makeChunkedStream([
        'data: {"chunk":',
        '1}\n\ndata: {"chunk":2}\n\n',
      ]),
    );
    expect(results).toEqual(['{"chunk":1}', '{"chunk":2}']);
  });

  it("should ignore non-data lines", async () => {
    const sse = 'event: update\ndata: payload\nid: 123\n\n';
    const results = await collect(makeStream(sse));
    expect(results).toEqual(["payload"]);
  });

  it("should handle empty stream", async () => {
    const results = await collect(makeStream(""));
    expect(results).toEqual([]);
  });

  it("should handle \\r\\n line endings", async () => {
    const sse = 'data: first\r\n\r\ndata: second\r\n\r\n';
    const results = await collect(makeStream(sse));
    expect(results).toEqual(["first", "second"]);
  });

  it("should flush trailing data without final double newline", async () => {
    const sse = 'data: {"a":1}\n\ndata: {"b":2}';
    const results = await collect(makeStream(sse));
    expect(results).toEqual(['{"a":1}', '{"b":2}']);
  });
});
