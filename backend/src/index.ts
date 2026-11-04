import { Env } from './types';
import { getCorsHeaders, handleOptions } from './middleware/cors';
import { PageService } from './services/pageService';
import { runScheduledCleanup } from './expiration/cleanup';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    const corsHeaders = getCorsHeaders(request, env);
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Helper for json responses with CORS
    const json = (data: any, status = 200, extraHeaders: HeadersInit = {}) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          ...extraHeaders,
        },
      });
    };

    try {
      // Health check
      if (pathname === '/health' || pathname === '/api/health') {
        return json({
          status: 'ok',
          app: env.APP_NAME || 'QuickPad',
          env: env.APP_ENV || 'production',
          time: Date.now(),
        });
      }

      // Manual cleanup route (useful for testing or webhooks)
      if (pathname === '/api/admin/cleanup' && request.method === 'POST') {
        const result = await runScheduledCleanup(env.R2_BUCKET);
        return json({ success: true, ...result });
      }

      // POST /api/pages (Create page)
      if (pathname === '/api/pages' && request.method === 'POST') {
        const body = await request.json().catch(() => ({})) as any;
        const pageName = body.name;
        const password = body.password;

        if (!pageName) {
          return json({ error: 'Page name is required' }, 400);
        }

        const res = await PageService.createPage(env.R2_BUCKET, pageName, password, env);
        if (!res.success) {
          const status = res.code === 'PAGE_EXISTS' ? 409 : 400;
          return json(res, status);
        }
        return json(res, 201);
      }

      // Route matchers for /api/pages/:name...
      const pagesRegex = /^\/api\/pages\/([a-zA-Z0-9_-]+)(.*)$/;
      const match = pathname.match(pagesRegex);

      if (match) {
        const pageName = match[1];
        const subPath = match[2]; // e.g. "", "/content", "/files", "/files/123", "/password"

        // GET /api/pages/:name
        if (subPath === '' && request.method === 'GET') {
          const res = await PageService.getPage(env.R2_BUCKET, pageName, request, env);
          return json(res.body, res.status);
        }

        // DELETE /api/pages/:name
        if (subPath === '' && request.method === 'DELETE') {
          const res = await PageService.deletePage(env.R2_BUCKET, pageName, request, env);
          return json(res.body, res.status);
        }

        // GET /api/pages/:name/status
        if (subPath === '/status' && request.method === 'GET') {
          const res = await PageService.getPageStatus(env.R2_BUCKET, pageName);
          return json(res.body, res.status);
        }

        // PUT /api/pages/:name/content (Save text)
        if (subPath === '/content' && request.method === 'PUT') {
          const body = await request.json().catch(() => ({})) as any;
          const text = typeof body.text === 'string' ? body.text : '';
          const expectedVersion = typeof body.version === 'number' ? body.version : undefined;

          const res = await PageService.saveContent(
            env.R2_BUCKET,
            pageName,
            text,
            expectedVersion,
            request,
            env
          );
          return json(res.body, res.status);
        }

        // DELETE /api/pages/:name/content (Clear text)
        if (subPath === '/content' && request.method === 'DELETE') {
          const res = await PageService.clearContent(env.R2_BUCKET, pageName, request, env);
          return json(res.body, res.status);
        }

        // POST /api/pages/:name/files (Upload file)
        if (subPath === '/files' && request.method === 'POST') {
          const contentType = request.headers.get('content-type') || '';

          if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const uploadedFiles = formData.getAll('files');
            // If uploaded with name 'file' or 'files'
            const allFiles = uploadedFiles.length > 0 ? uploadedFiles : formData.getAll('file');

            if (allFiles.length === 0) {
              return json({ error: 'No files uploaded' }, 400);
            }

            const results = [];
            for (const item of allFiles) {
              if (item && typeof item !== 'string' && 'name' in item && 'size' in item) {
                const fileObj = item as unknown as File;
                const arrayBuffer = await fileObj.arrayBuffer();
                const res = await PageService.uploadFile(
                  env.R2_BUCKET,
                  pageName,
                  {
                    name: fileObj.name,
                    type: fileObj.type,
                    size: fileObj.size,
                    stream: arrayBuffer,
                  },
                  request,
                  env
                );
                results.push(res);
              }
            }

            const hasError = results.some(r => r.status >= 400);
            if (hasError) {
              const firstError = results.find(r => r.status >= 400);
              return json(firstError?.body, firstError?.status);
            }

            return json({
              success: true,
              files: results.map(r => r.body.file),
            }, 201);
          } else {
            // Direct stream or binary upload with headers
            const rawFilename = request.headers.get('x-file-name') || 'uploaded_file';
            const decodedFilename = decodeURIComponent(rawFilename);
            const bodyStream = request.body;

            if (!bodyStream) {
              return json({ error: 'Missing request body' }, 400);
            }

            const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
            const arrayBuffer = await request.arrayBuffer();

            const res = await PageService.uploadFile(
              env.R2_BUCKET,
              pageName,
              {
                name: decodedFilename,
                type: contentType,
                size: arrayBuffer.byteLength || contentLength,
                stream: arrayBuffer,
              },
              request,
              env
            );
            return json(res.body, res.status);
          }
        }

        // Match /api/pages/:name/files/:fileId
        const fileMatch = subPath.match(/^\/files\/([a-zA-Z0-9_-]+)$/);
        if (fileMatch) {
          const fileId = fileMatch[1];

          // GET /api/pages/:name/files/:fileId (Download or view)
          if (request.method === 'GET') {
            const downloadMode = url.searchParams.get('download') === 'true';
            const fileResponse = await PageService.getFile(
              env.R2_BUCKET,
              pageName,
              fileId,
              request,
              env,
              downloadMode
            );

            // Merge CORS headers onto file response
            const responseHeaders = new Headers(fileResponse.headers);
            for (const [key, value] of Object.entries(corsHeaders as Record<string, string>)) {
              responseHeaders.set(key, value);
            }

            return new Response(fileResponse.body, {
              status: fileResponse.status,
              headers: responseHeaders,
            });
          }

          // DELETE /api/pages/:name/files/:fileId (Delete file)
          if (request.method === 'DELETE') {
            const res = await PageService.deleteFile(
              env.R2_BUCKET,
              pageName,
              fileId,
              request,
              env
            );
            return json(res.body, res.status);
          }
        }

        // POST /api/pages/:name/password (Set or change password)
        if (subPath === '/password' && request.method === 'POST') {
          const body = await request.json().catch(() => ({})) as any;
          const currentPassword = body.currentPassword;
          const newPassword = body.newPassword;

          const res = await PageService.setPassword(
            env.R2_BUCKET,
            pageName,
            currentPassword,
            newPassword,
            request,
            env
          );
          return json(res.body, res.status);
        }

        // POST /api/pages/:name/verify-password (Verify password & get token)
        if (subPath === '/verify-password' && request.method === 'POST') {
          const body = await request.json().catch(() => ({})) as any;
          const password = body.password;

          if (!password) {
            return json({ error: 'Password is required' }, 400);
          }

          const res = await PageService.verifyPassword(
            env.R2_BUCKET,
            pageName,
            password,
            env
          );
          return json(res.body, res.status);
        }
      }

      // Default 404 for unmatched routes
      return json({ error: 'Endpoint not found', path: pathname }, 404);
    } catch (err: any) {
      console.error('Unhandled server error:', err);
      return json({
        error: 'Internal Server Error',
        message: err?.message || 'Unknown error',
      }, 500);
    }
  },

  // Cloudflare Workers Scheduled Cron Trigger Handler
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[QuickPad] Scheduled cleanup triggered at ${new Date(event.scheduledTime).toISOString()}`);
    ctx.waitUntil(
      runScheduledCleanup(env.R2_BUCKET).then(res => {
        console.log(`[QuickPad] Cleanup completed: ${res.expiredPagesProcessed.length} pages deleted, ${res.totalObjectsDeleted} objects purged.`);
      }).catch(err => {
        console.error('[QuickPad] Scheduled cleanup failed:', err);
      })
    );
  },
};
