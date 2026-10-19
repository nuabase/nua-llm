import { NuaGateway } from '../nua-gateway';
import { TEST_TIMEOUT_MS } from './helpers/gateway-env';
import z from 'zod';

describe('nuaGateway.get()', () => {
  let nua: NuaGateway;
  beforeAll(() => {
    nua = new NuaGateway();
  });

  test(
    'basic response shape validation',
    async () => {
      const AddressSchema = z.object({
        addressLine1: z.string().min(1, 'Address line 1 cannot be empty.'),
        addressLine2: z.string().optional(),
        city: z.string().min(1, 'City cannot be empty.'),
        region: z.string().optional(),
        postalCode: z.string().optional(),
        country: z
          .string()
          .length(2, 'Country must be a 2-letter ISO code.')
          .regex(/^[A-Z]{2}$/, 'Country must be a 2-letter uppercase ISO code.'),
      });

      const inputData = `Unit 14
88 Lorikeet Lane
Chatswood NSW 2067
Australia`;

      const response = await nua.get('Map the given text into the address schema', {
        input: inputData,
        output: {
          name: 'address',
          schema: AddressSchema,
        },
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);
      expect(response).toBeTruthy();
      expect(response.data).toBeTruthy();
    },
    TEST_TIMEOUT_MS
  );

  test(
    'usage field validation',
    async () => {
      const response = await nua.get('Return the number 10', {
        output: {
          name: 'result',
          schema: z.number(),
        },
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);

      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThanOrEqual(0);
      expect(response.usage.completionTokens).toBeGreaterThanOrEqual(0);
      expect(response.usage.totalTokens).toBeGreaterThanOrEqual(0);
      expect(response.usage.totalTokens).toBe(
        response.usage.promptTokens + response.usage.completionTokens
      );
    },
    TEST_TIMEOUT_MS
  );

  test(
    'result metadata fields',
    async () => {
      const response = await nua.get('Return the number 10', {
        output: {
          name: 'result',
          schema: z.number(),
        },
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);

      expect(response.data).toBe(10);
      expect(response.source).toBe('gateway');

      expect(typeof response.model).toBe('string');
      expect(response.model.length).toBeGreaterThan(0);

      expect(typeof response.latencyMs).toBe('number');
      expect(response.latencyMs).toBeGreaterThan(0);

      expect(typeof response.meta.requestId).toBe('string');
      expect(response.meta.requestId.length).toBeGreaterThan(0);
      expect(typeof response.meta.cached).toBe('boolean');
      expect(response.meta.llmUsage).toBeDefined();
      expect(response.meta.cacheUsage).toBeDefined();
    },
    TEST_TIMEOUT_MS
  );

  test('rejects an empty prompt before calling the API', async () => {
    await expect(nua.get('  ')).rejects.toThrow('Prompt must be a non-empty string');
  });
});
