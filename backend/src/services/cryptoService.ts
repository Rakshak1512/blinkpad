export function generateUUID(): string {
  return crypto.randomUUID();
}

export function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256'
    },
    passwordKey,
    256
  );

  const hashArray = Array.from(new Uint8Array(derivedBits));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  return computedHash === expectedHash;
}

export async function createAuthToken(pageName: string, expiresAt: number, secretKey: string): Promise<string> {
  const enc = new TextEncoder();
  const payload = JSON.stringify({ page: pageName, exp: expiresAt });
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(signatureBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  const b64Payload = btoa(payload).replace(/=/g, '');
  return `${b64Payload}.${sigHex}`;
}

export async function verifyAuthToken(token: string, pageName: string, secretKey: string): Promise<boolean> {
  try {
    const [b64Payload, sigHex] = token.split('.');
    if (!b64Payload || !sigHex) return false;

    const payloadStr = atob(b64Payload);
    const data = JSON.parse(payloadStr);

    if (data.page !== pageName) return false;
    if (typeof data.exp !== 'number' || data.exp <= Date.now()) return false;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payloadStr));
  } catch {
    return false;
  }
}

