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

  test('throws when no valid JSON is found', () => {
    expect(() => parseJsonFromLlmResponse('no json here')).toThrow();
  });
});
