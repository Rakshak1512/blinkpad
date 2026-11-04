import test from 'node:test';
import assert from 'node:assert/strict';

import { isValidPageName, sanitizeFilename, sanitizePageName, isAllowedFileType, getFileExtension } from '../src/utils/validator.ts';
import { hashPassword, verifyPassword, createAuthToken, verifyAuthToken, generateSalt } from '../src/services/cryptoService.ts';
import { calculatePageExpiresAt, calculateFileExpiresAt, isPageExpired, PAGE_LIFETIME_MS } from '../src/expiration/cleanup.ts';

test('Validator: page name validation and path traversal prevention', () => {
  assert.equal(isValidPageName('raj9812'), true);
  assert.equal(isValidPageName('project-notes_2026'), true);
  assert.equal(isValidPageName('a'), false, 'too short');
  assert.equal(isValidPageName('abc/def'), false, 'slashes forbidden');
  assert.equal(isValidPageName('..'), false, 'traversal forbidden');
  assert.equal(isValidPageName('notes/../secret'), false, 'traversal forbidden');
  assert.equal(isValidPageName('notes\\secret'), false, 'backslashes forbidden');
  assert.equal(isValidPageName('valid-page-123'), true);
});

test('Validator: sanitize filename and allowed extensions', () => {
  assert.equal(sanitizeFilename('../../secret.txt'), 'secret.txt');
  assert.equal(sanitizeFilename('my image (1).png'), 'my_image__1_.png');
  assert.equal(isAllowedFileType('document.pdf'), true);
  assert.equal(isAllowedFileType('archive.zip'), true);
  assert.equal(isAllowedFileType('photo.jpeg'), true);
  assert.equal(isAllowedFileType('script.exe'), false);
  assert.equal(isAllowedFileType('malware.bat'), false);
  assert.equal(getFileExtension('archive.tar.gz'), 'gz');
});

test('Crypto: password hashing and verification with PBKDF2', async () => {
  const salt = generateSalt();
  const password = 'SecretPassword123!';
  const hash = await hashPassword(password, salt);

  assert.ok(hash.length > 32);
  const isValid = await verifyPassword(password, salt, hash);
  assert.equal(isValid, true);

  const isInvalid = await verifyPassword('WrongPassword', salt, hash);
  assert.equal(isInvalid, false);
});

test('Crypto: session HMAC auth token creation and verification', async () => {
  const secret = 'test-secret-key-123';
  const pageName = 'raj9812';
  const expiresAt = Date.now() + 10000;

  const token = await createAuthToken(pageName, expiresAt, secret);
  assert.ok(token.includes('.'));

  const isValid = await verifyAuthToken(token, pageName, secret);
  assert.equal(isValid, true);

  const wrongPage = await verifyAuthToken(token, 'other-page', secret);
  assert.equal(wrongPage, false);

  const wrongSecret = await verifyAuthToken(token, pageName, 'wrong-secret');
  assert.equal(wrongSecret, false);
});

test('Expiration: 24-hour page expiration and file bounds', () => {
  const now = 1730000000000;
  const pageExpiresAt = calculatePageExpiresAt(now);

  assert.equal(pageExpiresAt, now + 24 * 3600 * 1000);
  assert.equal(pageExpiresAt - now, PAGE_LIFETIME_MS);

  // File uploaded 10 hours after page creation
  const file1Upload = now + 10 * 3600 * 1000;
  const file1ExpiresAt = calculateFileExpiresAt(file1Upload, pageExpiresAt);
  // File 1 upload + 48h would exceed pageExpiresAt, so it must clamp to pageExpiresAt!
  assert.equal(file1ExpiresAt, pageExpiresAt);

  // Expired check
  assert.equal(isPageExpired({ expires_at: now - 1000 }, now), true);
  assert.equal(isPageExpired({ expires_at: now + 1000 }, now), false);
});
