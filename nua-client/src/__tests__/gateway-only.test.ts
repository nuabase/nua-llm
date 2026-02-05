/**
 * Gateway-only tests for stateful features that require api-server.
 *
 * These tests verify features that are not available in direct mode:
 * - Request ID tracking (llmRequestId)
 * - Request retrieval (GET /requests/:id)
 * - Cache usage tracking (llmUsage vs cacheUsage)
 *
 * Prerequisites:
 * - api-server running on localhost:3030
 * - Valid NUABASE_API_KEY environment variable
 */

import { Nua } from '../nua';
import { z } from 'zod';

const baseUrl = process.env.NUABASE_API_URL
if (!baseUrl) throw new Error("NUABASE_API_URL must be set")

// Skip all tests if SKIP_GATEWAY_TESTS is set
const shouldSkip = process.env.SKIP_GATEWAY_TESTS === '1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const apiKey = process.env.NUABASE_API_KEY;
  if (!apiKey) {
    throw new Error('NUABASE_API_KEY is required for gateway-only tests');
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

describe('gateway-only features', () => {
  if (shouldSkip) {
    test.skip('skipped - SKIP_GATEWAY_TESTS is set', () => {});
    return;
  }

  describe('request tracking', () => {
    test('castValue returns llmRequestId', async () => {
      const headers = await getAuthHeaders();

      const response = await fetch(`${baseUrl}/cast/value/now`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: { prompt: 'Return the number 10', data: null },
          output: { name: 'result', schema: { type: 'number' } },
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.llmRequestId).toBeDefined();
      expect(typeof data.llmRequestId).toBe('string');
      expect(data.llmRequestId.length).toBeGreaterThan(0);
    }, 30000);

    test('getRequest returns stored request', async () => {
      const headers = await getAuthHeaders();

      // First, make a request
      const castResponse = await fetch(`${baseUrl}/cast/value/now`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: { prompt: 'Return the number 42', data: null },
          output: { name: 'result', schema: { type: 'number' } },
        }),
      });

      expect(castResponse.ok).toBe(true);

      const castData = await castResponse.json();
      const requestId = castData.llmRequestId;
      expect(requestId).toBeDefined();

      // Then, retrieve it
      const getResponse = await fetch(`${baseUrl}/requests/${requestId}`, {
        headers,
      });

      expect(getResponse.ok).toBe(true);

      const requestData = await getResponse.json();
      expect(requestData.id).toBe(requestId);
      expect(requestData.result).toBeDefined();
    }, 30000);
  });

  describe('model override', () => {
    test('response and stored request both have specified model', async () => {
      const nua = Nua.gateway({});
      const headers = await getAuthHeaders();
      const specifiedModel = 'claude-sonnet-4-5';

      const response = await nua.get('Return the number 99', {
        output: {
          name: 'result',
          schema: z.number(),
        },
        model: specifiedModel,
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);
      if (response.source !== 'gateway') throw new Error('expected gateway source');

      // Check response model matches
      expect(response.model).toBe(specifiedModel);

      // Retrieve the stored request and verify model
      const requestId = response.meta.requestId;
      expect(requestId).toBeDefined();

      const getResponse = await fetch(`${baseUrl}/requests/${requestId}`, {
        headers,
      });

      expect(getResponse.ok).toBe(true);

      const requestData = await getResponse.json();
      expect(requestData.model).toBe(specifiedModel);
    }, 30000);
  });

  describe('cache behavior', () => {
    test('response includes both llmUsage and cacheUsage', async () => {
      const headers = await getAuthHeaders();

      // Use a unique prompt to avoid cache hits from other tests
      const uniquePrompt = `Return the number ${Date.now()}`;

      const response = await fetch(`${baseUrl}/cast/value/now`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input: { prompt: uniquePrompt, data: null },
          output: { name: 'result', schema: { type: 'number' } },
        }),
      });

      expect(response.ok).toBe(true);

      const data = await response.json();

      // Verify response includes usage tracking fields
      expect(data.llmUsage).toBeDefined();
      expect(data.cacheUsage).toBeDefined();

      // llmUsage should have token counts
      expect(typeof data.llmUsage.promptTokens).toBe('number');
      expect(typeof data.llmUsage.completionTokens).toBe('number');
      expect(typeof data.llmUsage.totalTokens).toBe('number');

      // cacheUsage should have token counts (may be 0 for first request)
      expect(typeof data.cacheUsage.promptTokens).toBe('number');
      expect(typeof data.cacheUsage.completionTokens).toBe('number');
      expect(typeof data.cacheUsage.totalTokens).toBe('number');
    }, 30000);
  });

  test('model override returns specified model in response', async () => {
    const nua = Nua.gateway({});
    const NumberSchema = z.number();
    const specifiedModel = 'claude-sonnet-4-5';

    const response = await nua.get('Return the number 42', {
      output: {
        name: 'result',
        schema: NumberSchema,
      },
      model: specifiedModel,
    });

    if (!response.success) throw new Error(`error in api response: ${response.error}`);

    expect(response.model).toBe(specifiedModel);
  }, 30000);
});
