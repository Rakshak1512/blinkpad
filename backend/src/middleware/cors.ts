import { Env } from '../types';

export function getCorsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.ALLOWED_ORIGIN || '*';

  let resolvedOrigin = allowedOrigin;
  if ((allowedOrigin === '*' || env.APP_ENV === 'development') && origin) {
    resolvedOrigin = origin;
  } else if (origin && allowedOrigin.split(',').map(s => s.trim()).includes(origin)) {
    resolvedOrigin = origin;
  }

  return {
    'Access-Control-Allow-Origin': resolvedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Page-Password, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Disposition, X-Page-Version, X-Page-Expires-At',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

