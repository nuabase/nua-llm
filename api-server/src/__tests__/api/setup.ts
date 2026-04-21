import request from 'supertest';

const API_TOKEN = process.env.NUABASE_API_KEY || '';
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3030';

export const api = request(BASE_URL);

beforeAll(async () => {
  try {
    await fetch(BASE_URL);
  } catch {
    throw new Error(
      `API server not reachable at ${BASE_URL}. Start it with \`npm run dev\`, or set API_BASE_URL. See api-server/TESTING.md.`
    );
  }
});

export const authPost = (path: string) =>
  api.post(path)
    .set('Authorization', `Bearer ${API_TOKEN}`)
    .set('Content-Type', 'application/json');

export const authGet = (path: string) =>
  api.get(path)
    .set('Authorization', `Bearer ${API_TOKEN}`);
