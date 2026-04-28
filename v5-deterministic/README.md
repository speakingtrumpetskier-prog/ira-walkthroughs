# Convergent — v5 (Deterministic Form Workflow)

The form-driven counterpart to v4-engine. **No conversational agent in the core path.** Hardcoded form steps drive the workflow against the same schema-faithful orchestrator (canonical fields, gates, triage engine, state withholding, handoff package, v1.27 lifecycle). The help chatbot is the only LLM, invokable from any step as inline help — scoped to general rules education, no access to session state.

## What's deterministic vs. LLM

| Layer | Deterministic | LLM |
|---|---|---|
| Form sequence (step state machine) | ✅ — `steps.js` | — |
| Field validation against canonical registry | ✅ — `tools.js` `validateField` | — |
| Gate clearing from canonical state | ✅ — `tools.js` `evaluateGates` | — |
| Triage engine (classification rules) | ✅ — `backend/triage-engine.js` | — |
| State withholding lookup | ✅ — `backend/state-withholding.js` | — |
| Templates rendered with orchestrator-computed variables | ✅ — `tools.js` `renderTemplate` + executor variable override | — |
| Handoff package generation (Section 10A) | ✅ — `tools.js` `generateHandoffPackage` | — |
| Provider-confirmation lifecycle (v1.27) | ✅ — buttons simulate provider callback / timeout | — |
| Help chatbot (general rules education) | — | ✅ — Claude session, scoped, no shared state |

## Architecture

```
Browser
  ├─ Form pane (left) ──→ /api/session/submit  ──→ steps.js handleSubmit
  │                                                 ↓
  │                                            tools.js executeTool
  │                                              ├─ mutates session state
  │                                              ├─ invokes triage_engine
  │                                              ├─ generates handoff package
  │                                              └─ evaluates gates
  │                                                 ↓
  │                                            steps.js getCurrentStep
  │                                                 ↓
  │                                            (next step descriptor)
  │
  ├─ System view (right) ──→ renders fields by schema section, gates, audit, alerts
  │
  └─ Help chatbot (modal) ──→ /api/chatbot/chat  ──→ Claude session
                                                       │
                                                       ├─ system prompt: chatbot-context.md
                                                       ├─ tools: NONE
                                                       └─ NO access to session state
```

## Files

```
v5-deterministic/
├── backend/
│   ├── triage-engine.js     Same deterministic engine as v4
│   └── state-withholding.js Same state withholding table as v4
├── docs/
│   └── chatbot-context.md   Help chatbot system prompt
├── tools.js                 Orchestrator (CANONICAL_FIELDS, gates, templates, handoff)
├── steps.js                 Form step state machine + submit handler
├── personas.js              Provider-seeded personas (no LLM prompts)
├── server.js                HTTP server + chatbot endpoints
├── index.html
├── styles.css
├── app.js                   Form-driven UI + inline chatbot
├── package.json
└── .env.example
```

## Running locally

```bash
cd v5-deterministic
cp .env.example .env          # ANTHROPIC_API_KEY only needed for the chatbot
npm install
node server.js                # http://127.0.0.1:8793
```

The form workflow runs without an API key. The chatbot button shows an error if the key is missing — but the rest of the system works fine.

## What this prototype proves

- The agent layer is a UX skin. The schema-faithful machinery in v4 (canonical fields, gates, engine, templates, handoff package, v1.27 lifecycle) works identically when driven by a form sequence.
- Compliance audit becomes much simpler: every input the user can give and every output the system produces is enumerable (~25 step types × structured inputs × ~14 templates).
- LLM cost per session: **zero** (chatbot only invoked on demand, often not at all).
- Hallucination risk in the core workflow: **zero** (no LLM in the core path).
- Determinism: same inputs always produce same outputs.

## Caveats

- KBA validation is theatrical (any answer accepted) — production needs a real KBA service.
- E-sign envelope IDs are fake — production integrates DocuSign / Dropbox Sign.
- Provider seeding is faked via personas — production receives this via API at session initiation.
- State withholding table is a hardcoded prototype subset of ~30 states — production uses the provider's authoritative table.
- Reminder/notification engine (Schema Section 8) not implemented — same gap as v4.
- Persistent storage not implemented — sessions are in-memory.
