import { Router } from 'express';

import {
  advisorRequestSchema,
  applyChangesRequestSchema,
  auditRequestSchema,
  scenariosRequestSchema,
} from '../../lib/underwritingSchema/phase3Schemas.js';
import { generateAdvisorResponse } from '../../ai/phase3/advisorAgent.js';
import { createAuditReport } from '../../ai/phase3/auditAgent.js';
import { createScenarioSet } from '../../ai/phase3/scenarioAgent.js';
import { consumePendingChangeSet } from '../../ai/phase3/memoryStore.js';
import { applyChanges, runAudit, upsertModelFields } from '../../ai/phase3/tools.js';

export const phase3Router = Router();

function redact(value) {
  const raw = JSON.stringify(value || {});
  return raw.replace(/"OPENAI_API_KEY"\s*:\s*"[^"]+"/g, '"OPENAI_API_KEY":"[REDACTED]"');
}

function logPhase3(event, payload) {
  console.log(`[phase3] ${event} ${redact(payload)}`);
}

function parseBody(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const err = new Error(parsed.error.message);
    err.statusCode = 400;
    err.code = 'INVALID_REQUEST';
    throw err;
  }
  return parsed.data;
}

phase3Router.post('/advisor', async (req, res, next) => {
  try {
    const body = parseBody(advisorRequestSchema, req.body || {});
    logPhase3('advisor.request', { deal_id: body.deal_id, mode: body.mode });
    if (body.model_fields) {
      await upsertModelFields(body.deal_id, body.model_fields, 'user');
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    res.write(`data: ${JSON.stringify({ stage: 'accepted' })}\n\n`);
    res.write(`data: ${JSON.stringify({ stage: 'reasoning' })}\n\n`);

    const result = await generateAdvisorResponse({
      dealId: body.deal_id,
      prompt: body.prompt,
      mode: body.mode,
      history: body.history,
    });

    logPhase3('advisor.response', { deal_id: result?.advisor?.deal_snapshot?.deal_id, changes: result?.advisor?.proposed_model_changes?.length || 0 });
    res.write(`data: ${JSON.stringify({ stage: 'complete', result })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    next(err);
  }
});

phase3Router.post('/audit', async (req, res, next) => {
  try {
    const body = parseBody(auditRequestSchema, req.body || {});
    logPhase3('audit.request', { deal_id: body.deal_id });
    if (body.model_fields) {
      await upsertModelFields(body.deal_id, body.model_fields, 'user');
    }
    const report = await createAuditReport({ dealId: body.deal_id, scenarioDeltas: body.scenario_deltas || [] });
    res.status(200).json({ ok: true, report });
  } catch (err) {
    next(err);
  }
});

phase3Router.post('/scenarios', async (req, res, next) => {
  try {
    const body = parseBody(scenariosRequestSchema, req.body || {});
    logPhase3('scenarios.request', { deal_id: body.deal_id });
    if (body.model_fields) {
      await upsertModelFields(body.deal_id, body.model_fields, 'user');
    }
    const scenarios = await createScenarioSet({ dealId: body.deal_id });
    res.status(200).json({ ok: true, scenarios });
  } catch (err) {
    next(err);
  }
});

phase3Router.post('/apply-changes', async (req, res, next) => {
  try {
    const body = parseBody(applyChangesRequestSchema, req.body || {});
    logPhase3('apply.request', { deal_id: body.deal_id, token: body.confirmationToken?.slice(0, 8) });
    const pending = await consumePendingChangeSet(body.confirmationToken);
    if (!pending) {
      return res.status(404).json({ ok: false, code: 'CHANGESET_NOT_FOUND', error: 'Pending change set not found or expired.' });
    }

    if (new Date(pending.expiresAt).getTime() < Date.now()) {
      return res.status(410).json({ ok: false, code: 'CHANGESET_EXPIRED', error: 'Pending change set expired.' });
    }

    const applied = await applyChanges(body.deal_id || pending.dealId, pending.changes);
    const audit = await runAudit(body.deal_id || pending.dealId);

    return res.status(200).json({
      ok: true,
      deal_id: body.deal_id || pending.dealId,
      applied_count: pending.changes.length,
      model: applied,
      audit,
    });
  } catch (err) {
    next(err);
  }
});

phase3Router.get('/deals/:id/ai-summary', async (req, res, next) => {
  try {
    const report = await createAuditReport({ dealId: req.params.id });
    res.status(200).json({ ok: true, deal_id: req.params.id, summary: report });
  } catch (err) {
    next(err);
  }
});
