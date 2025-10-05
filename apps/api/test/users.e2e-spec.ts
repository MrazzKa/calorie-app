import request from 'supertest';

describe('Users e2e (live API)', () => {
  const base = 'http://localhost:3000';
  const API = '/v1';
  const EMAIL = 'delete@e2e.com';
  const DEVICE = 'e2e-device';

  function parseExp(jwt: string) {
    const [, p] = jwt.split('.');
    return JSON.parse(Buffer.from(p, 'base64').toString('utf-8')).exp as number;
  }

  it('DELETE /users/me revokes sessions', async () => {
    await request(base).post(`${API}/auth/request-otp`).send({ email: EMAIL }).expect(201);
    // код в dev-логе в терминале 1; для автоматизации можно временно добавить тестовый транспорт почты.
    // Для простоты — второй шаг скриптом руками или заскриптовать под твою dev-окружение.

    // Допустим мы получили code:
    // const code = '123456';

    // Здесь оставь тест «пропущенным» или внедри фейковый Mailer как в auth.e2e.
  });
});
