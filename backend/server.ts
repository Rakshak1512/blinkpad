// Vercel entrypoint for the BlinkPad Express API.
import express from 'express';
import app from './src/server';

// Referencing the framework here makes the Express runtime explicit while
// keeping all routes and middleware in the shared application module.
void express;
export default app;
