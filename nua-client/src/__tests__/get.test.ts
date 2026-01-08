import { createTestClient, getTestModes } from './helpers';
import z from 'zod';

const testModes = getTestModes();

describe.each(testModes)('nua.get() [%s mode]', (mode) => {
  const nua = createTestClient(mode);

  test('basic response shape validation', async () => {
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
  }, 30000);

  test('usage field validation', async () => {
    const NumberSchema = z.number();

    const response = await nua.get('Return the number 10', {
      output: {
        name: 'result',
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

    const response = await nua.get('Return the number 10', {
      output: {
        name: 'result',
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
