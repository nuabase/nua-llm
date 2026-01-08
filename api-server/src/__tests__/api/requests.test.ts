import { authPost, authGet } from './setup';
import { castArrayRequest, twoPeople, profileSummarySchema } from './fixtures';

describe('GET /requests/:id', () => {
  it('returns request details with id', async () => {
    // Create a request first
    const createRes = await authPost('/cast/array')
      .send(castArrayRequest(twoPeople, 'Summarize the provided data.', 'profileSummary', profileSummarySchema))
      .expect(200);

    const requestId = createRes.body.id;

    // Get the request
    const res = await authGet(`/requests/${requestId}`)
      .expect(200);

    expect(res.body.id).toBeDefined();
  });
});
