import { authPost } from './setup';
import {
  castArrayRequest,
  twoPeople,
  foodItems,
  stateCapitals,
  profileSummarySchema,
  profileSummaryZod,
  foodCalorieSchema,
  foodCalorieZod,
  capitalInfoSchema,
  capitalInfoZod
} from './fixtures';

describe('POST /cast/array', () => {
  describe('/now (synchronous)', () => {
    it('processes array of 2 people', async () => {
      const res = await authPost('/cast/array/now')
        .send(castArrayRequest(twoPeople, 'Summarize the provided data.', 'profileSummary', profileSummarySchema))
        .expect(200);

      expect(res.body.isSuccess).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveLength(2);
      for (const item of res.body.data) {
        expect(item.id).toBeDefined();
        expect(() => profileSummaryZod.parse(item.profileSummary)).not.toThrow();
      }
    });

    it('processes 4 food items and returns count == 4', async () => {
      const res = await authPost('/cast/array/now')
        .send(castArrayRequest(
          foodItems,
          'Add calories to the food items.',
          'foodItemCalorieInfo',
          foodCalorieSchema
        ))
        .expect(200);

      expect(res.body.isSuccess).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveLength(4);
      for (const item of res.body.data) {
        expect(item.id).toBeDefined();
        expect(() => foodCalorieZod.parse(item.foodItemCalorieInfo)).not.toThrow();
      }
    });
  });

  describe('/ (async)', () => {
    it('returns id for polling', async () => {
      const res = await authPost('/cast/array')
        .send(castArrayRequest(twoPeople, 'Summarize the provided data.', 'profileSummary', profileSummarySchema))
        .expect(200);

      expect(res.body.id).toBeDefined();
    });

    it('accepts 3 food items for async processing', async () => {
      const res = await authPost('/cast/array')
        .send(castArrayRequest(
          foodItems.slice(0, 3),
          'Add calories to the food items.',
          'foodItemCalorieInfo',
          foodCalorieSchema
        ))
        .expect(200);

      expect(res.body.id).toBeDefined();
    });
  });

  describe('caching behavior', () => {
    it('first request with invalidateCache:true has cacheHits==0 and valid llmUsage', async () => {
      const res = await authPost('/cast/array/now')
        .send(castArrayRequest(
          stateCapitals,
          'For each state, provide its capital city.',
          'capitalInfo',
          capitalInfoSchema,
          { invalidateCache: true }
        ))
        .expect(200);

      expect(res.body.isSuccess).toBe(true);
      expect(res.body.kind).toBe('cast/array');
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveLength(4);
      for (const item of res.body.data) {
        expect(item.id).toBeDefined();
        expect(() => capitalInfoZod.parse(item.capitalInfo)).not.toThrow();
      }
      expect(res.body.cacheHits).toBe(0);

      // LLM usage in valid range
      expect(res.body.llmUsage.promptTokens).toBeGreaterThanOrEqual(100);
      expect(res.body.llmUsage.promptTokens).toBeLessThanOrEqual(5000);
      expect(res.body.llmUsage.completionTokens).toBeGreaterThanOrEqual(10);
      expect(res.body.llmUsage.completionTokens).toBeLessThanOrEqual(2000);
      expect(res.body.llmUsage.totalTokens).toBeGreaterThanOrEqual(110);
      expect(res.body.llmUsage.totalTokens).toBeLessThanOrEqual(7000);

      // Cache usage should be zero
      expect(res.body.cacheUsage.promptTokens).toBe(0);
      expect(res.body.cacheUsage.completionTokens).toBe(0);
      expect(res.body.cacheUsage.totalTokens).toBe(0);
    });

    it('second request without invalidateCache hits cache for all 4 items', async () => {
      // Ensure cache is populated first
      await authPost('/cast/array/now')
        .send(castArrayRequest(
          stateCapitals,
          'For each state, provide its capital city.',
          'capitalInfo',
          capitalInfoSchema,
          { invalidateCache: true }
        ))
        .expect(200);

      // Now test cache hit
      const res = await authPost('/cast/array/now')
        .send(castArrayRequest(
          stateCapitals,
          'For each state, provide its capital city.',
          'capitalInfo',
          capitalInfoSchema
        ))
        .expect(200);

      expect(res.body.isSuccess).toBe(true);
      expect(res.body.kind).toBe('cast/array');
      expect(res.body.data).toBeDefined();
      expect(res.body.data).toHaveLength(4);
      for (const item of res.body.data) {
        expect(item.id).toBeDefined();
        expect(() => capitalInfoZod.parse(item.capitalInfo)).not.toThrow();
      }
      expect(res.body.cacheHits).toBe(4);

      // LLM usage should be zero
      expect(res.body.llmUsage.promptTokens).toBe(0);
      expect(res.body.llmUsage.completionTokens).toBe(0);
      expect(res.body.llmUsage.totalTokens).toBe(0);

      // Cache usage should be non-zero
      expect(res.body.cacheUsage.totalTokens).toBeGreaterThanOrEqual(1);
    });
  });
});
