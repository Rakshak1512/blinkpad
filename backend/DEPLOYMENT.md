# BlinkPad Backend — Vercel Deployment Guide

## Deployment Architecture

The BlinkPad API runs as a high-performance Express serverless function on Vercel.

- **Vercel Framework**: Express (`@vercel/express`)
- **Vercel Root Directory**: `backend`
- **Build Step**: `npm run build` bundles `src/server.ts` into a standalone, single-file ESM JavaScript bundle (`index.js`) using `esbuild`.
- **Runtime Entrypoint**: `index.js` (referenced via `"main": "index.js"` in `package.json`).
  - Bundling inlines all internal local TypeScript modules (`storage/firebase.ts`, `services/cryptoService.ts`, `utils/validator.ts`, `types.ts`).
  - Eliminates extensionless ESM import resolution errors and Node.js `.ts` execution errors in production (`/var/task/backend/src/server` or `/var/task/backend/src/storage/firebase.ts`).
  - Zero unresolvable relative imports survive into the production runtime bundle.

---

## Required Environment Variables in Vercel

Configure these under **Vercel Dashboard > Project Settings > Environment Variables**:

| Variable Name | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Yes** (for Firestore) | Complete JSON string of the Firebase Admin service account key. | `{"type":"service_account","project_id":"blinkpad-7db1e",...}` |
| `FIREBASE_PROJECT_ID` | Optional | Firebase project ID (defaults to `blinkpad-7db1e`). | `blinkpad-7db1e` |
| `FIREBASE_STORAGE_BUCKET` | **Yes** (for attachments) | Exact Cloud Storage bucket name from Firebase Console > Storage. | `your-project.firebasestorage.app` |
| `AUTH_SECRET` | **Yes** (for password protection) | Secret key (minimum 32 characters) used for HMAC page session tokens. | `a-secure-random-string-at-least-32-chars-long` |
| `APP_BASE_URL` | **Yes** (browser API access) | Exact deployed frontend origin (scheme + domain, no path). | `https://your-frontend.vercel.app` |
| `ALLOWED_ORIGINS` | Optional | Comma-separated additional frontend origins. | `https://your-frontend.netlify.app,https://your-preview.vercel.app` |
| `CRON_SECRET` | Recommended | Bearer secret authorizing Vercel Cron cleanup jobs. | `secure-cron-random-secret-key` |
| `APP_NAME` | Optional | Human-readable app name. | `BlinkPad` |
| `BACKEND_URL` | Optional | Canonical production backend URL. | `https://blinkpad-qs77.vercel.app` |

> **Important**: `AUTH_SECRET` must be set to a random value of at least 32 characters for password-protected pages. Configure `APP_BASE_URL` as the exact deployed frontend origin; set `ALLOWED_ORIGINS` to a comma-separated list if you use more than one frontend domain.

## Persistent file attachments (required)

BlinkPad requests short-lived signed upload URLs from the backend, then the browser sends file bytes directly to Firebase Cloud Storage. This avoids temporary Vercel filesystem storage and serverless request-body limits.

1. In Firebase Console, open **Storage** and create/enable a bucket for the same Firebase project used by Firestore.
2. Copy the exact bucket name shown in the Storage page into the Vercel backend environment variable `FIREBASE_STORAGE_BUCKET`. Do not assume the bucket suffix; newer and older Firebase projects can display different bucket names.
3. Ensure the service account in `FIREBASE_SERVICE_ACCOUNT_JSON` can access Firestore and has **Storage Object Admin** permissions for that bucket.
4. Configure bucket CORS to allow direct browser uploads from every deployed frontend origin. Save this as `cors.json`, replacing/adding the actual frontend domains:

```json
[
  {
    "origin": [
      "https://blinkpad-frontend.netlify.app",
      "https://blinkpad-4efw.vercel.app"
    ],
    "method": ["GET", "HEAD", "PUT"],
    "responseHeader": ["Content-Type", "ETag"],
    "maxAgeSeconds": 3600
  }
]
```

Apply it with Google Cloud CLI after replacing the bucket name:

```bash
gcloud storage buckets update gs://YOUR_BUCKET_NAME --cors-file=cors.json
```

5. Set `APP_BASE_URL` (and `ALLOWED_ORIGINS` when needed) to the exact frontend origins, then redeploy the backend. Set `VITE_API_BASE_URL=https://YOUR-BACKEND-VERCEL-DOMAIN/api` in the frontend project and redeploy the frontend.

The default CORS allowlist in the backend includes the two example origins above; add your real custom domains in Vercel environment variables and the bucket CORS file. Bucket CORS and backend CORS are separate settings, and both must allow the browser's frontend origin.

---

## Vercel Project Settings

- **Framework Preset**: Express (or Other)
- **Root Directory**: `backend`
- **Build Command**: `npm run build` (or default from `package.json`)
- **Output Directory**: Leave empty / default
- **Node.js Version**: 20.x or 22.x
