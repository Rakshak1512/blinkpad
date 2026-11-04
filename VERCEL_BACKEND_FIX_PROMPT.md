# BlinkPad — Complete Vercel Backend Deployment Repair Task

You are working in the existing BlinkPad repository. Fix the production backend deployment failure properly. Do not redesign the application or remove existing features.

## Repository and deployment facts

- GitHub repository: https://github.com/Rakshak1512/blinkpad
- Production branch: `main`
- Backend directory: `backend/`
- Frontend directory: `frontend/`
- Backend Vercel project Root Directory is confirmed as `backend`.
- Vercel "Include files outside the root directory in the Build Step" is enabled.
- Latest confirmed Production commit at the time this task was written: `4924b4a`.
- The backend works locally. Opening the local backend root returns:
  `{"success":true,"app":"BlinkPad Backend","message":"BlinkPad API is running.","health":"/health","api_health":"/api/health","documentation":"Use the /api/* endpoints for BlinkPad operations."}`
- Production Vercel URL used for testing: `https://blinkpad-qs77.vercel.app`
- Production currently returns `500 FUNCTION_INVOCATION_FAILED`.
- Runtime logs repeatedly show:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/backend/src/server' imported from /var/task/backend/server.js`
- This error references a generated/runtime `backend/server.js` importing `backend/src/server` without an extension.
- The GitHub source at commit `4924b4a` has `backend/index.ts` importing `./src/server.ts`; `backend/package.json` has `"type": "module"` and `"main": "index.ts"`; `backend/server.ts` was removed. `backend/src/server.ts` currently uses explicit `.ts` extensions for local imports and `backend/tsconfig.json` enables `allowImportingTsExtensions`.
- Prior attempts to change only the entrypoint import did not resolve the deployed runtime error. Do not repeat those same changes without proving why they are needed.

## Primary objective

Make the backend work on Vercel Production, not merely compile locally. Preserve the existing Express API routes and their paths, Firebase Firestore behavior, page expiry, password protection, cleanup cron, CORS behavior, and all current frontend API expectations.

## Mandatory investigation before editing

1. Inspect the complete repository tree and all backend deployment-related files, including:
   - `backend/package.json`
   - `backend/tsconfig.json`
   - `backend/vercel.json`
   - all root-level and backend-level `index.*`, `server.*`, `api/**` files
   - `backend/src/server.ts` and every module it imports
   - lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) and any build scripts
   - `.vercelignore`, `.gitignore`, Vercel output/build configuration, if present.
2. Search the entire repository for every occurrence of:
   - `src/server`
   - `server.js`
   - `server.ts`
   - `main`
   - `builds`, `routes`, `rewrites`
   - extensionless relative imports in backend TypeScript files.
3. Establish exactly why Vercel is creating/executing `/var/task/backend/server.js` and why that file imports `/var/task/backend/src/server`. Identify the actual Vercel entrypoint and bundling/runtime behavior from the current configuration and build output. Do not assume that `package.json.main` controls Vercel routing.
4. Reproduce the production build locally using the same Node.js version and build/deploy command Vercel uses. Use the Vercel CLI or the repository's supported build tooling if available. Capture the generated function files and inspect their imports. A successful TypeScript typecheck alone is not proof of a working Vercel function.
5. Compare the actual local start command with Vercel's production entrypoint. Keep local development working.

## Implementation requirements

1. Choose one clear, officially supported Vercel Node/Express deployment pattern and implement it consistently. Do not mix multiple competing entrypoints.
2. Ensure the Vercel function bundle contains every imported module and resolves all imports at runtime. Do not leave extensionless ESM imports that survive into emitted JavaScript unless the chosen bundler explicitly resolves them.
3. Do not depend on Vercel's ephemeral filesystem for persistent uploaded files. Do not change the existing storage provider or data model as part of this deployment repair unless absolutely required to boot the function.
4. Preserve all API endpoints, including:
   - `/`
   - `/health`
   - `/api/health`
   - `/api/pages/**`
   - `/api/admin/cleanup`
5. Preserve the scheduled cleanup configuration and its authorization. Missing `CRON_SECRET` must not crash application initialization or unrelated routes.
6. Missing `AUTH_SECRET` must not crash public health/root routes during module initialization; password-protected operations should return a controlled error if the secret is not configured.
7. Firebase Admin initialization must remain lazy so importing the app does not fail merely because Firebase credentials are absent. Firebase-dependent API calls should report a useful error.
8. Do not expose secrets in logs or HTTP responses.
9. Keep the frontend untouched unless a proven API contract mismatch requires a minimal compatible change.
10. Do not change database collections, page expiry rules, password semantics, file metadata, or UI.

## Required validation — do not skip

Run and report each of these:

1. Install dependencies from the committed lockfile (or explain if no lockfile exists).
2. Run backend typecheck.
3. Run existing backend tests.
4. Run a production Vercel build with the backend Root Directory set to `backend`.
5. Inspect the generated function output and verify there is no unresolved import to `/var/task/backend/src/server` or any other missing module.
6. Start the built app or run it with a production-like Vercel runtime.
7. Smoke-test:
   - `GET /` returns HTTP 200 and the BlinkPad backend JSON.
   - `GET /health` returns HTTP 200 without requiring Firebase initialization or password secrets.
   - `GET /api/health` returns HTTP 200.
   - A representative unknown route returns a controlled 404, not a function crash.
   - The cleanup endpoint rejects requests without the correct cron bearer token.
8. If Firebase credentials are available in the local environment, test a safe read-only Firestore operation. Never commit credentials or print secret values.
9. Confirm the frontend's `VITE_API_BASE_URL` still points to the backend API base and the frontend build remains unaffected.

## Git requirements

1. Inspect current Git status and branch before modifying files.
2. Make the smallest complete fix. Avoid broad refactors and avoid changing unrelated UI or business logic.
3. Never commit `.env`, service-account JSON, private keys, tokens, `.vercel`, `node_modules`, build output, or user data.
4. Add or update a concise deployment note describing the chosen Vercel entrypoint and required environment variables.
5. Commit the actual code changes to `main` with a clear message.
6. Push to the connected GitHub repository.
7. Report the exact commit SHA, files changed, commands/tests run, test results, and anything that still requires manual Vercel configuration.

## Important behavior

- Do not claim the issue is fixed just because GitHub shows a Ready deployment or a TypeScript build passes.
- Do not ask the user to trigger repeated deployments while the generated function still contains the bad import.
- Do not guess at a root cause. Prove it from the generated output or Vercel build logs.
- If Vercel build/runtime cannot be reproduced locally, clearly state what remains unverified and request the precise missing build-log section.
- Keep the user's daily Vercel deployment limit in mind. Only push a deployment-triggering commit after the production entrypoint has been validated as far as the available environment allows.

## Final response format

Provide:
1. Root cause proven by evidence.
2. Exact implementation change.
3. Commit SHA and GitHub link.
4. Validation commands and pass/fail results.
5. Exact Vercel settings required (Root Directory should remain `backend` unless the investigation proves otherwise).
6. One final smoke-test instruction for Production.
