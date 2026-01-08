import { authPost, authGet } from './setup';
import { castValueRequest, singlePerson, profileSummarySchema } from './fixtures';

describe('POST /cast/value', () => {
  describe('/now (synchronous)', () => {
    it('returns success with llmRequestId and data.summary', async () => {
      const res = await authPost('/cast/value/now')
        .send(castValueRequest(singlePerson, 'Summarize the provided data.', 'profileSummary', profileSummarySchema))
        .expect(200);

      expect(res.body.llmRequestId).toBeDefined();
      expect(res.body.isSuccess).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.summary).toBeDefined();
    });
  });

  describe('chained: /now then GET /requests/:id', () => {
    it('stores result accessible via GET /requests/:id', async () => {
      // First request
      const castRes = await authPost('/cast/value/now')
        .send(castValueRequest(singlePerson, 'Summarize the provided data.', 'userProfileSummary', profileSummarySchema))
        .expect(200);

      expect(castRes.body.isSuccess).toBe(true);
      expect(castRes.body.data).toBeDefined();
      expect(castRes.body.data.summary).toBeDefined();

      const requestId = castRes.body.llmRequestId;

      // Verify stored result
      const getRes = await authGet(`/requests/${requestId}`)
        .expect(200);

      expect(getRes.body.id).toBe(requestId);
      expect(getRes.body.result).toBeDefined();
      expect(getRes.body.result.data).toBeDefined();
    });
  });
});
