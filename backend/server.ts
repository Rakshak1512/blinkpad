import express from 'express';
import app from './src/server';

// Vercel detects this root-level Express entrypoint and serves every route
// through the shared application defined in src/server.ts.
void express;
export default app;
