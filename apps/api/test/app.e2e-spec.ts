import request from 'supertest';

jest.setTimeout(30000);

describe('App (live) - smoke', () => {
  it('/v1/health (GET) -> 200', async () => {
    await request('http://localhost:3000').get('/v1/health').expect(200);
  });
});
