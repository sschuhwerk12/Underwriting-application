# Institutional Real Estate Underwriting Application

This repository now includes:

- Core underwriting UI/modeling experience (`index.html`, `app.js`, `styles.css`)
- Phase I AI backend infrastructure (secure Responses API layer + schema boundaries)
- **Phase II ingestion pipeline** (upload, extraction, chunking, AI structuring, validation, persistence, UI auto-population)

---

## Run Modes

### Legacy static UI

```bash
python -m http.server 8000
```

### Full AI-enabled app (recommended)

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

---

## Environment Variables

See `.env.example`.

Key vars:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `AI_API_REQUIRE_TOKEN`
- `AI_API_TOKEN`
- `AI_RATE_LIMIT_WINDOW_MS`
- `AI_RATE_LIMIT_MAX`
- `INGEST_MAX_FILE_BYTES`
- `INGEST_MAX_FILES`
- `INGEST_MAX_TOKENS_PER_CHUNK`
- `INGEST_MAX_TOKENS_PER_BATCH`
- `INGEST_MAX_CHUNKS_PER_BATCH`

---

## Phase II Ingestion Architecture

### Major modules

```text
api/ai/ingest/routes.js            # multipart upload endpoint + orchestration
lib/ingestion/extractors.js        # PDF/CSV/XLSX extraction
lib/documentChunker/index.js       # token-estimated chunking + batching
ai/ingestionAgent.js               # AI extraction orchestration + retry
ai/ingestionAgent.ts               # TS contract mirror for migration
lib/underwritingSchema/phase2Schema.js  # strict Zod schema + range checks
lib/db/dealStore.js                # persistence + version tracking
components/FileUpload/*            # ingestion UI shell
```

### Text-based data flow diagram

```text
[User Upload UI]
   |  multipart/form-data (PDF/CSV/XLSX)
   v
[/api/ai/ingest]
   |- file validation (type/size/count)
   |- temporary storage (artifacts/tmp_uploads)
   v
[Extractors]
   |- PDF parser
   |- CSV parser
   |- Excel parser
   v
[Document Chunker]
   |- section-aware chunking
   |- token estimation
   |- batch packing
   v
[AI Ingestion Agent]
   |- structured extraction prompt
   |- strict JSON parse
   |- retry once on malformed response
   |- zod validation + type/range checks
   |- partial merge across batches
   v
[Persistence Layer]
   |- deal versioning
   |- overwrite confirmation semantics
   v
[Frontend Auto-populate]
   |- map extracted fields to underwriting UI
   |- highlight AI-populated values
   |- highlight missing_data fields
   |- prompt before overwriting manual edits
```

---

## AI Extraction Logic (Phase II)

`ai/ingestionAgent.js` enforces extraction-only behavior:

- No valuation/advisory logic
- No hallucinated numbers
- Unknown fields must be `null`
- Uncertainty is recorded in `risks_detected`
- Missing fields are listed in `missing_data`

Output contract:

```json
{
  "property_profile": {},
  "income": {},
  "expenses": {},
  "debt": {},
  "assumptions": {},
  "risks_detected": [],
  "missing_data": []
}
```

---

## Schema Enforcement Strategy

Phase II uses Zod (`lib/underwritingSchema/phase2Schema.js`) for:

- Strict top-level key enforcement
- Strict nested object typing
- Numeric validations (e.g., non-negative checks)
- Range checks (e.g., percentages in `[0,1]`, hold months bounds)

Malformed AI responses are rejected and retried once.

---

## Security + Safety Controls

- Backend-only OpenAI calls (no API keys in browser)
- API rate limiting
- Optional token-based route protection
- File extension and size validation
- Upload count limits
- Temp file cleanup after ingestion
- Input validation for chat/AI endpoints

---

## Token Management Strategy

- Section-first extraction (preserves doc references)
- Estimated-token chunk splitting
- Batch packing by token budget + chunk count ceiling
- Batch-by-batch AI extraction with deterministic merge strategy

This is designed to prevent token overflow and to prepare for future retrieval expansion.

---

## UI Auto-Population Behavior

On successful ingestion:

- Structured fields map into underwriting inputs
- AI-populated fields are visually highlighted
- Missing data targets are visually highlighted
- Manual user edits are protected via overwrite confirmation prompt

---

## Known Limitations (Intentionally deferred)

- No valuation intelligence
- No cap rate recommendations
- No investment advisory
- No critique/error reasoning engine
- No advanced ingestion confidence scoring yet

---

## Future Extensibility (Phase III and beyond)

Phase II was designed so ingestion decisions can feed valuation reasoning later:

- Stable schema boundary between extraction and modeling
- Versioned persistence to support re-ingest comparisons
- Section/chunk metadata for future evidence tracing
- Tool scaffolds from Phase I remain reusable for retrieval and reasoning orchestration

Phase III can now safely add underwriting intelligence on top of validated structured inputs.

---

## Existing Local Tests

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

Additional JS syntax checks are run with `node --check` for all new ingestion modules.

---

## Phase III Architecture (Reasoning + Validation)

### New modules

```text
api/ai/phase3Routes.js                  # advisor/audit/scenarios/apply-changes endpoints
ai/phase3/advisorAgent.js               # underwriting reasoning agent (strict contract)
ai/phase3/auditAgent.js                 # validation/error-check agent
ai/phase3/scenarioAgent.js              # base/upside/downside + sensitivities
ai/phase3/tools.js                      # fetchDeal/fetchModelFields/propose/apply/runAudit/createScenarioSet
ai/phase3/memoryStore.js                # conversation summary memory + pending change tokens
lib/underwritingSchema/phase3Schemas.js # strict Zod contracts for advisor/audit/scenario/apply
artifacts/model_fields/*                  # persisted current model fields by deal
```

### Phase III data flow (text diagram)

```text
[AIChat UI]
  |- mode: Advisor / Audit / Scenarios
  |- sends current UI model snapshot + deal_id
  v
[/api/ai/advisor] (SSE)
  |- persist latest model fields snapshot
  |- run advisor agent with guardrails + tool-capable Responses API
  |- validate strict advisor JSON contract
  |- register pending proposal token for explicit apply
  v
[UI Proposed Changes Panel]
  |- user reviews field-by-field diffs
  |- explicit modal confirmation required
  v
[/api/ai/apply-changes]
  |- requires confirm=true + confirmationToken
  |- applies persisted change set only if token exists + not expired
  |- reruns audit and returns updated report

[/api/ai/audit]
  |- validation/error-check agent
  |- strict audit contract with field-level flags

[/api/ai/scenarios]
  |- scenario generator (deltas only)
  |- strict scenario contract + apply_requires_confirmation=true
```

### Contracts (server-enforced)

Phase III enforces strict JSON contracts with Zod for:

- Advisor response contract (`mode`, `summary`, `analysis`, `assumptions_used`, `unknowns`, `risks`, `recommended_actions`, `proposed_model_changes`)
- Audit contract (`errors`, `warnings`, `questions`, `improvement_suggestions`)
- Scenario contract (base/upside/downside **deltas only** + sensitivities + `apply_requires_confirmation: true`)
- Apply changes request (`confirm: true` + confirmation token)

### Guardrails and safety model

- The advisor system prompt prohibits fabricating market data, comps, and financing terms.
- If market evidence is missing, the response must request user-provided cap-rate/lender inputs.
- Proposed changes are never auto-applied.
- Apply endpoint enforces explicit confirmation token and expiry before any model updates.
- API requests/responses for Phase III are logged with basic redaction.
- OpenAI key remains backend-only.

### UI behavior (Phase III)

- AIChat now supports **Advisor / Audit / Scenarios** modes.
- Proposed model changes render in a field-level diff panel.
- Applying changes requires an explicit confirmation modal.
- Audit report panel renders errors, warnings, questions, and suggestions.
- Long-running advisor calls use SSE progress events.

### Testing (Phase III)

Run:

```bash
npm run test:phase3
```

Covers:
- advisor contract compliance
- audit contract structure
- scenario contract compliance
- apply-changes confirmation enforcement

### Known limitations

- Conversation memory is a lightweight summary/history store (file-based) and not embedding retrieval yet.
- Advisor may fall back to deterministic reasoning if OpenAI is unavailable.
- Scenario sensitivities are template-driven unless user provides richer market datasets.

### How to add market datasets later

1. Add a market dataset ingestion adapter (e.g., cap comps / debt quotes).
2. Persist normalized market evidence by deal/market date.
3. Extend advisor/audit tools to fetch that evidence (`fetchMarketEvidence`).
4. Require evidence citations in advisor outputs for rate recommendations.
