/**
 * Tests for what the Nuabase API keeps about each request, checked by calling it directly:
 * - Request ID tracking (llmRequestId)
 * - Request retrieval (GET /requests/:id)
 * - Cache usage tracking (llmUsage vs cacheUsage)
 *
 * Calls the API at NUABASE_API_URL (the hosted API by default) with NUABASE_API_KEY.
 */

import { NuaGateway } from '../nua-gateway';
import { apiBaseUrl, authHeaders } from './helpers/gateway-env';
import { z } from 'zod';

describe('gateway-only features', () => {
  describe('request tracking', () => {
    test('castValue returns llmRequestId', async () => {
      const headers = authHeaders();

      const response = await fetch(`${apiBaseUrl()}/cast/value/now`, {
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
      const headers = authHeaders();

      // First, make a request
      const castResponse = await fetch(`${apiBaseUrl()}/cast/value/now`, {
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
      const getResponse = await fetch(`${apiBaseUrl()}/requests/${requestId}`, {
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
      const nua = new NuaGateway();
      const headers = authHeaders();
      const specifiedModel = {
        provider: 'openrouter' as const,
        model: 'anthropic/claude-sonnet-5.5',
      };

      const response = await nua.get('Return the number 99', {
        output: {
          name: 'result',
          schema: z.number(),
        },
        model: specifiedModel,
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);
      // Check response model matches
      expect(response.model).toBe(specifiedModel.model);

      // Retrieve the stored request and verify model
      const requestId = response.meta.requestId;
      expect(requestId).toBeDefined();

      const getResponse = await fetch(`${apiBaseUrl()}/requests/${requestId}`, {
        headers,
      });

      expect(getResponse.ok).toBe(true);

      const requestData = await getResponse.json();
      expect(requestData.provider).toBe(specifiedModel.provider);
      expect(requestData.model).toBe(specifiedModel.model);
    }, 30000);
  });

  describe('cache behavior', () => {
    test('response includes both llmUsage and cacheUsage', async () => {
      const headers = authHeaders();

      // Use a unique prompt to avoid cache hits from other tests
      const uniquePrompt = `Return the number ${Date.now()}`;

      const response = await fetch(`${apiBaseUrl()}/cast/value/now`, {
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
    const nua = new NuaGateway();
    const NumberSchema = z.number();
    const specifiedModel = {
      provider: 'openrouter' as const,
      model: 'anthropic/claude-sonnet-5.5',
    };

    const response = await nua.get('Return the number 42', {
      output: {
        name: 'result',
        schema: NumberSchema,
      },
      model: specifiedModel,
    });

    if (!response.success) throw new Error(`error in api response: ${response.error}`);

    expect(response.model).toBe(specifiedModel.model);
  }, 30000);
});
