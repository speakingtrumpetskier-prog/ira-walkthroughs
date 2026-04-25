/* ======================================================================
   CONVERGENT — LIVE CLAUDE WALKTHROUGH (v3)
   ====================================================================== */

const root = document.getElementById("root");

const GATE_DEFS = [
  { id: "identity", label: "Identity verified" },
  { id: "death_cert", label: "Death certificate" },
  { id: "guardian", label: "Guardian authority" },
  { id: "edb_conversation", label: "EDB conversation" },
  { id: "triage", label: "Triage classification" },
  { id: "election_resolution", label: "Election resolution" },
  { id: "handoff_ready", label: "Handoff ready" }
];

/* ----------------------------------------------------------------------
   STATE
   ---------------------------------------------------------------------- */
const state = {
  scene: "intro",
  personas: [],
  personaId: null,
  sessionId: null,
  thread: [],            // {role, text}
  fields: {},
  gates: {},
  audit: [],
  freshFields: new Set(),
  pendingChips: [],
  pendingUI: null,       // {type: "upload"|"esign", title, files|bullets, envelope}
  loading: false,
  inputDisabled: false,
  outroOutcome: null,
  apiError: null,
  health: null
};

/* ----------------------------------------------------------------------
   API
   ---------------------------------------------------------------------- */
async function apiHealth() {
  const r = await fetch("/api/health");
  return r.json();
}

async function apiPersonas() {
  const r = await fetch("/api/personas");
  return r.json();
}

async function apiStart(personaId) {
  const r = await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personaId })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Start failed");
  }
  return r.json();
}

async function apiChat(message) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId, message })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || "Chat failed");
  }
  return r.json();
}

/* ----------------------------------------------------------------------
   APPLY API RESPONSE
   ---------------------------------------------------------------------- */
function applyTurnResult(result) {
  // Add agent text bubble if present
  if (result.text) {
    state.thread.push({ role: "agent", text: result.text });
  }

  // Apply events for the orchestrator panel
  state.freshFields = new Set();
  if (Array.isArray(result.events)) {
    for (const ev of result.events) {
      if (ev.type === "state_update") {
        state.fields[ev.path] = ev.value;
        state.freshFields.add(ev.path);
      } else if (ev.type === "gate_pass") {
        state.gates[ev.gate_id] = "passed";
      } else if (ev.type === "gate_flag") {
        state.gates[ev.gate_id] = "flagged";
      } else if (ev.type === "audit_add") {
        state.audit.unshift({ time: ev.time, text: ev.text });
      }
    }
  }

  state.pendingChips = result.chips || [];
  state.pendingUI = result.pendingUI || null;

  if (result.completed) {
    state.outroOutcome = result.endState;
  }

  // Refresh fields to remove fresh-flash after a beat
  setTimeout(() => {
    state.freshFields = new Set();
    if (state.scene === "sim") renderState();
  }, 1600);
}

/* ----------------------------------------------------------------------
   ACTIONS
   ---------------------------------------------------------------------- */
async function startPersona(personaId) {
  state.personaId = personaId;
  state.thread = [];
  state.fields = {};
  state.gates = {};
  state.audit = [];
  state.pendingUI = null;
  state.pendingChips = [];
  state.outroOutcome = null;
  state.apiError = null;
  state.scene = "sim";
  state.loading = true;
  render();

  try {
    const res = await apiStart(personaId);
    state.sessionId = res.sessionId;
    // Hydrate initial fields/gates/audit from server's initialState
    if (res.state) {
      Object.assign(state.fields, res.state.fields || {});
      Object.assign(state.gates, res.state.gates || {});
      if (Array.isArray(res.state.audit)) {
        state.audit = res.state.audit.slice(); // newest-first already
      }
    }
    applyTurnResult(res);
  } catch (e) {
    state.apiError = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function sendUserMessage(text) {
  if (!text || !text.trim() || state.loading) return;
  state.thread.push({ role: "user", text: text.trim() });
  state.pendingChips = [];
  state.pendingUI = null;
  state.loading = true;
  state.apiError = null;
  render();

  try {
    const res = await apiChat(text.trim());
    applyTurnResult(res);
  } catch (e) {
    state.apiError = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function confirmUpload() {
  const ui = state.pendingUI;
  if (!ui || ui.type !== "upload") return;
  const list = (ui.files || []).join(", ");
  await sendUserMessage(`[Submitted documents: ${list}]`);
}

async function confirmEsign() {
  const ui = state.pendingUI;
  if (!ui || ui.type !== "esign") return;
  await sendUserMessage(`[Signed: ${ui.title} — envelope ${ui.envelope}]`);
}

/* ----------------------------------------------------------------------
   BRAND
   ---------------------------------------------------------------------- */
const brandSvg = `
  <svg viewBox="0 0 90 54" role="presentation">
    <path d="M7 42 L23 24 L32 32 L44 14 L58 31 L66 24 L83 42" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M28 41 L28 29 L21 41 Z" fill="currentColor"/>
    <path d="M45 43 L45 21 L35 43 Z" fill="currentColor"/>
    <path d="M61 42 L61 28 L53 42 Z" fill="currentColor"/>
  </svg>
`;

function brandLockup() {
  return `
    <div class="brand-lockup">
      <div class="brand-mark">${brandSvg}</div>
      <div>
        <div class="brand-name">CONVERGENT</div>
        <div class="brand-subtitle">Retirement Plan Solutions</div>
      </div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatMessage(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/* ----------------------------------------------------------------------
   SCENES
   ---------------------------------------------------------------------- */
function renderIntro() {
  const keyOk = state.health && state.health.keyAvailable;
  root.innerHTML = `
    <section class="intro-scene">
      <header class="intro-header">
        ${brandLockup()}
        <div class="intro-meta-row">
          <div class="intro-meta">Live Walkthrough · v3</div>
          ${keyOk
            ? `<span class="mode-pill">Live · ${state.health.model}</span>`
            : `<span class="mode-pill" style="background: rgba(177, 79, 60, 0.10); color: var(--danger);">API key missing</span>`}
        </div>
      </header>

      <div class="intro-hero">
        <h1>The walkthrough,<br>now with a real agent.</h1>
        <p class="lede">
          Same shape as the scripted version: pick a beneficiary, watch the conversation,
          watch the orchestrator capture the record. The difference is that the agent layer
          is now Claude — it responds in real time, makes the tool calls that mutate session state,
          and handles whatever the beneficiary actually says, not just what you click.
        </p>
      </div>

      <div class="intro-grid">
        <div>
          <h3>How to drive it</h3>
          <p>
            Each turn shows a few <strong>suggested replies</strong> — the scripted "right answer" for
            where the conversation is. Click one to advance the happy path.
          </p>
          <p>
            Or type something else into the input box. The agent has been instructed to stay in
            scope (this account, the rules of the road, no individualized tax advice) and to escalate
            if pushed beyond. That's where the system gets tested.
          </p>
        </div>
        <div>
          <h3>What's behind the glass</h3>
          <p>
            Every fact the agent establishes flows through a tool call: <code>update_field</code>,
            <code>pass_gate</code>, <code>audit</code>, <code>request_esign</code>,
            <code>complete_session</code>. The right pane renders those mutations as they happen.
          </p>
          <p>
            That panel is the actual operations record. It's what would land in the provider's handoff package.
          </p>
        </div>
      </div>

      ${!keyOk ? `
        <div class="error-banner">
          The server can't find <code>ANTHROPIC_API_KEY</code> in <code>.env</code>. Set it and restart the server, or use the scripted version (v2) for a no-API-key demo.
        </div>
      ` : ""}

      <div class="intro-footer">
        <button class="btn btn-primary" data-action="go-picker" ${!keyOk ? "disabled" : ""}>Walk through a beneficiary →</button>
      </div>
    </section>
  `;
}

function renderPicker() {
  root.innerHTML = `
    <section class="picker-scene">
      <header class="picker-header">
        <div>
          <h2>Pick a beneficiary</h2>
          <p>Three real cases. Each shows a different lane and a different kind of complexity.</p>
        </div>
        ${brandLockup()}
      </header>

      <div class="persona-grid">
        ${state.personas
          .map(
            (p) => `
              <button class="persona-card" data-action="pick" data-persona="${p.id}">
                <div style="display:flex; gap:14px; align-items:center;">
                  <div class="persona-avatar">${p.initials}</div>
                  <div>
                    <h3 class="persona-name">${escapeHtml(p.name)}${p.age ? ", " + p.age : ""}</h3>
                    <div class="persona-tagline">${escapeHtml(p.tagline)}</div>
                  </div>
                </div>
                <p class="persona-situation">${escapeHtml(p.situation)}</p>
                <span class="persona-tag">${escapeHtml(p.tag)}</span>
              </button>
            `
          )
          .join("")}
      </div>

      <div style="margin-top: 28px;">
        <button class="btn-link" data-action="go-intro">← Back to intro</button>
      </div>
    </section>
  `;
}

function renderSim() {
  const persona = state.personas.find((p) => p.id === state.personaId);
  if (!persona) {
    state.scene = "picker";
    render();
    return;
  }

  root.innerHTML = `
    <section class="sim-scene">
      <header class="sim-header">
        <div class="sim-header-left">
          <div class="persona-avatar">${persona.initials}</div>
          <div>
            <h2>${escapeHtml(persona.name)}</h2>
            <div class="subline">${escapeHtml(persona.sessionRef)} · ${escapeHtml(persona.provider)} · ${escapeHtml(persona.lane)}</div>
          </div>
        </div>
        <div>
          ${state.health && state.health.keyAvailable
            ? `<span class="mode-pill">Live · ${state.health.model}</span>`
            : ""}
        </div>
        <div>
          <button class="btn-link" data-action="go-picker">↺ Pick another</button>
        </div>
      </header>

      <div class="sim-body">
        <div class="chat-pane">
          <div class="chat-meta">Beneficiary's view</div>
          <div class="chat-thread" id="chatThread"></div>
          <div class="chat-actions" id="chatActions"></div>
        </div>

        <div class="orch-pane">
          <div class="orch-meta">
            <div class="orch-meta-label">Behind the glass</div>
            <div class="orch-meta-title">Live tool calls · gates · state · audit log</div>
          </div>
          <div class="orch-sections">
            <div class="orch-section">
              <h4 class="orch-section-title">Workflow gates</h4>
              <div class="gate-list" id="gateList"></div>
            </div>
            <div class="orch-section">
              <h4 class="orch-section-title">Session state</h4>
              <div class="state-grid" id="stateGrid"></div>
            </div>
            <div class="orch-section">
              <h4 class="orch-section-title">Audit log</h4>
              <div class="audit-list" id="auditList"></div>
            </div>
          </div>
        </div>
      </div>

      ${state.outroOutcome ? renderOutroOverlay() : ""}
      ${state.loading ? `<div class="loading-overlay show"><div class="loading-spinner"></div></div>` : ""}
    </section>
  `;

  renderThread();
  renderActions();
  renderGates();
  renderState();
  renderAudit();
}

function renderThread() {
  const el = document.getElementById("chatThread");
  if (!el) return;
  const bubbles = state.thread.map(messageBubble).join("");
  const typing = state.loading ? `<div class="typing-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>` : "";
  el.innerHTML = bubbles + typing;
  // Defer scroll until layout has settled
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function messageBubble(m) {
  if (m.role === "system") return `<div class="chat-bubble system">${escapeHtml(m.text)}</div>`;
  return `<div class="chat-bubble ${m.role}">${formatMessage(m.text)}</div>`;
}

function renderActions() {
  const el = document.getElementById("chatActions");
  if (!el) return;

  if (state.outroOutcome) {
    el.innerHTML = "";
    return;
  }

  // API error banner (transient)
  let errorHtml = "";
  if (state.apiError) {
    errorHtml = `<div class="error-banner">${escapeHtml(state.apiError)}</div>`;
  }

  // UI tool prompts (upload / esign) take precedence over text input
  if (state.pendingUI && state.pendingUI.type === "upload") {
    const ui = state.pendingUI;
    el.innerHTML = `
      ${errorHtml}
      <div class="upload-mock">
        <div class="chat-prompt">${escapeHtml(ui.title)}</div>
        <div class="upload-files">
          ${(ui.files || []).map((f) => `<div class="upload-file">${escapeHtml(f)}</div>`).join("")}
        </div>
        <div class="continue-row">
          <button class="btn btn-primary" data-action="upload-confirm" ${state.loading ? "disabled" : ""}>Submit documents</button>
        </div>
      </div>
    `;
    return;
  }

  if (state.pendingUI && state.pendingUI.type === "esign") {
    const ui = state.pendingUI;
    el.innerHTML = `
      ${errorHtml}
      <div class="esign-mock">
        <div class="chat-prompt">${escapeHtml(ui.title)}</div>
        <div class="esign-summary">
          <ul>${(ui.bullets || []).map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>
        </div>
        <div class="esign-doc">${escapeHtml(ui.envelope || "")}</div>
        <div class="continue-row">
          <button class="btn btn-primary" data-action="esign-confirm" ${state.loading ? "disabled" : ""}>Sign electronically</button>
        </div>
      </div>
    `;
    return;
  }

  // Default: chip suggestions + text input
  const chipsHtml = (state.pendingChips || []).length > 0
    ? `
      <div class="suggestion-row">
        <span class="suggestion-label">Try</span>
        ${state.pendingChips
          .map((label) => `<button class="suggestion-chip" data-action="chip" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
          .join("")}
      </div>
    `
    : "";

  el.innerHTML = `
    ${errorHtml}
    ${chipsHtml}
    <div class="input-row">
      <textarea class="text-input" id="userInput" rows="1" placeholder="Type your reply…" ${state.loading ? "disabled" : ""}></textarea>
      <button class="send-button" data-action="send" ${state.loading ? "disabled" : ""}>Send</button>
    </div>
  `;

  const input = document.getElementById("userInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const txt = input.value;
        if (txt.trim()) sendUserMessage(txt);
      }
    });
    if (!state.loading) input.focus();
  }
}

function renderGates() {
  const el = document.getElementById("gateList");
  if (!el) return;
  const visible = GATE_DEFS.filter((g) => state.gates.hasOwnProperty(g.id));
  el.innerHTML = visible
    .map((g) => {
      const status = state.gates[g.id];
      return `
        <div class="gate-item ${status === "passed" ? "passed" : ""} ${status === "flagged" ? "flagged" : ""}">
          <span class="gate-dot"></span>
          <span>${g.label}</span>
        </div>
      `;
    })
    .join("");
}

function renderState() {
  const el = document.getElementById("stateGrid");
  if (!el) return;
  const entries = Object.entries(state.fields);
  if (entries.length === 0) {
    el.innerHTML = `<div class="state-empty">Fields populate as the conversation advances…</div>`;
    return;
  }
  el.innerHTML = entries
    .map(
      ([k, v]) => `
        <div class="state-row ${state.freshFields.has(k) ? "fresh" : ""}">
          <span class="state-key">${escapeHtml(k)}</span>
          <span class="state-val">${escapeHtml(String(v))}</span>
        </div>
      `
    )
    .join("");
}

function renderAudit() {
  const el = document.getElementById("auditList");
  if (!el) return;
  if (state.audit.length === 0) {
    el.innerHTML = `<div class="audit-empty">Audit entries will stream in as actions are taken…</div>`;
    return;
  }
  el.innerHTML = state.audit
    .map(
      (e) => `
        <div class="audit-entry">
          <div class="audit-time">${escapeHtml(e.time || "")}</div>
          <div>${escapeHtml(e.text)}</div>
        </div>
      `
    )
    .join("");
}

function renderOutroOverlay() {
  const persona = state.personas.find((p) => p.id === state.personaId);
  const rows = [
    ["Persona", persona ? persona.name : ""],
    ["Provider", persona ? persona.provider : ""],
    ["Lane", persona ? persona.lane : ""],
    ["End state", state.outroOutcome || ""],
    ["Audit entries", String(state.audit.length)],
    ["Captured fields", String(Object.keys(state.fields).length)]
  ];
  return `
    <div class="outro-overlay">
      <div class="outro-card">
        <div class="outro-kicker">Walkthrough complete</div>
        <h2>What the provider receives</h2>
        <p>
          Everything captured during the conversation — verifications, classification, election,
          documents, e-signatures, and the full audit log — bundles into a structured handoff
          package for the provider. The provider remains the record of authority.
        </p>
        <div class="outro-summary">
          ${rows
            .map(
              ([k, v]) => `
                <div class="outro-summary-row">
                  <span class="outro-summary-key">${escapeHtml(k)}</span>
                  <span class="outro-summary-val">${escapeHtml(v)}</span>
                </div>
              `
            )
            .join("")}
        </div>
        <div class="outro-actions">
          <button class="btn btn-ghost" data-action="go-intro">Back to intro</button>
          <button class="btn btn-primary" data-action="go-picker">Walk through another →</button>
        </div>
      </div>
    </div>
  `;
}

/* ----------------------------------------------------------------------
   ROUTER
   ---------------------------------------------------------------------- */
function render() {
  if (state.scene === "intro") return renderIntro();
  if (state.scene === "picker") return renderPicker();
  if (state.scene === "sim") return renderSim();
}

/* ----------------------------------------------------------------------
   EVENT DELEGATION
   ---------------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "go-intro") {
    state.scene = "intro";
    state.outroOutcome = null;
    state.pendingUI = null;
    render();
    return;
  }

  if (action === "go-picker") {
    state.scene = "picker";
    state.outroOutcome = null;
    state.pendingUI = null;
    render();
    return;
  }

  if (action === "pick") {
    startPersona(target.dataset.persona);
    return;
  }

  if (action === "send") {
    const input = document.getElementById("userInput");
    if (input && input.value.trim()) {
      sendUserMessage(input.value);
    }
    return;
  }

  if (action === "chip") {
    sendUserMessage(target.dataset.label);
    return;
  }

  if (action === "upload-confirm") {
    confirmUpload();
    return;
  }

  if (action === "esign-confirm") {
    confirmEsign();
    return;
  }
});

/* ----------------------------------------------------------------------
   BOOT
   ---------------------------------------------------------------------- */
async function boot() {
  try {
    state.health = await apiHealth();
    const personas = await apiPersonas();
    state.personas = personas.personas || [];
  } catch (e) {
    state.apiError = e.message;
  }
  render();
}

boot();
