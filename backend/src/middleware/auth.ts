import { Env, PageManifest } from '../types';
import { verifyAuthToken, verifyPassword } from '../services/cryptoService';

export async function isAuthorizedForPage(
  request: Request,
  env: Env,
  manifest: PageManifest
): Promise<boolean> {
  // If page does not have a password set, it's public
  if (!manifest.has_password || !manifest.password_hash || !manifest.password_salt) {
    return true;
  }

  // 1. Check Bearer token
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const secret = env.AUTH_SECRET || 'quickpad-default-session-secret-key-12345';
    const isValidToken = await verifyAuthToken(token, manifest.name, secret);
    if (isValidToken) return true;
  }

  // 2. Check direct X-Page-Password header
  const rawPassword = request.headers.get('X-Page-Password');
  if (rawPassword) {
    const isValidPassword = await verifyPassword(rawPassword, manifest.password_salt, manifest.password_hash);
    if (isValidPassword) return true;
  }

  // 3. Check query param ?auth= or ?token= (used for direct browser download links)
  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get('auth') || url.searchParams.get('token');
    if (queryToken) {
      const secret = env.AUTH_SECRET || 'quickpad-default-session-secret-key-12345';
      const isValidToken = await verifyAuthToken(queryToken, manifest.name, secret);
      if (isValidToken) return true;
    }
  } catch {}

  return false;
}

