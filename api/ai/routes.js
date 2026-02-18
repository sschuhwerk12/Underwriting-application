import { Router } from 'express';
import { generateStructuredResponse, streamAssistantResponse } from '../../ai/orchestrator.js';
import { validateChatRequestBody } from '../../lib/security/requestGuards.js';

export const aiRouter = Router();

aiRouter.post('/respond', async (req, res, next) => {
  try {
    const valid = validateChatRequestBody(req.body);
    if (!valid.ok) {
      return res.status(400).json({ error: valid.reason, code: 'INVALID_REQUEST' });
    }

    const { message, history, toolCalls = [] } = req.body;
    const result = await generateStructuredResponse({ message, history, toolCalls });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

aiRouter.post('/stream', async (req, res, next) => {
  try {
    const valid = validateChatRequestBody(req.body);
    if (!valid.ok) {
      return res.status(400).json({ error: valid.reason, code: 'INVALID_REQUEST' });
    }

    const { message, history } = req.body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    for await (const delta of streamAssistantResponse({ message, history })) {
      res.write(`data: ${JSON.stringify({ delta })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    next(err);
  }
});
