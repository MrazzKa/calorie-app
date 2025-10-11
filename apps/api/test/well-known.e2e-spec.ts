import request from 'supertest';

const ROOT = (process.env.API_PUBLIC_ORIGIN ?? (process.env.API_URL ?? 'http://localhost:3000/v1')).replace(/\/v1$/, '');

describe('Well-known e2e (live API)', () => {
  it('AASA returns appIDs and components', async () => {
    const r = await request(ROOT).get('/.well-known/apple-app-site-association').expect(200);
    const aasa = r.body;
    expect(aasa.applinks).toBeTruthy();
    const details = aasa.applinks.details?.[0];
    expect(details.appIDs?.length).toBeGreaterThan(0);
    expect(details.components?.length).toBeGreaterThan(0);
  });

  it('AssetLinks returns android target', async () => {
    const r = await request(ROOT).get('/.well-known/assetlinks.json').expect(200);
    const arr = r.body as any[];
    expect(Array.isArray(arr)).toBe(true);
    const item = arr[0];
    expect(item.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(item.target?.namespace).toBe('android_app');
    expect(typeof item.target?.package_name).toBe('string');
  });
});
