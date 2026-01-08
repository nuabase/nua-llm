import { createTestClient, getTestModes } from './helpers';
import z from 'zod';

const testModes = getTestModes();

describe.each(testModes)('nua.list() [%s mode]', (mode) => {
  const nua = createTestClient(mode);

  test('basic response shape validation', async () => {
    const FoodItemSchema = z.object({
      food_name: z.string(),
      quantity: z.number(),
      quantity_unit: z.string(),
      calories_per_unit: z.number(),
    });

    const inputData = [
      { id: 1, name: 'Biriyani' },
      { id: 2, name: 'Pizza slice' },
      { id: 3, name: 'Chapati' },
    ];

    const response = await nua.list(
      'Add calories_per_single_unit with the number of calories for each food item, for 1 unit of its qty',
      {
        input: inputData,
        primaryKey: 'id',
        output: {
          name: 'foodItem',
          schema: FoodItemSchema,
        },
      }
    );

    if (!response.success) throw new Error(`error in api response: ${response.error}`);

    const result = response.data;
    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) return;

    expect(result).toHaveLength(3);
  }, 30000);

  test('usage field validation', async () => {
    const NumberSchema = z.number();

    const inputData = [
      { id: 1, value: 5 },
      { id: 2, value: 10 },
    ];

    const response = await nua.list('Return double the value of the input number', {
      input: inputData,
      primaryKey: 'id',
      output: {
        name: 'doubled',
        schema: NumberSchema,
      },
    });

    if (!response.success) throw new Error(`error in api response: ${response.error}`);

    expect(response.success).toBe(true);

    // usage should have values
    expect(response.usage).toBeDefined();
    expect(response.usage.promptTokens).toBeGreaterThanOrEqual(0);
    expect(response.usage.completionTokens).toBeGreaterThanOrEqual(0);
    expect(response.usage.totalTokens).toBeGreaterThanOrEqual(0);
    expect(response.usage.totalTokens).toBe(
      response.usage.promptTokens + response.usage.completionTokens
    );
  }, 30000);

  test('result metadata fields', async () => {
    const NumberSchema = z.number();

    const inputData = [
      { id: 1, value: 5 },
      { id: 2, value: 10 },
    ];

    const response = await nua.list('Return double the value of the input number', {
      input: inputData,
      primaryKey: 'id',
      output: {
        name: 'doubled',
        schema: NumberSchema,
      },
    });

    if (!response.success) throw new Error(`error in api response: ${response.error}`);

    // source should match the mode
    expect(response.source).toBe(mode);

    // model should be a non-empty string
    expect(response.model).toBeDefined();
    expect(typeof response.model).toBe('string');
    expect(response.model.length).toBeGreaterThan(0);

    // latencyMs should be a positive number
    expect(response.latencyMs).toBeDefined();
    expect(typeof response.latencyMs).toBe('number');
    expect(response.latencyMs).toBeGreaterThan(0);

    // meta should exist
    expect(response.meta).toBeDefined();

    // gateway-specific meta fields
    if (response.source === 'gateway') {
      expect(response.meta.requestId).toBeDefined();
      expect(typeof response.meta.requestId).toBe('string');
      expect(typeof response.meta.cached).toBe('boolean');
      expect(response.meta.llmUsage).toBeDefined();
      expect(response.meta.cacheUsage).toBeDefined();
    }
  }, 30000);
});
