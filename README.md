# Institutional Real Estate Underwriting Application

This repository now contains:

- Existing underwriting UI + model (`index.html`, `app.js`, `styles.css`, Python CLI tools)
- **Phase 1 AI infrastructure foundation** (backend AI layer, schema enforcement, chat shell, security, and performance scaffolding)

---

## Quick Start

### Frontend-only preview (legacy mode)

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

### Full app with AI backend (recommended for Phase 1)

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:3000`.

---

## AI Architecture Overview (Phase 1)

### Goals delivered in this phase

- Secure server-side OpenAI integration (no frontend API keys)
- Centralized AI client wrapper and orchestration layer
- Streaming API support for chat shell
- Tool-calling framework with stubs (no underwriting intelligence yet)
- Strict structured underwriting JSON schema + validation
- Rate limiting, input validation, API guards, and centralized error handling
- Placeholder chunking/embedding utilities for future scale work

### High-level flow

1. Browser chat shell sends request to `/api/ai/stream` or `/api/ai/respond`.
2. API validates request shape and applies route protections + rate limiting.
3. AI orchestrator uses OpenAI Responses API wrapper (or fallback echo if key absent).
4. Structured output is validated against underwriting schema.
5. Response is streamed/returned to frontend.

---

## Folder Structure (AI-related)

```text
api/
  ai/
    routes.js                 # /api/ai/respond + /api/ai/stream

ai/
  orchestrator.js             # Central request orchestration + streaming
  tools.js                    # Tool-calling framework (stubs)
  performance.js              # Placeholder chunking + embedding wrappers

lib/
  ai/
    openaiClient.js           # Centralized OpenAI client + model config
  underwritingSchema/
    schema.js                 # Strict schema definition
    validate.js               # Validation/coercion helpers
  security/
    rateLimiter.js            # API rate limiting
    requestGuards.js          # Input + route protection
    errorHandlers.js          # Unified API error surface

components/
  AIChat/
    AIChat.js                 # Chat shell UI + streaming client
    init.js                   # Component bootstrap
    AIChat.css                # Chat shell styling

server.js                     # Express server + static hosting + API wiring
```

---

## Underwriting Schema (Phase 1 Contract)

The enforced structured response contract is:

```json
{
  "property_profile": {},
  "income": {},
  "expenses": {},
  "debt": {},
  "assumptions": {}
}
```

Notes:

- Schema is intentionally strict at top level.
- Extraction/reasoning is intentionally deferred to later phases.

---

## Security Decisions

- **No API key in frontend**: OpenAI key is server-only via environment variables.
- **Rate limiting**: configurable request throttling on `/api` routes.
- **Input validation**: request body shape and limits enforced before AI execution.
- **Route protection**: optional token-based API guard (`AI_API_REQUIRE_TOKEN=true`).
- **Central error handling**: consistent machine-readable API errors.

---

## Performance Preparation (Phase 1 only)

Implemented placeholders:

- `chunkTextPlaceholder(...)`
- `embedTextPlaceholder(...)`

These include TODOs for Phase 2 integration with ingestion/vector systems.

---

## Phase Roadmap

### Phase 1 (current)

- AI infrastructure only (backend + schema + secure transport + chat shell)

### Phase 2 (planned)

- File ingestion + parsing pipelines
- Real chunking + embedding + retrieval
- Tool wiring into real data sources

### Phase 3 (planned)

- Advanced underwriting reasoning
- Error detection and suggestion engine
- Confidence scoring and explanation layer

---

## Text-based Architecture Diagram

```text
[Browser UI]
   |  (POST /api/ai/respond, /api/ai/stream)
   v
[Express API Layer]
   |- rate limiter
   |- request validation
   |- route protection
   v
[AI Orchestrator]
   |- OpenAI client wrapper
   |- tool registry (stubs)
   |- schema validation
   v
[Structured Underwriting JSON]
   (property_profile, income, expenses, debt, assumptions)
```

---

## Existing Local Tests

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

> Phase 1 AI infrastructure is additive and does not implement underwriting intelligence.
