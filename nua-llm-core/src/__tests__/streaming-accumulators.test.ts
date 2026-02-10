import {
  streamOpenAiAgenticResponse,
  streamGeminiAgenticResponse,
} from "../modules/agent/provider-formatters";
import { AgentEvent } from "../modules/agent/types";

function makeSSEResponse(events: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const sseText = events.map((e) => `data: ${e}\n\n`).join("");
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

describe("streamOpenAiAgenticResponse", () => {
  it("should accumulate text deltas and emit text_delta events", async () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    const chunks = [
      JSON.stringify({
        choices: [{ delta: { content: "Hello" }, finish_reason: null }],
      }),
      JSON.stringify({
        choices: [{ delta: { content: " world" }, finish_reason: null }],
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }],
      }),
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      "[DONE]",
    ];

    const response = makeSSEResponse(chunks);
    const result = await streamOpenAiAgenticResponse(response, "Test", onEvent);

    expect(result.message.content).toEqual([
      { type: "text", text: "Hello world" },
    ]);
    expect(result.stopReason).toBe("stop");
    expect(result.usage.totalTokens).toBe(15);

    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " world" },
    ]);
  });

  it("should accumulate interleaved tool calls by index", async () => {
    const chunks = [
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_weather", arguments: '{"ci' },
            }],
          },
          finish_reason: null,
        }],
      }),
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              function: { arguments: 'ty":"NYC"}' },
            }],
          },
          finish_reason: null,
        }],
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
      }),
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }),
      "[DONE]",
    ];

    const response = makeSSEResponse(chunks);
    const result = await streamOpenAiAgenticResponse(response, "Test");

    expect(result.stopReason).toBe("tool_use");
    expect(result.message.content).toEqual([
      {
        type: "toolCall",
        id: "call_1",
        name: "get_weather",
        arguments: { city: "NYC" },
      },
    ]);
  });

  it("should handle multiple tool calls streamed by index", async () => {
    const chunks = [
      JSON.stringify({
        choices: [{
          delta: {
            tool_calls: [
              { index: 0, id: "call_1", type: "function", function: { name: "tool_a", arguments: '{}' } },
              { index: 1, id: "call_2", type: "function", function: { name: "tool_b", arguments: '{}' } },
            ],
          },
          finish_reason: null,
        }],
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
      }),
      "[DONE]",
    ];

    const response = makeSSEResponse(chunks);
    const result = await streamOpenAiAgenticResponse(response, "Test");

    expect(result.message.content).toHaveLength(2);
    expect(result.message.content[0]).toMatchObject({ type: "toolCall", name: "tool_a" });
    expect(result.message.content[1]).toMatchObject({ type: "toolCall", name: "tool_b" });
  });

  it("should throw on non-200 status", async () => {
    const encoder = new TextEncoder();
    const body = JSON.stringify({ error: { message: "Bad request" } });
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      }),
      { status: 400 },
    );

    await expect(
      streamOpenAiAgenticResponse(response, "Test"),
    ).rejects.toThrow("Test API error: 400 - Bad request");
  });

  it("should not break when onEvent throws", async () => {
    const onEvent = () => {
      throw new Error("callback error");
    };

    const chunks = [
      JSON.stringify({
        choices: [{ delta: { content: "Hi" }, finish_reason: null }],
      }),
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: "stop" }],
      }),
      "[DONE]",
    ];

    const response = makeSSEResponse(chunks);
    const result = await streamOpenAiAgenticResponse(response, "Test", onEvent);
    expect(result.message.content).toEqual([{ type: "text", text: "Hi" }]);
  });
});

describe("streamGeminiAgenticResponse", () => {
  it("should accumulate text and emit text_delta events", async () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    const chunks = [
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: "Hello" }] },
        }],
      }),
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: " there" }] },
        }],
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 4,
          totalTokenCount: 12,
        },
      }),
    ];

    const response = makeSSEResponse(chunks);
    const result = await streamGeminiAgenticResponse(response, onEvent);

    expect(result.message.content).toEqual([
      { type: "text", text: "Hello there" },
    ]);
    expect(result.stopReason).toBe("stop");
    expect(result.usage.totalTokens).toBe(12);

    const textDeltas = events.filter((e) => e.type === "text_delta");
    expect(textDeltas).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "text_delta", text: " there" },
    ]);
  });

  it("should handle function calls in stream", async () => {
    // Mock crypto.randomUUID for deterministic test
    const originalRandomUUID = crypto.randomUUID;
    let uuidCounter = 0;
    crypto.randomUUID = (() => `uuid-${++uuidCounter}`) as typeof crypto.randomUUID;

    try {
      const chunks = [
        JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                functionCall: {
                  name: "get_weather",
                  args: { city: "NYC" },
                },
              }],
            },
          }],
        }),
      ];

      const response = makeSSEResponse(chunks);
      const result = await streamGeminiAgenticResponse(response);

      expect(result.stopReason).toBe("tool_use");
      expect(result.message.content).toEqual([
        {
          type: "toolCall",
          id: "uuid-1",
          name: "get_weather",
          arguments: { city: "NYC" },
        },
      ]);
    } finally {
      crypto.randomUUID = originalRandomUUID;
    }
  });

  it("should throw on non-200 status", async () => {
    const encoder = new TextEncoder();
    const body = JSON.stringify({ error: { message: "Unauthorized" } });
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(body));
          controller.close();
        },
      }),
      { status: 401 },
    );

    await expect(
      streamGeminiAgenticResponse(response),
    ).rejects.toThrow("Gemini API error: 401 - Unauthorized");
  });
});
