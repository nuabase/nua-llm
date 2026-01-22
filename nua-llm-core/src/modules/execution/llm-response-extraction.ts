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
  // normalize input so we can detect a fenced code block at the edges.
  const trimmed = input.trim();
  const codeFence = "```";
  const jsonFence = "```json";

  // extract content when the block is explicitly labeled as JSON.
  if (trimmed.startsWith(jsonFence)) {
    const startIndex = jsonFence.length;
    const endIndex = trimmed.lastIndexOf(codeFence);

    if (endIndex > startIndex) {
      return trimmed.substring(startIndex, endIndex).trim();
    }
  }

  // extract content when the block is fenced without a language tag.
  if (trimmed.startsWith(codeFence) && !trimmed.startsWith(jsonFence)) {
    const startIndex = codeFence.length;
    const endIndex = trimmed.lastIndexOf(codeFence);

    if (endIndex > startIndex) {
      return trimmed.substring(startIndex, endIndex).trim();
    }
  }

  // return the original input when no relevant fence is present.
  return input;
}
