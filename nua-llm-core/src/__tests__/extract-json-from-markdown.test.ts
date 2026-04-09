import { parseJsonFromLlmResponse } from '../modules/execution/llm-response-extraction';

describe('parseJsonFromLlmResponse', () => {
  test('removes regular code fences with content on a new line', () => {
    const input = '```\n{"a":1}\n```';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a":1});
  });

  test('removes json code fences with content on a new line', () => {
    const input = '```json\n{"a":1}\n```';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a":1});
  });

  test('removes json code fences when content starts after a blank line', () => {
    const input = '```json\n\n{"a":1}\n```';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a":1});
  });

  test('removes regular code fences when content is on the same line', () => {
    const input = '``` [1,2,3] ```';
    expect(parseJsonFromLlmResponse(input)).toEqual([1,2,3]);
  });

  test('removes json code fences when content is on the same line', () => {
    const input = '```json [1,2,3] ```';
    expect(parseJsonFromLlmResponse(input)).toEqual([1,2,3]);
  });

  test('extracts JSON when preamble text precedes a json code fence', () => {
    const input = 'I\'ll analyze each transaction:\n\n```json\n{"id": "txn-0", "account": "assets:bank"}\n```';
    expect(parseJsonFromLlmResponse(input)).toEqual({"id": "txn-0", "account": "assets:bank"});
  });

  test('extracts JSON array when preamble text precedes a json code fence', () => {
    const input = 'Here are the results:\n\n```json\n[{"id": 1}, {"id": 2}]\n```';
    expect(parseJsonFromLlmResponse(input)).toEqual([{"id": 1}, {"id": 2}]);
  });

  test('extracts JSON when preamble contains curly braces', () => {
    const input = 'I\'ll categorize {these items}:\n{"a": 1}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a": 1});
  });

  test('extracts JSON when postamble contains curly braces', () => {
    const input = '{"a": 1}\nDone {ok}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a": 1});
  });

  test('extracts JSON when both preamble and postamble contain brackets', () => {
    const input = 'See {this}:\n[{"a": 1}]\nDone [ok]';
    expect(parseJsonFromLlmResponse(input)).toEqual([{"a": 1}]);
  });

  test('returns bare JSON unchanged', () => {
    const input = '{"key": "value"}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"key": "value"});
  });

  test('falls through to slow path when code fence contains non-JSON', () => {
    const input = 'Notes:\n```\napple - 1 unit\n```\n\n{"food_name": "apple", "quantity": 1}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"food_name": "apple", "quantity": 1});
  });

  test('throws when no valid JSON is found', () => {
    expect(() => parseJsonFromLlmResponse('no json here')).toThrow();
  });

  // --- Bug: O(n²) slow path hangs on bracket-heavy inputs ---

  test('does not hang on many nested brackets with invalid content in the middle', () => {
    const N = 1000;
    const input = '['.repeat(N) + 'INVALID' + ']'.repeat(N);
    const start = Date.now();
    expect(() => parseJsonFromLlmResponse(input)).toThrow();
    expect(Date.now() - start).toBeLessThan(100);
  }, 5000);

  test('does not hang on many curly brackets with invalid content', () => {
    const N = 1000;
    const input = '{'.repeat(N) + '"a":' + '}'.repeat(N);
    const start = Date.now();
    try { parseJsonFromLlmResponse(input); } catch {}
    expect(Date.now() - start).toBeLessThan(100);
  }, 5000);

  test('does not hang on alternating bracket pairs with trailing junk', () => {
    const input = '{"a":1}'.repeat(500) + ' INVALID';
    const start = Date.now();
    try { parseJsonFromLlmResponse(input); } catch {}
    expect(Date.now() - start).toBeLessThan(100);
  }, 5000);

  // --- Bracket matching: string-awareness ---

  test('handles closing bracket inside a JSON string value', () => {
    const input = 'result: {"key": "a}b"}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"key": "a}b"});
  });

  test('handles closing square bracket inside a JSON string value', () => {
    const input = 'result: ["a]b", "c"]';
    expect(parseJsonFromLlmResponse(input)).toEqual(["a]b", "c"]);
  });

  test('handles escaped quotes inside JSON string values', () => {
    const input = 'result: {"key": "say \\"hello\\""}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"key": 'say "hello"'});
  });

  test('handles escaped backslash before closing quote', () => {
    const input = '{"path": "C:\\\\"}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"path": "C:\\"});
  });

  // --- Bracket matching: nesting ---

  test('handles deeply nested valid JSON', () => {
    const input = '{"a": {"b": {"c": {"d": 1}}}}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a": {"b": {"c": {"d": 1}}}});
  });

  test('handles mixed bracket nesting (objects inside arrays)', () => {
    const input = 'here: [{"a": [1, 2]}, {"b": [3]}]';
    expect(parseJsonFromLlmResponse(input)).toEqual([{"a": [1, 2]}, {"b": [3]}]);
  });

  test('handles nested arrays', () => {
    const input = '[[1, [2, 3]], [4]]';
    expect(parseJsonFromLlmResponse(input)).toEqual([[1, [2, 3]], [4]]);
  });

  // --- Bracket matching: mismatched/unbalanced brackets ---

  test('extracts valid JSON when preceded by mismatched brackets', () => {
    const input = 'use {these] for grouping: {"a": 1}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a": 1});
  });

  test('extracts valid JSON when followed by unbalanced brackets', () => {
    const input = '{"a": 1} and then some {unclosed';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a": 1});
  });

  test('skips unbalanced opening bracket to find valid JSON after it', () => {
    const input = '{oops {"a": 1}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"a": 1});
  });

  // --- Bracket matching: multiple candidates ---

  test('returns the first valid JSON when multiple objects exist', () => {
    const input = '{"first": 1} {"second": 2}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"first": 1});
  });

  test('skips invalid balanced pair to find the next valid one', () => {
    const input = '{not json} {"valid": true}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"valid": true});
  });

  test('finds valid JSON nested inside an invalid outer pair', () => {
    const input = '{garbage {"inner": 99}}';
    expect(parseJsonFromLlmResponse(input)).toEqual({"inner": 99});
  });

  // --- Edge cases that should not hang ---

  test('throws on empty string without hanging', () => {
    expect(() => parseJsonFromLlmResponse('')).toThrow();
  }, 1000);

  test('throws on input with only opening brackets without hanging', () => {
    expect(() => parseJsonFromLlmResponse('[[[')).toThrow();
  }, 1000);

  test('throws on input with only closing brackets without hanging', () => {
    expect(() => parseJsonFromLlmResponse('}}}')).toThrow();
  }, 1000);
});
