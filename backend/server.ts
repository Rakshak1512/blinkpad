import express from 'express';
import app from './src/server.js';

// Vercel's Express runtime detects this root-level entrypoint.
// Keep the .js extension: Node ESM requires an explicit extension at runtime,
// and the Vercel TypeScript bundler maps this specifier to src/server.ts.
// This avoids a runtime ERR_MODULE_NOT_FOUND for ./src/server.
void express;
export default app;
