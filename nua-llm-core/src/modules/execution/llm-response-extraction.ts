// LLM response extraction helpers

export function extractThinkingFromResponse(input: string): {
  thinking: string;
  cleanedResponse: string;
} {
  // capture and strip <think> blocks while preserving their contents.
  const startTag = "<think>";
  const endTag = "</think>";
  const thinkingParts: string[] = [];
  const cleanedParts: string[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const startIndex = input.indexOf(startTag, cursor);

    if (startIndex === -1) {
      cleanedParts.push(input.slice(cursor));
      break;
    }

    cleanedParts.push(input.slice(cursor, startIndex));
    const contentStart = startIndex + startTag.length;
    const endIndex = input.indexOf(endTag, contentStart);

    if (endIndex === -1) {
      cleanedParts.push(input.slice(startIndex));
      break;
    }

    thinkingParts.push(input.slice(contentStart, endIndex).trim());
    cursor = endIndex + endTag.length;
  }

  const thinking = thinkingParts.join("\n\n");
  const cleanedResponse = cleanedParts.join("").trim();

  return {
    thinking,
    cleanedResponse,
  };
}

export function extractJsonFromMarkdown(input: string): string {
  const trimmed = input.trim();
  const codeFence = "```";
  const jsonFence = "```json";

  // Fast path: extract from code fences (handles the common cases).
  const lastJsonFence = trimmed.lastIndexOf(jsonFence);
  if (lastJsonFence !== -1) {
    const startIndex = lastJsonFence + jsonFence.length;
    const endIndex = trimmed.indexOf(codeFence, startIndex);
    if (endIndex !== -1) {
      return trimmed.substring(startIndex, endIndex).trim();
    }
  }

  const firstCodeFence = trimmed.indexOf(codeFence);
  if (firstCodeFence !== -1) {
    const startIndex = firstCodeFence + codeFence.length;
    const endIndex = trimmed.indexOf(codeFence, startIndex);
    if (endIndex !== -1) {
      return trimmed.substring(startIndex, endIndex).trim();
    }
  }

  // Slow path: scan for valid JSON by trying each { or [ as a start position,
  // paired with matching close brackets from the end.
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== "{" && ch !== "[") continue;

    const closeChar = ch === "{" ? "}" : "]";
    let j = trimmed.lastIndexOf(closeChar);

    while (j > i) {
      const candidate = trimmed.substring(i, j + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        j = trimmed.lastIndexOf(closeChar, j - 1);
      }
    }
  }

  return trimmed;
}
