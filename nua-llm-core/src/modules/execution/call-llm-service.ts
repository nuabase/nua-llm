import { ValidationResult } from "../json-schema-validation/nua-json-schema-value-validation";
import { LlmClient } from "../llm-client/llm-client";
import { NormalizedUsage } from "../llm-client/provider-config";
import { CanonicalModelName } from "../model-info";

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export function extractThinkingFromResponse(input: string): {
  thinking: string;
  cleanedResponse: string;
} {
  const thinkRegex = /<think>(.*?)<\/think>/gis;
  const thinkingParts: string[] = [];
  let match;

  while ((match = thinkRegex.exec(input)) !== null) {
    thinkingParts.push(match[1].trim());
  }

  const thinking = thinkingParts.join("\n\n");
  const cleanedResponse = input.replace(/<think>.*?<\/think>/gis, "").trim();

  return {
    thinking,
    cleanedResponse,
  };
}

function extractJsonFromMarkdown(input: string): string {
  // Check if the string starts with ```json
  const jsonCodeBlockStart = "```json";
  const codeBlockEnd = "```";

  const trimmed = input.trim();

  if (trimmed.startsWith(jsonCodeBlockStart)) {
    // Find the ending ```
    const startIndex = jsonCodeBlockStart.length;
    const endIndex = trimmed.lastIndexOf(codeBlockEnd);

    if (endIndex > startIndex) {
      // Extract the content between the code block markers
      return trimmed.substring(startIndex, endIndex).trim();
    }
  }

  // If no markdown formatting found, return the original string
  return input;
}

export type CallLlmResult = {
  data: object;
  usage: NormalizedUsage;
};

export async function callLLM(
  llmClient: LlmClient,
  prompt: string,
  model: CanonicalModelName,
  maxTokens: number,
  temperature: number,
  maxRetries: number,
  validationFunction: (data: object) => ValidationResult,
): Promise<CallLlmResult> {
  const startTime = Date.now();

  // FIXME: throw is caught locally. Then don't throw, just pass the value down.
  // Also - simplify control flow.
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const providerResponse = await llmClient.sendRequest(
        prompt,
        model,
        maxTokens,
      );
      const response = providerResponse.text;

      let parsedResponse: object;
      try {
        let { thinking, cleanedResponse } =
          extractThinkingFromResponse(response);
        cleanedResponse = extractJsonFromMarkdown(cleanedResponse);
        parsedResponse = JSON.parse(cleanedResponse);
      } catch (parseError) {
        const errorMessage = `Failed to parse LLM response as JSON: ${parseError instanceof Error ? parseError.message : "Unknown parsing error"}`;
        throw new Error(errorMessage);
      }

      const validationResult = validationFunction(parsedResponse);
      if (validationResult.success && validationResult.data) {
        return {
          data: validationResult.data,
          usage: providerResponse.usage,
        };
      }

      const errorMessage = `Validation failed: ${validationResult.error || "Unknown validation error"}`;

      throw new Error(errorMessage);
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const latencyMs = Date.now() - startTime;

      if (isLastAttempt) {
        throw new Error(
          `LLM call failed after ${maxRetries} attempts. Last error: ${errorMessage}`,
        );
      }

      const backoffDelay = Math.pow(2, attempt - 1) * 1000;
      console.warn(
        `LLM call attempt ${attempt} failed: ${errorMessage}. Retrying in ${backoffDelay}ms...`,
      );
      await delay(backoffDelay);
    }
  }

  throw new Error(
    "Unexpected error: retry loop completed without success or failure",
  );
}
