import { NuaGateway } from '../nua-gateway';
import { TEST_TIMEOUT_MS } from './helpers/gateway-env';
import z from 'zod';

describe('nuaGateway.list()', () => {
  let nua: NuaGateway;
  beforeAll(() => {
    nua = new NuaGateway();
  });

  test(
    'basic response shape validation',
    async () => {
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

      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data).toHaveLength(3);
    },
    TEST_TIMEOUT_MS
  );

  test(
    'result metadata fields',
    async () => {
      const inputData = [
        { id: 1, value: 5 },
        { id: 2, value: 10 },
      ];

      const response = await nua.list('Return double the value of the input number', {
        input: inputData,
        primaryKey: 'id',
        output: {
          name: 'doubled',
          schema: z.number(),
        },
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);

      expect(response.data).toEqual(
        expect.arrayContaining([
          { id: 1, doubled: 10 },
          { id: 2, doubled: 20 },
        ])
      );
      expect(response.source).toBe('gateway');

      expect(response.usage.totalTokens).toBe(
        response.usage.promptTokens + response.usage.completionTokens
      );

      expect(typeof response.model).toBe('string');
      expect(response.model.length).toBeGreaterThan(0);
      expect(response.latencyMs).toBeGreaterThan(0);

      expect(typeof response.meta.requestId).toBe('string');
      expect(typeof response.meta.cached).toBe('boolean');
      expect(response.meta.llmUsage).toBeDefined();
      expect(response.meta.cacheUsage).toBeDefined();
    },
    TEST_TIMEOUT_MS
  );

  test('rejects input that is not an array before calling the API', async () => {
    await expect(
      nua.list('Double each value', {
        input: 'not an array' as unknown as { id: number }[],
        primaryKey: 'id',
        output: { name: 'doubled', schema: z.number() },
      })
    ).rejects.toThrow('Input must be an array for list()');
  });
});
