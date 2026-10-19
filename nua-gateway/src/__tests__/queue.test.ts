import { NuaGateway } from '../nua-gateway';
import { TEST_TIMEOUT_MS } from './helpers/gateway-env';
import z from 'zod';

// queueGet() and queueList() only submit a job: the Nuabase API runs it later and
// delivers the result by webhook or SSE. These tests check that a job is accepted.
describe('nuaGateway queue operations', () => {
  let nua: NuaGateway;
  beforeAll(() => {
    nua = new NuaGateway();
  });

  test(
    'queueGet() returns a job id',
    async () => {
      const response = await nua.queueGet('Return the number 7', {
        output: { name: 'result', schema: z.number() },
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);

      expect(response.source).toBe('gateway');
      expect(typeof response.jobId).toBe('string');
      expect(response.jobId.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );

  test(
    'queueList() returns a job id',
    async () => {
      const response = await nua.queueList('Return double the value of the input number', {
        input: [
          { id: 1, value: 5 },
          { id: 2, value: 10 },
        ],
        primaryKey: 'id',
        output: { name: 'doubled', schema: z.number() },
      });

      if (!response.success) throw new Error(`error in api response: ${response.error}`);

      expect(response.source).toBe('gateway');
      expect(typeof response.jobId).toBe('string');
      expect(response.jobId.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS
  );
});
