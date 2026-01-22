import { extractJsonFromMarkdown } from '../modules/execution/call-llm-service';

describe('extractJsonFromMarkdown', () => {
  test('removes regular code fences with content on a new line', () => {
    const input = '```\n{"a":1}\n```';
    expect(extractJsonFromMarkdown(input)).toBe('{"a":1}');
  });

  test('removes json code fences with content on a new line', () => {
    const input = '```json\n{"a":1}\n```';
    expect(extractJsonFromMarkdown(input)).toBe('{"a":1}');
  });

  test('removes json code fences when content starts after a blank line', () => {
    const input = '```json\n\n{"a":1}\n```';
    expect(extractJsonFromMarkdown(input)).toBe('{"a":1}');
  });

  test('removes regular code fences when content is on the same line', () => {
    const input = '``` [1,2,3] ```';
    expect(extractJsonFromMarkdown(input)).toBe('[1,2,3]');
  });

  test('removes json code fences when content is on the same line', () => {
    const input = '```json [1,2,3] ```';
    expect(extractJsonFromMarkdown(input)).toBe('[1,2,3]');
  });
});
