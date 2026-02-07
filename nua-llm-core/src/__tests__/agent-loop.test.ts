import { runAgentLoop, SendAgenticRequestFn } from "../modules/agent/agent-loop";
import {
  AgentTool,
  ConversationMessage,
} from "../modules/agent/types";

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

describe("runAgentLoop", () => {
  it("should return immediately when LLM responds with text only (no tool calls)", async () => {
    const sendRequest: SendAgenticRequestFn = async () => ({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello, world!" }],
      },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      stopReason: "stop",
    });

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
    });

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("stop");
    expect(result.textResponse).toBe("Hello, world!");
    expect(result.usage.totalTokens).toBe(15);
    expect(result.messages).toHaveLength(2); // user + assistant
  });

  it("should execute tool calls and loop until LLM stops calling tools", async () => {
    let callCount = 0;

    const sendRequest: SendAgenticRequestFn = async (messages) => {
      callCount++;

      if (callCount === 1) {
        // First call: LLM decides to use the calculator tool
        return {
          message: {
            role: "assistant",
            content: [
              { type: "text", text: "Let me calculate that." },
              {
                type: "toolCall",
                id: "call_1",
                name: "calculator",
                arguments: { expression: "2 + 2" },
              },
            ],
          },
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          stopReason: "tool_use",
        };
      }

      // Second call: LLM returns final answer after seeing tool result
      return {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "The result is 4." }],
        },
        usage: { promptTokens: 30, completionTokens: 8, totalTokens: 38 },
        stopReason: "stop",
      };
    };

    const calculator = makeTool("calculator", async (args) => ({
      content: "4",
    }));

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "What is 2 + 2?" }],
      tools: [calculator],
      maxTurns: 10,
      sendRequest,
    });

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("stop");
    expect(result.textResponse).toBe("The result is 4.");
    expect(callCount).toBe(2);

    // Messages: user, assistant (with tool call), tool result, assistant (final)
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.messages[2].role).toBe("toolResult");
    expect(result.messages[3].role).toBe("assistant");

    // Check tool result message
    const toolResult = result.messages[2];
    expect(toolResult.role).toBe("toolResult");
    if (toolResult.role === "toolResult") {
      expect(toolResult.toolCallId).toBe("call_1");
      expect(toolResult.toolName).toBe("calculator");
      expect(toolResult.content).toBe("4");
      expect(toolResult.isError).toBe(false);
    }

    // Usage should be summed across turns
    expect(result.usage.promptTokens).toBe(50);
    expect(result.usage.completionTokens).toBe(18);
    expect(result.usage.totalTokens).toBe(68);
  });

  it("should handle tool not found gracefully", async () => {
    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call_1",
                name: "nonexistent_tool",
                arguments: {},
              },
            ],
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          stopReason: "tool_use",
        };
      }
      return {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Sorry, tool not available." }],
        },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        stopReason: "stop",
      };
    };

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Do something" }],
      tools: [],
      maxTurns: 10,
      sendRequest,
    });

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("stop");
    // Check the tool result error message
    const toolResult = result.messages.find((m) => m.role === "toolResult");
    expect(toolResult).toBeDefined();
    if (toolResult?.role === "toolResult") {
      expect(toolResult.isError).toBe(true);
      expect(toolResult.content).toContain("not found");
    }
  });

  it("should handle tool execution errors gracefully", async () => {
    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call_1",
                name: "failing_tool",
                arguments: {},
              },
            ],
          },
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          stopReason: "tool_use",
        };
      }
      return {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Tool failed, sorry." }],
        },
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        stopReason: "stop",
      };
    };

    const failingTool = makeTool("failing_tool", async () => {
      throw new Error("Something went wrong");
    });

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Try the tool" }],
      tools: [failingTool],
      maxTurns: 10,
      sendRequest,
    });

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("stop");
    const toolResult = result.messages.find((m) => m.role === "toolResult");
    if (toolResult?.role === "toolResult") {
      expect(toolResult.isError).toBe(true);
      expect(toolResult.content).toContain("Something went wrong");
    }
  });

  it("should respect maxTurns limit", async () => {
    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      // Always returns a tool call, never stops
      return {
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: `call_${callCount}`,
              name: "infinite_tool",
              arguments: {},
            },
          ],
        },
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        stopReason: "tool_use",
      };
    };

    const infiniteTool = makeTool("infinite_tool", async () => ({
      content: "result",
    }));

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Loop forever" }],
      tools: [infiniteTool],
      maxTurns: 3,
      sendRequest,
    });

    expect(result.success).toBe(false);
    expect(result.completionReason).toBe("max_turns");
    expect(result.error).toContain("Reached maxTurns");
    expect(callCount).toBe(3);
    // Usage should reflect 3 turns
    expect(result.usage.totalTokens).toBe(30);
  });

  it("should handle multiple tool calls in a single turn", async () => {
    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call_a",
                name: "tool_a",
                arguments: { x: 1 },
              },
              {
                type: "toolCall",
                id: "call_b",
                name: "tool_b",
                arguments: { y: 2 },
              },
            ],
          },
          usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          stopReason: "tool_use",
        };
      }
      return {
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Done with both." }],
        },
        usage: { promptTokens: 20, completionTokens: 5, totalTokens: 25 },
        stopReason: "stop",
      };
    };

    const toolA = makeTool("tool_a", async () => ({ content: "result_a" }));
    const toolB = makeTool("tool_b", async () => ({ content: "result_b" }));

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Use both tools" }],
      tools: [toolA, toolB],
      maxTurns: 10,
      sendRequest,
    });

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("stop");
    expect(result.textResponse).toBe("Done with both.");

    // Messages: user, assistant (2 tool calls), toolResult, toolResult, assistant (final)
    expect(result.messages).toHaveLength(5);
    const toolResults = result.messages.filter((m) => m.role === "toolResult");
    expect(toolResults).toHaveLength(2);
  });

  it("should not mutate the original messages array", async () => {
    const originalMessages: ConversationMessage[] = [
      { role: "user", content: "Hi" },
    ];
    const originalLength = originalMessages.length;

    const sendRequest: SendAgenticRequestFn = async () => ({
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
      },
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      stopReason: "stop",
    });

    await runAgentLoop({
      messages: originalMessages,
      tools: [],
      maxTurns: 10,
      sendRequest,
    });

    expect(originalMessages).toHaveLength(originalLength);
  });

  it("should preserve partial state when a request fails mid-loop", async () => {
    let callCount = 0;
    const sendRequest: SendAgenticRequestFn = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          message: {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                id: "call_1",
                name: "tool_a",
                arguments: {},
              },
            ],
          },
          usage: { promptTokens: 7, completionTokens: 3, totalTokens: 10 },
          stopReason: "tool_use",
        };
      }
      throw new Error("Network timeout");
    };

    const toolA = makeTool("tool_a", async () => ({ content: "done" }));

    const result = await runAgentLoop({
      messages: [{ role: "user", content: "Run tool" }],
      tools: [toolA],
      maxTurns: 10,
      sendRequest,
    });

    expect(result.success).toBe(false);
    expect(result.completionReason).toBe("error");
    expect(result.error).toContain("Network timeout");
    expect(result.usage.totalTokens).toBe(10);
    expect(result.messages).toHaveLength(3); // user + assistant(tool call) + toolResult
    expect(result.messages[2].role).toBe("toolResult");
  });
});
