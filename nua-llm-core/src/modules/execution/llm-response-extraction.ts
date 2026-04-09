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

export function parseJsonFromLlmResponse(input: string): object {
  const trimmed = input.trim();
  const codeFence = "```";
  const jsonFence = "```json";

  // Fast path: extract from code fences (handles the common cases).
  // Wrapped in try/catch so we fall through to the slow path if the fenced
  // content isn't valid JSON (e.g. a non-JSON ``` block before the real data).
  const lastJsonFence = trimmed.lastIndexOf(jsonFence);
  if (lastJsonFence !== -1) {
    const startIndex = lastJsonFence + jsonFence.length;
    const endIndex = trimmed.indexOf(codeFence, startIndex);
    if (endIndex !== -1) {
      try {
        return JSON.parse(trimmed.substring(startIndex, endIndex).trim());
      } catch { /* fall through to slow path */ }
    }
  }

  const firstCodeFence = trimmed.indexOf(codeFence);
  if (firstCodeFence !== -1) {
    const startIndex = firstCodeFence + codeFence.length;
    const endIndex = trimmed.indexOf(codeFence, startIndex);
    if (endIndex !== -1) {
      try {
        return JSON.parse(trimmed.substring(startIndex, endIndex).trim());
      } catch { /* fall through to slow path */ }
    }
  }

  // Slow path: precompute matching brackets in O(n), then try JSON.parse
  // only on balanced substrings.
  const matchingClose = new Array(trimmed.length).fill(-1);
  const stack: number[] = [];
  let inString = false;
  for (let k = 0; k < trimmed.length; k++) {
    if (inString) {
      if (trimmed[k] === "\\") k++;
      else if (trimmed[k] === '"') inString = false;
      continue;
    }
    if (trimmed[k] === '"') { inString = true; continue; }
    if (trimmed[k] === "{" || trimmed[k] === "[") {
      stack.push(k);
    } else if (trimmed[k] === "}" || trimmed[k] === "]") {
      if (stack.length > 0) {
        const open = stack.pop()!;
        const expected = trimmed[open] === "{" ? "}" : "]";
        if (trimmed[k] === expected) matchingClose[open] = k;
      }
    }
  }

  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] !== "{" && trimmed[i] !== "[") continue;
    const j = matchingClose[i];
    if (j === -1) continue;
    try {
      return JSON.parse(trimmed.substring(i, j + 1));
    } catch { continue; }
  }

  return JSON.parse(trimmed);
}
