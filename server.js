import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { aiRouter } from './api/ai/routes.js';
import { apiRateLimiter } from './lib/security/rateLimiter.js';
import { requireJsonBody, apiRouteProtection } from './lib/security/requestGuards.js';
import { apiErrorHandler, notFoundHandler } from './lib/security/errorHandlers.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', apiRateLimiter, apiRouteProtection);
app.use('/api/ai', requireJsonBody, aiRouter);

app.use(express.static(__dirname));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'underwriting-ai-infra', phase: 1 });
});

app.use(notFoundHandler);
app.use(apiErrorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
