import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.ts';
import { MockR2Bucket } from './mockR2.js';

function createEnv() {
  return {
    R2_BUCKET: new MockR2Bucket(),
    APP_NAME: 'QuickPad',
    APP_ENV: 'test',
    ALLOWED_ORIGIN: '*',
    AUTH_SECRET: 'quickpad-test-secret-key-abcdef123456',
  };
}

const dummyCtx = {
  waitUntil: (p) => p,
  passThroughOnException: () => {},
};

test('E2E: Health check endpoint', async () => {
  const env = createEnv();
  const req = new Request('http://localhost:8787/health');
  const res = await worker.fetch(req, env, dummyCtx);

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.equal(data.app, 'QuickPad');
});

test('E2E: Create page raj9812, retrieve, edit content, and verify persistence', async () => {
  const env = createEnv();

  // 1. Create page
  const createReq = new Request('http://localhost:8787/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'raj9812' }),
  });
  const createRes = await worker.fetch(createReq, env, dummyCtx);
  assert.equal(createRes.status, 201);
  const createData = await createRes.json();
  assert.equal(createData.success, true);
  assert.equal(createData.page.name, 'raj9812');
  assert.ok(createData.page.expires_at > Date.now());

  // 2. Duplicate create returns 409
  const dupReq = new Request('http://localhost:8787/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'raj9812' }),
  });
  const dupRes = await worker.fetch(dupReq, env, dummyCtx);
  assert.equal(dupRes.status, 409);

  // 3. Retrieve page raj9812
  const getReq = new Request('http://localhost:8787/api/pages/raj9812');
  const getRes = await worker.fetch(getReq, env, dummyCtx);
  assert.equal(getRes.status, 200);
  const getData = await getRes.json();
  assert.equal(getData.page.name, 'raj9812');
  assert.equal(getData.content, '');

  // 4. Update content
  const putReq = new Request('http://localhost:8787/api/pages/raj9812/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Hello from device 1!\nThis is quickpad shared notes.' }),
  });
  const putRes = await worker.fetch(putReq, env, dummyCtx);
  assert.equal(putRes.status, 200);
  const putData = await putRes.json();
  assert.equal(putData.success, true);

  // 5. Verify device 2 sees updated content
  const getReq2 = new Request('http://localhost:8787/api/pages/raj9812');
  const getRes2 = await worker.fetch(getReq2, env, dummyCtx);
  const getData2 = await getRes2.json();
  assert.equal(getData2.content, 'Hello from device 1!\nThis is quickpad shared notes.');
});

test('E2E: Upload file, download original file, and delete file', async () => {
  const env = createEnv();

  // Create page
  await worker.fetch(
    new Request('http://localhost:8787/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'fileshare' }),
    }),
    env,
    dummyCtx
  );

  // Upload a sample text/pdf file using binary stream upload with headers
  const fileBytes = new TextEncoder().encode('Dummy ZIP or PDF file contents 123456');
  const uploadReq = new Request('http://localhost:8787/api/pages/fileshare/files', {
    method: 'POST',
    headers: {
      'content-type': 'application/pdf',
      'x-file-name': encodeURIComponent('report.pdf'),
      'content-length': fileBytes.byteLength.toString(),
    },
    body: fileBytes,
  });
  const uploadRes = await worker.fetch(uploadReq, env, dummyCtx);
  assert.equal(uploadRes.status, 201);
  const uploadData = await uploadRes.json();
  assert.equal(uploadData.success, true);
  assert.equal(uploadData.file.name, 'report.pdf');
  const fileId = uploadData.file.id;

  // Verify file in getPage
  const pageRes = await worker.fetch(new Request('http://localhost:8787/api/pages/fileshare'), env, dummyCtx);
  const pageData = await pageRes.json();
  assert.equal(pageData.page.files.length, 1);
  assert.equal(pageData.page.files[0].id, fileId);

  // Download file
  const downloadReq = new Request(`http://localhost:8787/api/pages/fileshare/files/${fileId}?download=true`);
  const downloadRes = await worker.fetch(downloadReq, env, dummyCtx);
  assert.equal(downloadRes.status, 200);
  assert.ok(downloadRes.headers.get('content-disposition')?.includes('attachment; filename="report.pdf"'));
  const downloadedText = await downloadRes.text();
  assert.equal(downloadedText, 'Dummy ZIP or PDF file contents 123456');

  // Delete file
  const delFileReq = new Request(`http://localhost:8787/api/pages/fileshare/files/${fileId}`, {
    method: 'DELETE',
  });
  const delFileRes = await worker.fetch(delFileReq, env, dummyCtx);
  assert.equal(delFileRes.status, 200);

  // Verify file is gone from page
  const pageResAfter = await worker.fetch(new Request('http://localhost:8787/api/pages/fileshare'), env, dummyCtx);
  const pageDataAfter = await pageResAfter.json();
  assert.equal(pageDataAfter.page.files.length, 0);
});

test('E2E: Optional Password Protection flow', async () => {
  const env = createEnv();

  // Create page
  await worker.fetch(
    new Request('http://localhost:8787/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'protected-page' }),
    }),
    env,
    dummyCtx
  );

  // Enable password
  const setPassReq = new Request('http://localhost:8787/api/pages/protected-page/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword: 'SuperSecretPassword' }),
  });
  const setPassRes = await worker.fetch(setPassReq, env, dummyCtx);
  assert.equal(setPassRes.status, 200);
  const setPassData = await setPassRes.json();
  assert.equal(setPassData.has_password, true);

  // Requesting page without password should return 401
  const getReqNoAuth = new Request('http://localhost:8787/api/pages/protected-page');
  const getResNoAuth = await worker.fetch(getReqNoAuth, env, dummyCtx);
  assert.equal(getResNoAuth.status, 401);
  const noAuthData = await getResNoAuth.json();
  assert.equal(noAuthData.requiresPassword, true);

  // Verify password with wrong password -> 401
  const verifyWrongReq = new Request('http://localhost:8787/api/pages/protected-page/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'WrongPassword' }),
  });
  const verifyWrongRes = await worker.fetch(verifyWrongReq, env, dummyCtx);
  assert.equal(verifyWrongRes.status, 401);

  // Verify password with correct password -> 200 with token
  const verifyCorrectReq = new Request('http://localhost:8787/api/pages/protected-page/verify-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'SuperSecretPassword' }),
  });
  const verifyCorrectRes = await worker.fetch(verifyCorrectReq, env, dummyCtx);
  assert.equal(verifyCorrectRes.status, 200);
  const verifyData = await verifyCorrectRes.json();
  assert.ok(verifyData.token);

  // Request page with token in Authorization header -> 200
  const getReqWithToken = new Request('http://localhost:8787/api/pages/protected-page', {
    headers: { Authorization: `Bearer ${verifyData.token}` },
  });
  const getResWithToken = await worker.fetch(getReqWithToken, env, dummyCtx);
  assert.equal(getResWithToken.status, 200);
});

test('E2E: Scheduled Cleanup and Expiration', async () => {
  const env = createEnv();

  // Create page
  await worker.fetch(
    new Request('http://localhost:8787/api/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'expired-test' }),
    }),
    env,
    dummyCtx
  );

  // Manually modify manifest in R2 to be expired
  const manifestObj = await env.R2_BUCKET.get('pages/expired-test/manifest.json');
  const manifest = JSON.parse(await manifestObj.text());
  manifest.expires_at = Date.now() - 1000; // expired in past
  await env.R2_BUCKET.put('pages/expired-test/manifest.json', JSON.stringify(manifest), {
    customMetadata: { expires_at: manifest.expires_at.toString() }
  });

  // Run scheduled cleanup
  const cleanupReq = new Request('http://localhost:8787/api/admin/cleanup', { method: 'POST' });
  const cleanupRes = await worker.fetch(cleanupReq, env, dummyCtx);
  assert.equal(cleanupRes.status, 200);
  const cleanupData = await cleanupRes.json();
  assert.ok(cleanupData.expiredPagesProcessed.includes('expired-test'));

  // Ensure object is now completely gone
  const checkGone = await env.R2_BUCKET.get('pages/expired-test/manifest.json');
  assert.equal(checkGone, null);

  // Re-attempting to get the page returns 404 since it's purged
  const getReq = new Request('http://localhost:8787/api/pages/expired-test');
  const getRes = await worker.fetch(getReq, env, dummyCtx);
  assert.equal(getRes.status, 404);
});
