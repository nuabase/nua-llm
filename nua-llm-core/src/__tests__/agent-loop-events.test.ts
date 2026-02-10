import { runAgentLoop, SendAgenticRequestFn } from "../modules/agent/agent-loop";
import { AgentEvent, AgentTool } from "../modules/agent/types";

function makeTool(
  name: string,
  handler: (args: Record<string, unknown>) => Promise<{ content: string; isError?: boolean }>,
): AgentTool {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: { type: "object", properties: {} },
    execute: handler,
  };
}

describe("runAgentLoop with onEvent", () => {
  it("should emit turn_start and response_complete for a simple text response", async () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    const sendRequest: SendAgenticRequestFn = async () => ({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      stopReason: "stop",
    });

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
      onEvent,
    });

    expect(result.success).toBe(true);
    expect(events).toEqual([
      { type: "turn_start", turn: 0 },
      {
        type: "response_complete",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello!" }],
        },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        stopReason: "stop",
      },
    ]);
  });

  it("should emit full event sequence for tool call turn", async () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Let me check." },
              {
                type: "toolCall",
                id: "call_1",
                name: "calculator",
                arguments: { expr: "2+2" },
              },
            ],
          },
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          stopReason: "tool_use",
        };
      }
      return {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "The answer is 4." }],
        },
        usage: { promptTokens: 30, completionTokens: 8, totalTokens: 38 },
        stopReason: "stop",
      };
    };

    const calculator = makeTool("calculator", async () => ({
      content: "4",
    }));

    await runAgentLoop({
      messages: [{ role: "user", content: "What is 2+2?" }],
      tools: [calculator],
      maxTurns: 10,
      sendRequest,
      onEvent,
    });

    const eventTypes = events.map((e) => e.type);
    expect(eventTypes).toEqual([
      "turn_start",        // turn 0
      "response_complete", // LLM response with tool call
      "tool_start",        // tool execution begins
      "tool_complete",     // tool execution ends
      "turn_start",        // turn 1
      "response_complete", // final text response
    ]);

    // Verify tool events have correct data
    const toolStart = events.find((e) => e.type === "tool_start");
    expect(toolStart).toMatchObject({
      type: "tool_start",
      toolCallId: "call_1",
      toolName: "calculator",
      arguments: { expr: "2+2" },
    });

    const toolComplete = events.find((e) => e.type === "tool_complete");
    expect(toolComplete).toMatchObject({
      type: "tool_complete",
      toolCallId: "call_1",
      toolName: "calculator",
      result: { content: "4" },
    });
  });

  it("should emit error event on sendRequest failure", async () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    const sendRequest: SendAgenticRequestFn = async () => {
      throw new Error("Network timeout");
    };

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
      onEvent,
    });

    expect(result.success).toBe(false);
    expect(result.completionReason).toBe("error");

    const errorEvents = events.filter((e) => e.type === "error");
    expect(errorEvents).toEqual([
      { type: "error", error: "Network timeout" },
    ]);
  });

  it("should emit tool_complete with error for tool not found", async () => {
    const events: AgentEvent[] = [];
    const onEvent = (e: AgentEvent) => events.push(e);

    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          message: {
            role: "assistant",
            content: [{
              type: "toolCall",
              id: "call_1",
              name: "nonexistent",
              arguments: {},
            }],
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          stopReason: "tool_use",
        };
      }
      return {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "OK" }],
        },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        stopReason: "stop",
      };
    };

    await runAgentLoop({
      messages: [{ role: "user", content: "Run tool" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
      onEvent,
    });

    const toolComplete = events.find((e) => e.type === "tool_complete");
    expect(toolComplete).toMatchObject({
      type: "tool_complete",
      toolCallId: "call_1",
      toolName: "nonexistent",
      result: { content: expect.stringContaining("not found"), isError: true },
    });
  });

  it("should not break the loop when onEvent throws", async () => {
    const onEvent = () => {
      throw new Error("callback crashed");
    };

    const sendRequest: SendAgenticRequestFn = async () => ({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Works fine" }],
      },
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      stopReason: "stop",
    });

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
      onEvent,
    });

    expect(result.success).toBe(true);
    expect(result.textResponse).toBe("Works fine");
  });

  it("should still work correctly without onEvent (backward compatible)", async () => {
    const sendRequest: SendAgenticRequestFn = async () => ({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      stopReason: "stop",
    });

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
      // no onEvent
    });

    expect(result.success).toBe(true);
    expect(result.textResponse).toBe("Hello!");
  });
});
