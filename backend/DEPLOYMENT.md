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
| `AUTH_SECRET` | **Yes** (for password protection) | Secret key (minimum 32 characters) used for HMAC page session tokens. | `a-secure-random-string-at-least-32-chars-long` |
| `CRON_SECRET` | Recommended | Bearer secret authorizing Vercel Cron cleanup jobs. | `secure-cron-random-secret-key` |
| `APP_NAME` | Optional | Human-readable app name. | `BlinkPad` |
| `BACKEND_URL` | Optional | Canonical production backend URL. | `https://blinkpad-qs77.vercel.app` |

> **Note**: Health check (`/health`, `/api/health`) and root (`/`) endpoints initialize lazily and will boot and respond with HTTP 200 even if Firebase credentials or `AUTH_SECRET` are not configured.

---

## Vercel Project Settings

- **Framework Preset**: Express (or Other)
- **Root Directory**: `backend`
- **Build Command**: `npm run build` (or default from `package.json`)
- **Output Directory**: Leave empty / default
- **Node.js Version**: 20.x or 22.x
