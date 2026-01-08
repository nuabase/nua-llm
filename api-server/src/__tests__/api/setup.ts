import request from 'supertest';

const API_TOKEN = process.env.nua_api_token || '';
const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3030';

export const api = request(BASE_URL);

export const authPost = (path: string) =>
  api.post(path)
    .set('Authorization', `Bearer ${API_TOKEN}`)
    .set('Content-Type', 'application/json');

export const authGet = (path: string) =>
  api.get(path)
    .set('Authorization', `Bearer ${API_TOKEN}`);
