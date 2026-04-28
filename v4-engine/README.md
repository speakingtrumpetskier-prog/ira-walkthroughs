# Convergent — v4 (Agent + Engine + Chatbot)

The vision from the v1.5 schema and agentic-layer handoff, in working code.

## What's different from v3

- **Triage engine is deterministic JS** ([backend/triage-engine.js](backend/triage-engine.js)). Encoded directly from the v1.5 Beneficiary Classification Landscape, cohort-aware RBD math, age-gap qualification, and election deadline formulas. Agent calls it; engine returns; no inference happens in chat. When Convergent's real engine arrives, this file gets replaced; the contract stays the same.
- **Two LLM surfaces.** The conversational agent and the help chatbot run on separate Claude sessions with separate system prompts. The chatbot can't read or write session state — enforced at the server, not by prompt.
- **Subject vs Actor identity model.** Sessions distinguish operator (Section 3D) from beneficiary (3A). Milo's persona shows this — surviving father operates the session for Milo.
- **Track 3 unified path.** Trust beneficiaries no longer escalate to ops. They self-certify, get a trustee responsibility disclosure (Section 6C-ii), the inherited IRA is established, and the provider gets notified via `provider_attention_alerts`.
- **Templates for structured outputs.** Acknowledgments, disclosures, and wrap-up summaries use templated rendering — not free-form composition. Free-form remains in elicitation.
- **Custom persona builder** — set the inputs yourself and stress-test the engine.

## Architecture

```
Browser
  ├─ Agent panel (left) ──→  /api/agent/chat  ──→  Claude session #1
  │                                                  │
  │                                                  ├─ system prompt: agent-context.md + persona prompt (cached)
  │                                                  ├─ tools: update_field, pass_gate, audit, triage_engine,
  │                                                  │         request_kba/upload/esign, present_template,
  │                                                  │         flag_for_ops, suggest_chatbot, complete_session
  │                                                  ↓
  │                                            executeTool(...)
  │                                              ├─ mutates session state
  │                                              ├─ calls deterministic triage-engine.js when invoked
  │                                              └─ emits events back to client
  │
  ├─ System view (right) ──→ renders gates / fields / engine box / audit
  │
  └─ Help chatbot (floating) ──→  /api/chatbot/chat  ──→  Claude session #2
                                                              │
                                                              ├─ system prompt: chatbot-context.md (cached)
                                                              ├─ tools: NONE
                                                              └─ NO access to agent's session state
```

## Files

```
v4-engine/
├── backend/
│   └── triage-engine.js     Deterministic engine (replace at integration time)
├── docs/
│   ├── agent-context.md     Cached reference for the conversational agent
│   └── chatbot-context.md   Cached reference for the help chatbot
├── tools.js                 Tool definitions + executor + template library
├── personas.js              Three personas + custom builder
├── server.js                Two API endpoints, one per LLM surface
├── index.html
├── styles.css
├── app.js                   Frontend with three live surfaces
├── package.json
└── .env.example
```

## Personas

| | Persona | Track | Demonstrates |
|---|---|---|---|
| 1 | Elena Hale, 54 | Track 2 (post-RBD spouse) | Asserted LE + spouse-only treat-as-own option (separate from A/B framework) |
| 2 | Milo Everett (via parent), 12 | Track 1 EDB minor child | Subject ≠ Actor; A/B election; phased rule (LE → 10-year at 21) |
| 3 | Dane Family Trust | Track 3 unified | Self-cert + responsibility disclosure + in-system completion + provider_attention_alerts flag |
| 4 | Make your own | depends on inputs | Stress-test the engine on edge cases |

## Running locally

```bash
cd v4-engine
cp .env.example .env          # fill in ANTHROPIC_API_KEY
npm install
node server.js                # http://127.0.0.1:8792
```

## What this prototype proves

- The agent doesn't classify — it gathers and reports.
- The engine is rules-based and replaceable — no LLM in the classification path.
- The chatbot is architecturally isolated — separate session, no shared state.
- The cage is enforced by code (tools, server-side validation), not by prompt.
- Subject vs Actor is preserved through the UI.
- Track 3 keeps QST cases in-system.

## Caveats

- Tax rule logic in dialogue is illustrative product copy, not legal advice.
- Pre-2020 deaths and post-deadline accounting are deferred per Gen 1 scope.
- The chatbot is grounded in a curated brief, not a real KB. Production replaces this with retrieval.
- The capability matrix is *behaviorally* implemented (some tools are situationally rejected); the matrix as a spec doc is a separate artifact.
- Templates are inline; production has a versioned library.
