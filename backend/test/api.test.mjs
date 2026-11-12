import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';

// Test the Express server directly
process.env.VERCEL = '1';
process.env.AUTH_SECRET = 'test-secret-key-at-least-32-chars-long-12345';
const { default: app } = await import('../src/server.ts');

test('API: Root landing and health check endpoints', async () => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /
    const rootRes = await fetch(`${baseUrl}/`);
    assert.equal(rootRes.status, 200);
    const rootData = await rootRes.json();
    assert.equal(rootData.success, true);
    assert.equal(rootData.database, 'Supabase PostgreSQL');
    assert.equal(rootData.storage, 'Supabase Storage');

    // 2. GET /health
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'ok');
    assert.equal(healthData.database, 'Supabase PostgreSQL');
    assert.equal(healthData.expiry_policy, 'Strict 12-Hour Expiration');

    // 3. GET /api/health
    const apiHealthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(apiHealthRes.status, 200);

    // 4. Unknown endpoint returns controlled 404 JSON
    const notFoundRes = await fetch(`${baseUrl}/api/unknown-endpoint-xyz`);
    assert.equal(notFoundRes.status, 404);
    const notFoundData = await notFoundRes.json();
    assert.equal(notFoundData.code, 'NOT_FOUND');

    // 5. Cleanup endpoint unauthorized check
    process.env.CRON_SECRET = 'secret-cron-token-1234';
    const unauthorizedCleanup = await fetch(`${baseUrl}/api/admin/cleanup`, {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });
    assert.equal(unauthorizedCleanup.status, 401);
  } finally {
    server.close();
  }
});
