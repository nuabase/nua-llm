import {
  extractOpenAiMessageText,
  GeminiUsageMetadata,
  normalizeGeminiUsage,
  normalizeOpenAiUsage,
  NormalizedUsage,
  normalizedUsageZero,
  OpenAiUsage,
  ProviderRequestBase,
} from "../llm-client/provider-config";
import {
  AgentEventHandler,
  AgenticParsedResponse,
  AssistantContentBlock,
  ConversationMessage,
  ToolCallContent,
  ToolDefinition,
} from "./types";
import { parseSSEStream } from "../streaming/sse-parser";

// ============================================================================
// OpenAI-style (Groq, Cerebras, OpenRouter)
// ============================================================================

type OpenAiMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

function convertMessagesToOpenAi(
  messages: ConversationMessage[],
  systemPrompt?: string,
): OpenAiMessage[] {
  const result: OpenAiMessage[] = [];

  if (systemPrompt) {
    result.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    switch (msg.role) {
      case "user":
        result.push({ role: "user", content: msg.content });
        break;

      case "assistant": {
        const textParts = msg.content
          .filter((c): c is { type: "text"; text: string } => c.type === "text")
          .map((c) => c.text)
          .join("");

        const toolCalls = msg.content
          .filter(
            (c): c is ToolCallContent => c.type === "toolCall",
          )
          .map((c) => ({
            id: c.id,
            type: "function" as const,
            function: {
              name: c.name,
              arguments: JSON.stringify(c.arguments),
            },
          }));

        const openAiMsg: OpenAiMessage = {
          role: "assistant",
          content: textParts || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        };
        result.push(openAiMsg);
        break;
      }

      case "toolResult":
        result.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
        break;
    }
  }

  return result;
}

function convertToolsToOpenAi(
  tools: ToolDefinition[],
): Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }> {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function buildOpenAiAgenticRequest(
  options: {
    messages: ConversationMessage[];
    tools: ToolDefinition[];
    model: string;
    maxTokens: number;
    systemPrompt?: string;
    stream?: boolean;
  },
  baseUrl: string,
  apiKey: string,
): ProviderRequestBase {
  const messages = convertMessagesToOpenAi(
    options.messages,
    options.systemPrompt,
  );
  const tools = convertToolsToOpenAi(options.tools);

  const body: Record<string, unknown> = {
    messages,
    tools: tools.length > 0 ? tools : undefined,
    model: options.model,
    max_completion_tokens: options.maxTokens,
    stream: options.stream ?? false,
  };

  if (options.stream) {
    body.stream_options = { include_usage: true };
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  return {
    url: baseUrl,
    method: "POST",
    headers,
    body,
    loggableHeaders: {
      ...headers,
      Authorization: "Bearer [REDACTED]",
    },
    loggableBody: body,
  };
}

// OpenAI response types for agentic responses
type OpenAiAgenticResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: Array<Record<string, unknown>>;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
  error?: { message?: string };
  usage?: OpenAiUsage;
};

function parseOpenAiToolArguments(
  rawArguments: string,
  toolName: string,
  errorLabel: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArguments);
  } catch {
    throw new Error(
      `${errorLabel} API error: Invalid JSON arguments for tool "${toolName}"`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `${errorLabel} API error: Tool "${toolName}" arguments must be a JSON object`,
    );
  }

  return parsed as Record<string, unknown>;
}

export async function parseOpenAiAgenticResponse(
  response: Response,
  errorLabel: string,
): Promise<AgenticParsedResponse> {
  if (response.status !== 200) {
    const errorBody = await response.text();
    try {
      const parsed = JSON.parse(errorBody);
      const message = parsed?.error?.message || errorBody;
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${message}`,
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith(`${errorLabel} API error:`)) throw e;
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${errorBody}`,
      );
    }
  }

  const responseBody =
    (await response.json()) as OpenAiAgenticResponse;

  const choice = responseBody.choices?.[0];
  if (!choice?.message) {
    throw new Error(
      `${errorLabel} API error: No message in response. Body: ${JSON.stringify(responseBody)}`,
    );
  }

  const contentBlocks: AssistantContentBlock[] = [];

  const assistantText = extractOpenAiMessageText(choice.message);
  if (assistantText) {
    contentBlocks.push({
      type: "text",
      text: assistantText,
    });
  }

  // Extract tool calls
  if (choice.message.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      contentBlocks.push({
        type: "toolCall",
        id: tc.id,
        name: tc.function.name,
        arguments: parseOpenAiToolArguments(
          tc.function.arguments,
          tc.function.name,
          errorLabel,
        ),
      });
    }
  }

  const usage = normalizeOpenAiUsage(responseBody.usage);

  // OpenAI uses "tool_calls" as finish_reason when tools are called
  const stopReason =
    choice.finish_reason === "tool_calls" || choice.finish_reason === "stop"
      ? choice.finish_reason === "tool_calls"
        ? "tool_use"
        : "stop"
      : choice.message.tool_calls && choice.message.tool_calls.length > 0
        ? "tool_use"
        : "stop";

  return {
    message: {
      role: "assistant",
      content: contentBlocks,
    },
    usage,
    stopReason,
  };
}

// ============================================================================
// Gemini
// ============================================================================

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | {
      functionResponse: {
        name: string;
        response: { content: string };
      };
    };

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

function convertMessagesToGemini(
  messages: ConversationMessage[],
): GeminiContent[] {
  const result: GeminiContent[] = [];

  for (const msg of messages) {
    switch (msg.role) {
      case "user":
        result.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
        break;

      case "assistant": {
        const parts: GeminiPart[] = [];
        for (const block of msg.content) {
          if (block.type === "text") {
            parts.push({ text: block.text });
          } else if (block.type === "toolCall") {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.arguments,
              },
            });
          }
        }
        result.push({ role: "model", parts });
        break;
      }

      case "toolResult": {
        // Gemini expects tool results as functionResponse parts in a user-role message
        result.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.toolName,
                response: { content: msg.content },
              },
            },
          ],
        });
        break;
      }
    }
  }

  return result;
}

function convertToolsToGemini(
  tools: ToolDefinition[],
): Array<{ functionDeclarations: Array<{ name: string; description: string; parameters: Record<string, unknown> }> }> {
  if (tools.length === 0) return [];
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

export function buildGeminiAgenticRequest(
  options: {
    messages: ConversationMessage[];
    tools: ToolDefinition[];
    model: string;
    maxTokens: number;
    systemPrompt?: string;
    stream?: boolean;
  },
  apiKey: string,
): ProviderRequestBase {
  const contents = convertMessagesToGemini(options.messages);
  const tools = convertToolsToGemini(options.tools);

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens,
    },
  };

  if (tools.length > 0) {
    body.tools = tools;
  }

  if (options.systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: options.systemPrompt }],
    };
  }

  const action = options.stream ? "streamGenerateContent" : "generateContent";
  const altParam = options.stream ? "&alt=sse" : "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:${action}?key=${apiKey}${altParam}`;

  return {
    url,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    loggableUrl: url.replace(/key=[^&]+/, "key=[REDACTED]"),
    loggableBody: body,
  };
}

// Gemini response types for agentic responses
type GeminiAgenticResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
    finishReason?: string;
  }>;
  error?: { message?: string };
  usageMetadata?: GeminiUsageMetadata;
};

export async function parseGeminiAgenticResponse(
  response: Response,
): Promise<AgenticParsedResponse> {
  if (response.status !== 200) {
    const errorBody = await response.text();
    try {
      const parsed = JSON.parse(errorBody);
      const message = parsed?.error?.message || errorBody;
      throw new Error(`Gemini API error: ${response.status} - ${message}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gemini API error:")) throw e;
      throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }
  }

  const responseBody =
    (await response.json()) as GeminiAgenticResponse;

  const candidate = responseBody.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error(
      `Gemini API error: No content in response. Body: ${JSON.stringify(responseBody)}`,
    );
  }

  const contentBlocks: AssistantContentBlock[] = [];
  let hasToolCalls = false;

  for (const part of candidate.content.parts) {
    if (part.text) {
      contentBlocks.push({ type: "text", text: part.text });
    }
    if (part.functionCall) {
      hasToolCalls = true;
      contentBlocks.push({
        type: "toolCall",
        id: crypto.randomUUID(),
        name: part.functionCall.name,
        arguments: part.functionCall.args,
      });
    }
  }

  const usage = normalizeGeminiUsage(responseBody.usageMetadata);

  const stopReason = hasToolCalls ? "tool_use" : "stop";

  return {
    message: {
      role: "assistant",
      content: contentBlocks,
    },
    usage,
    stopReason,
  };
}

// ============================================================================
// Streaming Accumulators
// ============================================================================

// --- OpenAI streaming types ---

type OpenAiStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: OpenAiUsage;
};

function safeEmit(onEvent: AgentEventHandler | undefined, event: Parameters<AgentEventHandler>[0]): void {
  if (!onEvent) return;
  try {
    onEvent(event);
  } catch {
    // Never let callback errors propagate
  }
}

export async function streamOpenAiAgenticResponse(
  response: Response,
  errorLabel: string,
  onEvent?: AgentEventHandler,
): Promise<AgenticParsedResponse> {
  if (response.status !== 200) {
    const errorBody = await response.text();
    try {
      const parsed = JSON.parse(errorBody);
      const message = parsed?.error?.message || errorBody;
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${message}`,
      );
    } catch (e) {
      if (e instanceof Error && e.message.startsWith(`${errorLabel} API error:`)) throw e;
      throw new Error(
        `${errorLabel} API error: ${response.status} - ${errorBody}`,
      );
    }
  }

  if (!response.body) {
    throw new Error(`${errorLabel} API error: Response body is null`);
  }

  let textContent = "";
  // Accumulate tool calls keyed by index (handles interleaved multi-tool streaming)
  const toolCallAccumulators = new Map<number, {
    id: string;
    name: string;
    arguments: string;
  }>();
  let finishReason: string | null = null;
  let usage: NormalizedUsage = { ...normalizedUsageZero };

  for await (const data of parseSSEStream(response.body)) {
    let chunk: OpenAiStreamChunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue; // Skip malformed chunks
    }

    // Extract usage from final chunk (requires stream_options.include_usage)
    if (chunk.usage) {
      usage = normalizeOpenAiUsage(chunk.usage);
    }

    const choice = chunk.choices?.[0];
    if (!choice) continue;

    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
    }

    const delta = choice.delta;
    if (!delta) continue;

    // Text content delta
    if (delta.content) {
      textContent += delta.content;
      safeEmit(onEvent, { type: "text_delta", text: delta.content });
    }

    // Tool call deltas
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const existing = toolCallAccumulators.get(tc.index);
        if (existing) {
          // Append incremental arguments
          if (tc.function?.arguments) {
            existing.arguments += tc.function.arguments;
          }
        } else {
          // New tool call
          toolCallAccumulators.set(tc.index, {
            id: tc.id ?? "",
            name: tc.function?.name ?? "",
            arguments: tc.function?.arguments ?? "",
          });
        }
      }
    }
  }

  // Build content blocks
  const contentBlocks: AssistantContentBlock[] = [];

  if (textContent) {
    contentBlocks.push({ type: "text", text: textContent });
  }

  // Sort by index to preserve order, parse accumulated arguments
  const sortedToolCalls = [...toolCallAccumulators.entries()]
    .sort(([a], [b]) => a - b);

  for (const [, tc] of sortedToolCalls) {
    contentBlocks.push({
      type: "toolCall",
      id: tc.id,
      name: tc.name,
      arguments: parseOpenAiToolArguments(tc.arguments, tc.name, errorLabel),
    });
  }

  const stopReason2: "stop" | "tool_use" =
    finishReason === "tool_calls" || sortedToolCalls.length > 0
      ? "tool_use"
      : "stop";

  return {
    message: { role: "assistant", content: contentBlocks },
    usage,
    stopReason: stopReason2,
  };
}

// --- Gemini streaming types ---

type GeminiStreamChunk = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: GeminiUsageMetadata;
};

export async function streamGeminiAgenticResponse(
  response: Response,
  onEvent?: AgentEventHandler,
): Promise<AgenticParsedResponse> {
  if (response.status !== 200) {
    const errorBody = await response.text();
    try {
      const parsed = JSON.parse(errorBody);
      const message = parsed?.error?.message || errorBody;
      throw new Error(`Gemini API error: ${response.status} - ${message}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gemini API error:")) throw e;
      throw new Error(`Gemini API error: ${response.status} - ${errorBody}`);
    }
  }

  if (!response.body) {
    throw new Error("Gemini API error: Response body is null");
  }

  const contentBlocks: AssistantContentBlock[] = [];
  let hasToolCalls2 = false;
  let textContent2 = "";
  let usage2: NormalizedUsage = { ...normalizedUsageZero };

  for await (const data of parseSSEStream(response.body)) {
    let chunk: GeminiStreamChunk;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }

    if (chunk.usageMetadata) {
      usage2 = normalizeGeminiUsage(chunk.usageMetadata);
    }

    const candidate = chunk.candidates?.[0];
    if (!candidate?.content?.parts) continue;

    for (const part of candidate.content.parts) {
      if (part.text) {
        textContent2 += part.text;
        safeEmit(onEvent, { type: "text_delta", text: part.text });
      }
      if (part.functionCall) {
        hasToolCalls2 = true;
        contentBlocks.push({
          type: "toolCall",
          id: crypto.randomUUID(),
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }
  }

  // Add accumulated text as a single block at the front
  if (textContent2) {
    contentBlocks.unshift({ type: "text", text: textContent2 });
  }

  const stopReason3: "stop" | "tool_use" = hasToolCalls2 ? "tool_use" : "stop";

  return {
    message: { role: "assistant", content: contentBlocks },
    usage: usage2,
    stopReason: stopReason3,
  };
}
