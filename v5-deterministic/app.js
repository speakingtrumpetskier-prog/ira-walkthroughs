/* ======================================================================
   CONVERGENT v5-deterministic — Form-driven UI + inline chatbot
   ====================================================================== */

const root = document.getElementById("root");

const GATE_ORDER = [
  { id: "authorized_representative", label: "Auth-rep / guardian" },
  { id: "trust_trustee", label: "Trustee identity" },
  { id: "identity", label: "Identity verified" },
  { id: "death_cert", label: "Death certificate" },
  { id: "edb_conversation", label: "EDB conversation" },
  { id: "selfcert", label: "Self-certification" },
  { id: "triage", label: "Triage classification" },
  { id: "election_resolution", label: "Election resolution" },
  { id: "yod_rmd_disclosure", label: "YOD RMD disclosure" },
  { id: "withdrawal_request", label: "Withdrawal request" },
  { id: "handoff_ready", label: "Handoff ready" }
];

const FIELD_SECTIONS = {
  "session.provider": "1A · Session Identity",
  "session.status": "1B · Session Status",
  "session.escalated": "5D · Escalation",
  "session.esign_complete": "7 · E-Sign",
  "ira.type": "2A · Account",
  "ira.balance": "2C · Account",
  "owner.name": "2A · Owner",
  "owner.dob": "2A · Owner",
  "owner.dod": "2A · Owner",
  "beneficiary.name": "3A · Beneficiary Identity",
  "beneficiary.name (Subject)": "3A · Beneficiary Identity",
  "beneficiary.dob": "3A · Beneficiary Identity",
  "beneficiary.age": "3A · Beneficiary Identity",
  "beneficiary.state": "3A · Beneficiary Identity",
  "beneficiary.relationship": "4A · Classification",
  "beneficiary.type": "4A · Classification",
  "beneficiary.classification": "4D · Engine Input",
  "verification.identity": "3B · Verification",
  "verification.death_cert": "3B · Verification",
  "actor.name (Operator, 3D)": "3D · Session Actor",
  "actor.role": "3D · Session Actor",
  "actor.relationship_to_subject": "3D · Session Actor",
  "auth_rep_docs.uploaded": "4F · Authorized Rep",
  "representative_role_type": "4F · Authorized Rep",
  "selfcert.trust_status": "4B · Self-cert",
  "trust.q1": "4B · Self-cert",
  "trust.q2": "4B · Self-cert",
  "trust.q3": "4B · Self-cert",
  "trust.q4": "4B · Self-cert",
  "trust.name": "4G · Trust Identity",
  "trustee_type": "4G · Trust Identity",
  "corporate_trustee_entity_name": "4G · Trust Identity",
  "edb.conversation_complete": "5D · EDB Conversation",
  "session_end_state": "5B · Session End State",
  "session_end_state_in_good_order": "5B · Session End State",
  "inherited_ira_establishment_status": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_pending_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_confirmed_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_fallback_applied_at": "5B · Establishment Status (v1.27)",
  "election.distribution_method": "6A · Election",
  "election.declined": "6A · Election",
  "spouse.path_chosen": "6A · Election",
  "distribution_requirements_acknowledged": "6C-i · Distribution Reqs",
  "trustee_responsibility_disclosure.acknowledged": "6C-ii · Trustee Disclosure",
  "trustee_responsibility_disclosure_acknowledged": "6C-ii · Trustee Disclosure",
  "withdrawal_request_decision": "6D · Withdrawal Decision",
  "withdrawal_request_type": "9A · Withdrawal Identity",
  "withdrawal_request_id": "9A · Withdrawal Identity",
  "yod_rmd.applicable": "6E · YOD RMD",
  "yod_rmd.disclosed": "6E · YOD RMD",
  "yod_rmd_disclosure_acknowledged": "6E · YOD RMD",
  "lumpsum_instruction_confirmed": "9B · Lump Sum",
  "onetime_amount_type": "9C · One-Time",
  "onetime_amount": "9C · One-Time",
  "onetime_amount_percentage": "9C · One-Time",
  "onetime_amount_confirmed": "9C · One-Time",
  "onetime_timing_preference": "9C · One-Time",
  "standing_distribution_basis": "9D · Standing",
  "standing_fixed_amount": "9D · Standing",
  "standing_fixed_percentage": "9D · Standing",
  "standing_frequency": "9D · Standing",
  "standing_start_date": "9D · Standing",
  "standing_instruction_confirmed": "9D · Standing",
  "federal_withholding_election": "9E · Withholding",
  "federal_withholding_percentage": "9E · Withholding",
  "state_withholding_applicable": "9E · Withholding",
  "state_withholding_mandatory": "9E · Withholding",
  "state_withholding_default_rate": "9E · Withholding",
  "state_withholding_state_label": "9E · Withholding",
  "state_withholding_election": "9E · Withholding",
  "state_withholding_percentage": "9E · Withholding",
  "withdrawal_tax_disclosure_acknowledged": "9E · Withholding",
  "withholding_election_confirmed": "9E · Withholding",
  "withdrawal_esign_completed": "9F · Withdrawal Handoff",
  "esign_all_complete": "7 · E-Sign",
  "esign_last_completed_at": "7 · E-Sign",
  "engine.applicable_rule_set": "4D · Engine Output",
  "engine.election_eligible": "4D · Engine Output",
  "engine.election_track": "4D · Engine Output",
  "engine.election_options": "4D · Engine Output",
  "engine.election_deadline": "4D · Engine Output",
  "engine.asserted_rule": "4D · Engine Output",
  "engine.owner_rbd_status": "2B · Computed RBD",
  "engine.owner_rbd_date": "2B · Computed RBD",
  "engine.owner_rmd_attainment_year": "2B · Computed RBD",
  "engine.distribution_window_end": "4D · Engine Output",
  "engine.annual_rmd_required": "4D · Engine Output",
  "handoff_package_id": "10A · Handoff Package",
  "handoff_package_type": "10A · Handoff Package",
  "handoff_package_generated": "10A · Handoff Package",
  "handoff_package_transmitted": "10A · Handoff Package",
  "session_formally_closed": "10E · Session Closure",
  "session_closure_initiated_by": "10E · Session Closure"
};

const SECTION_ORDER = [
  "1A · Session Identity",
  "1B · Session Status",
  "2A · Owner",
  "2A · Account",
  "2C · Account",
  "2B · Computed RBD",
  "3A · Beneficiary Identity",
  "3B · Verification",
  "3D · Session Actor",
  "4A · Classification",
  "4B · Self-cert",
  "4D · Engine Input",
  "4D · Engine Output",
  "4F · Authorized Rep",
  "4G · Trust Identity",
  "5B · Session End State",
  "5B · Establishment Status (v1.27)",
  "5D · EDB Conversation",
  "5D · Escalation",
  "6A · Election",
  "6C-i · Distribution Reqs",
  "6C-ii · Trustee Disclosure",
  "6D · Withdrawal Decision",
  "6E · YOD RMD",
  "7 · E-Sign",
  "9A · Withdrawal Identity",
  "9B · Lump Sum",
  "9C · One-Time",
  "9D · Standing",
  "9E · Withholding",
  "9F · Withdrawal Handoff",
  "10A · Handoff Package",
  "10E · Session Closure"
];

/* ----------------------------------------------------------------------
   STATE
   ---------------------------------------------------------------------- */
const state = {
  scene: "intro",
  personas: [],
  personaId: null,
  sessionId: null,
  persona: null,
  step: null,
  fields: {},
  gates: {},
  audit: [],
  engine: null,
  providerAttentionAlerts: [],
  freshFields: new Set(),
  loading: false,
  apiError: null,
  health: null,
  // outcome view
  outroOutcome: null,
  handoffPackage: null,
  handoffPackageOpen: false,
  // unified chat transcript (workflow + chatbot interleaved)
  transcript: [],
  transcriptCounter: 0,
  // chatbot session tracking (no separate panel — appears inline in transcript)
  chatbotSessionId: null,
  chatbotLoading: false,
  customSpec: defaultCustomSpec()
};

function nextMsgId() {
  state.transcriptCounter += 1;
  return `m${state.transcriptCounter}`;
}

function defaultCustomSpec() {
  return {
    beneficiaryName: "Avery Test",
    beneficiaryDob: "1978-04-15",
    iraType: "traditional",
    iraBalance: "$300,000",
    ownerName: "Pat Test",
    ownerDob: "1955-09-01",
    ownerDod: "2025-08-12",
    relationship: "child",
    isMinor: false,
    actorName: "",
    isTrustBeneficiary: false,
    isEntity: false,
    enableWithdrawalFlow: false
  };
}

/* ----------------------------------------------------------------------
   API
   ---------------------------------------------------------------------- */
async function apiHealth() {
  const r = await fetch("/api/health");
  return await r.json();
}

async function apiPersonas() {
  const r = await fetch("/api/personas");
  return await r.json();
}

async function apiStart(personaId, customSpec) {
  const r = await fetch("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personaId, customSpec })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || `start failed (${r.status})`);
  }
  return await r.json();
}

async function apiSubmit(formData) {
  const r = await fetch("/api/session/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId, formData })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `submit failed (${r.status})`);
  return data;
}

async function apiHandoffPackage() {
  const r = await fetch(`/api/session/handoff-package?sessionId=${encodeURIComponent(state.sessionId)}`);
  return await r.json();
}

async function apiProviderConfirm() {
  const r = await fetch("/api/session/provider-confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId })
  });
  return await r.json();
}

async function apiSimulateTimeout() {
  const r = await fetch("/api/session/simulate-timeout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId })
  });
  return await r.json();
}

async function apiChatbotStart() {
  const r = await fetch("/api/chatbot/start", { method: "POST" });
  return await r.json();
}

async function apiChatbotChat(message) {
  const r = await fetch("/api/chatbot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.chatbotSessionId, message })
  });
  return await r.json();
}

/* ----------------------------------------------------------------------
   STATE APPLY
   ---------------------------------------------------------------------- */
function applySessionResponse(data, opts) {
  opts = opts || {};
  if (!data) return;
  if (data.sessionId) state.sessionId = data.sessionId;
  if (data.persona) state.persona = data.persona;

  const previousStep = state.step;
  const newStep = data.step;
  if (newStep) state.step = newStep;

  if (data.state) {
    const incoming = data.state;
    state.freshFields = new Set();
    if (incoming.fields) {
      const newKeys = Object.keys(incoming.fields).filter((k) => state.fields[k] !== incoming.fields[k]);
      for (const k of newKeys) state.freshFields.add(k);
      state.fields = { ...incoming.fields };
    }
    if (incoming.gates) state.gates = { ...incoming.gates };
    if (incoming.audit) state.audit = incoming.audit.slice();
    if (incoming.engine !== undefined) state.engine = incoming.engine;
    if (Array.isArray(incoming.providerAttentionAlerts)) state.providerAttentionAlerts = incoming.providerAttentionAlerts.slice();
    if (incoming.completed) {
      state.outroOutcome = incoming.endState;
    }
  }

  // Transcript management — append the new step as a system message if it's
  // different from the prior active one. The submit handler is responsible
  // for marking the prior message resolved + appending the user response
  // BEFORE this point fires.
  if (newStep) {
    const prevActive = findActiveStepMsg();
    const isNewStep = !prevActive || prevActive.step.step_id !== newStep.step_id;
    if (isNewStep || opts.alwaysAppend) {
      state.transcript.push({
        id: nextMsgId(),
        role: "system",
        kind: "step",
        step: newStep,
        status: "active"
      });
    } else {
      // Same step echoed back (e.g., on initial load after a refresh) — refresh its descriptor.
      prevActive.step = newStep;
    }
  }

  setTimeout(() => { state.freshFields = new Set(); render(); }, 1500);
}

function findActiveStepMsg() {
  for (let i = state.transcript.length - 1; i >= 0; i--) {
    const m = state.transcript[i];
    if (m.role === "system" && m.kind === "step" && m.status === "active") return m;
  }
  return null;
}

/* ----------------------------------------------------------------------
   ACTIONS
   ---------------------------------------------------------------------- */
async function loadHealth() {
  try {
    state.health = await apiHealth();
  } catch (e) {
    state.health = { ok: false, error: e.message };
  }
}

async function loadPersonas() {
  try {
    const data = await apiPersonas();
    state.personas = data.personas || [];
  } catch (e) {
    state.apiError = e.message;
  }
}

async function startPersona(personaId, customSpec) {
  state.personaId = personaId;
  state.fields = {};
  state.gates = {};
  state.audit = [];
  state.engine = null;
  state.providerAttentionAlerts = [];
  state.handoffPackage = null;
  state.handoffPackageOpen = false;
  state.outroOutcome = null;
  state.apiError = null;
  state.transcript = [];
  state.transcriptCounter = 0;
  state.chatbotSessionId = null;
  state.scene = "session";
  state.loading = true;
  render();
  try {
    const data = await apiStart(personaId, customSpec);
    applySessionResponse(data);
  } catch (e) {
    state.apiError = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function submitStep(formData) {
  if (state.loading) return;
  // Mark the active step resolved + append a user-response message BEFORE the network call.
  const active = findActiveStepMsg();
  if (active) {
    active.status = "resolved";
    active.userResponse = summarizeResponse(active.step, formData);
    state.transcript.push({
      id: nextMsgId(),
      role: "user",
      kind: "step_response",
      text: active.userResponse,
      stepRef: active.step.step_id
    });
  }
  state.loading = true;
  state.apiError = null;
  render();
  try {
    const data = await apiSubmit(formData);
    applySessionResponse(data);
  } catch (e) {
    state.apiError = e.message;
    // Roll back the resolved status if submission failed
    if (active) {
      active.status = "active";
      delete active.userResponse;
      // Pop the user-response message we just appended
      if (state.transcript.length && state.transcript[state.transcript.length - 1].kind === "step_response") {
        state.transcript.pop();
      }
    }
  } finally {
    state.loading = false;
    render();
  }
}

/* ----------------------------------------------------------------------
   summarizeResponse — human-readable summary for the user-response bubble
   ---------------------------------------------------------------------- */
function summarizeResponse(step, formData) {
  switch (step.type) {
    case "welcome": return "Begin";
    case "auth_rep_role": return formData["actor.role"] || "(role)";
    case "auth_rep_upload": return "Submitted documents";
    case "trust_info": return `Trust: ${formData["trust.name"] || ""}${formData.trustee_type ? ` · ${formData.trustee_type}` : ""}`;
    case "kba": return formData.kba_answer || "(answer)";
    case "death_cert": return "Confirmed";
    case "trust_selfcert": return formData.selfcert_decision === "completed" ? "Self-cert: completed" : "Self-cert: declined";
    case "classification": {
      const rel = formData["beneficiary.relationship"] || "";
      const flags = [];
      if (formData.is_minor === "true") flags.push("minor");
      if (formData.is_disabled === "true") flags.push("disabled");
      if (formData.is_chronically_ill === "true") flags.push("chronically ill");
      return `Relationship: ${rel}${flags.length ? ` (${flags.join(", ")})` : ""}`;
    }
    case "edb_confirm": return "Confirmed";
    case "engine_call": return "Run engine";
    case "engine_report": return "Acknowledged the engine report";
    case "yod_rmd_disclosure": return "Acknowledged the YOD RMD disclosure";
    case "spouse_options": return `Path: ${formData["spouse.path_chosen"] || ""}`;
    case "election_track1": return `Election: ${formData["election.distribution_method"] || ""}`;
    case "acknowledge_track2": return "Acknowledged distribution requirements";
    case "trust_disclosure": return "Acknowledged trustee responsibility disclosure";
    case "esign": return "Signed";
    case "withdrawal_esign": return "Signed withdrawal instruction";
    case "wrap_template": return "Acknowledged wrap-up";
    case "withdrawal_options": {
      const c = formData.withdrawal_choice;
      if (c === "decline") return "Skip withdrawal setup";
      return `Withdrawal: ${c || ""}`;
    }
    case "withdrawal_lumpsum": return "Confirmed lump sum";
    case "withdrawal_onetime": {
      const t = formData.onetime_amount_type;
      if (t === "percentage") return `One-time: ${formData.onetime_amount_percentage || "?"}% (${formData.onetime_timing_preference || ""})`;
      return `One-time: $${formData.onetime_amount || "?"} (${formData.onetime_timing_preference || ""})`;
    }
    case "withdrawal_standing": return `Standing: ${formData.standing_distribution_basis || ""} · ${formData.standing_frequency || ""} · start ${formData.standing_start_date || ""}`;
    case "state_capture": return `State: ${(formData["beneficiary.state"] || "").toUpperCase()}`;
    case "withholding": {
      const fed = formData.federal_withholding_election || "—";
      const st = formData.state_withholding_election;
      return `Federal: ${fed}${st ? ` · State: ${st}` : ""}`;
    }
    case "withdrawal_wrap": return "Acknowledged withdrawal wrap";
    case "complete_session": return "Finalize";
    default: return "Continue";
  }
}

async function confirmProvider() {
  try {
    const data = await apiProviderConfirm();
    applySessionResponse(data);
  } catch (e) { state.apiError = e.message; render(); }
}

async function simulateTimeout() {
  try {
    const data = await apiSimulateTimeout();
    applySessionResponse(data);
  } catch (e) { state.apiError = e.message; render(); }
}

async function viewHandoffPackage() {
  state.handoffPackageOpen = true;
  if (!state.handoffPackage) {
    try {
      const data = await apiHandoffPackage();
      if (data.handoffPackage) state.handoffPackage = data.handoffPackage;
    } catch (e) { state.apiError = e.message; }
  }
  render();
}

async function ensureChatbotSession() {
  if (state.chatbotSessionId) return;
  try {
    const r = await apiChatbotStart();
    state.chatbotSessionId = r.sessionId;
  } catch (e) {
    // Silent — error surfaces when the user tries to send
  }
}

async function sendChatbotMessage(text) {
  const trimmed = (text || "").trim();
  if (!trimmed || state.chatbotLoading) return;
  // Append user question and pending bot bubble to the unified transcript
  state.transcript.push({
    id: nextMsgId(),
    role: "user",
    kind: "chatbot_question",
    text: trimmed
  });
  const botMsgId = nextMsgId();
  state.transcript.push({
    id: botMsgId,
    role: "chatbot",
    kind: "chatbot_reply",
    text: "",
    pending: true
  });
  state.chatbotLoading = true;
  render();
  try {
    if (!state.chatbotSessionId) await ensureChatbotSession();
    const res = await apiChatbotChat(trimmed);
    if (res.sessionId) state.chatbotSessionId = res.sessionId;
    const botMsg = state.transcript.find((m) => m.id === botMsgId);
    if (botMsg) {
      botMsg.text = res.text || "(no response)";
      botMsg.pending = false;
      if (res.error) botMsg.text = `Help assistant unavailable: ${res.error}`;
    }
  } catch (e) {
    const botMsg = state.transcript.find((m) => m.id === botMsgId);
    if (botMsg) {
      botMsg.text = `Help assistant error: ${e.message}`;
      botMsg.pending = false;
    }
  } finally {
    state.chatbotLoading = false;
    render();
  }
}

/* ----------------------------------------------------------------------
   RENDERERS
   ---------------------------------------------------------------------- */
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMarkdown(text) {
  if (!text) return "";
  // Minimal: bold, escape, line breaks
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^\*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\n\n/g, "</p><p>");
  out = out.replace(/\n/g, "<br>");
  return `<p>${out}</p>`;
}

function brandLockup() {
  return `<div class="brand">
    <span class="brand-mark">Convergent</span>
    <span class="brand-tag">v5 — Form-driven · No agent in core path</span>
  </div>`;
}

function renderIntro() {
  root.innerHTML = `
    <section class="intro-scene">
      <header class="intro-header">${brandLockup()}</header>
      <main class="intro-main">
        <h1>Deterministic workflow,<br>chatbot for help.</h1>
        <p class="intro-lede">No conversational agent in the core workflow. The schema-bound questions are hardcoded as forms; user clicks, types, or uploads the answers; the orchestrator validates, runs the triage engine deterministically, and assembles the handoff package. The help chatbot is the only LLM — invokable from any step as inline help, scoped to general rules education only.</p>
        <div class="intro-grid">
          <div class="intro-card">
            <h3>What's deterministic</h3>
            <ul>
              <li>Form sequence per session phase</li>
              <li>Field validation against the v1.5 canonical registry</li>
              <li>Gate clearing from canonical state</li>
              <li>Triage engine in JS (replaceable contract)</li>
              <li>State withholding lookup table</li>
              <li>Handoff package generation (Section 10A)</li>
              <li>v1.27 provider-confirmation lifecycle</li>
            </ul>
          </div>
          <div class="intro-card">
            <h3>What's LLM</h3>
            <ul>
              <li>Help chatbot only — invoked from any form step</li>
              <li>Scoped to general rules education</li>
              <li>No access to session state</li>
              <li>Cannot write fields, advance gates, or modify the workflow</li>
              <li>Optional — workflow runs without the API key</li>
            </ul>
          </div>
        </div>
        <button class="btn btn-primary btn-large" data-action="go-picker">Pick a test scenario →</button>
        <p class="intro-foot">Companion to v4-engine (conversational version) for comparison.</p>
      </main>
    </section>
  `;
}

function renderPicker() {
  const items = state.personas.map((p) => `
    <div class="persona-card" data-action="pick-persona" data-persona-id="${escapeHtml(p.id)}">
      <div class="persona-header">
        <span class="persona-initials">${escapeHtml(p.initials)}</span>
        <div>
          <div class="persona-name">${escapeHtml(p.name)}</div>
          <div class="persona-ref">${escapeHtml(p.provider)} · ${escapeHtml(p.sessionRef)}</div>
        </div>
      </div>
      <div class="persona-tagline">${escapeHtml(p.tagline)}</div>
      <div class="persona-lane">${escapeHtml(p.laneHint)}</div>
      <div class="persona-tag">${escapeHtml(p.tag)}</div>
    </div>
  `).join("");

  root.innerHTML = `
    <section class="picker-scene">
      <header class="picker-header">
        <div>
          <h2>Pick a scenario</h2>
          <p>Each persona seeds the orchestrator with a different provider data set. Click any card to start.</p>
        </div>
        ${brandLockup()}
      </header>
      <div class="persona-grid">${items}</div>
      <div class="picker-actions">
        <button class="btn btn-ghost" data-action="go-intro">← Back</button>
      </div>
    </section>
  `;
}

function renderCustomBuilder() {
  const c = state.customSpec;
  root.innerHTML = `
    <section class="picker-scene">
      <header class="picker-header">
        <div>
          <h2>Build a custom test scenario</h2>
          <p>Provider-seeded inputs the orchestrator uses to route the case.</p>
        </div>
        ${brandLockup()}
      </header>
      <div class="custom-builder-card">
        <h3>Inputs</h3>
        <div class="custom-grid">
          <div class="custom-field">
            <label>Beneficiary name</label>
            <input id="cb-bn" value="${escapeHtml(c.beneficiaryName)}" />
          </div>
          <div class="custom-field">
            <label>Beneficiary DOB (YYYY-MM-DD)</label>
            <input id="cb-bdob" value="${escapeHtml(c.beneficiaryDob)}" />
          </div>
          <div class="custom-field">
            <label>Owner name</label>
            <input id="cb-on" value="${escapeHtml(c.ownerName)}" />
          </div>
          <div class="custom-field">
            <label>Owner DOB</label>
            <input id="cb-odob" value="${escapeHtml(c.ownerDob)}" />
          </div>
          <div class="custom-field">
            <label>Owner DOD</label>
            <input id="cb-odod" value="${escapeHtml(c.ownerDod)}" />
          </div>
          <div class="custom-field">
            <label>IRA type</label>
            <select id="cb-itype">
              <option value="traditional" ${c.iraType === "traditional" ? "selected" : ""}>Traditional</option>
              <option value="roth" ${c.iraType === "roth" ? "selected" : ""}>Roth</option>
            </select>
          </div>
          <div class="custom-field">
            <label>IRA balance</label>
            <input id="cb-bal" value="${escapeHtml(c.iraBalance)}" />
          </div>
          <div class="custom-field">
            <label>Relationship</label>
            <select id="cb-rel">
              <option value="spouse">Spouse</option>
              <option value="child">Child</option>
              <option value="grandchild">Grandchild</option>
              <option value="sibling">Sibling</option>
              <option value="parent">Parent</option>
              <option value="other_relative">Other relative</option>
              <option value="non_relative">Non-relative</option>
              <option value="trust">Trust</option>
            </select>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox"><input type="checkbox" id="cb-minor" /> Beneficiary is a minor</label>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox"><input type="checkbox" id="cb-trust" /> Trust beneficiary (Track 3)</label>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox"><input type="checkbox" id="cb-entity" /> Entity beneficiary (non-EDB non-person)</label>
          </div>
          <div class="custom-field">
            <label>Actor name (if not the beneficiary)</label>
            <input id="cb-actor" value="${escapeHtml(c.actorName || "")}" />
          </div>
          <div class="custom-field">
            <label class="custom-checkbox"><input type="checkbox" id="cb-withdraw" /> Demo Section 9 withdrawal flow</label>
          </div>
        </div>
        <div class="custom-actions">
          <button class="btn btn-ghost" data-action="go-picker">Cancel</button>
          <button class="btn btn-primary" data-action="run-custom">Start session →</button>
        </div>
      </div>
    </section>
  `;
  // Pre-check the boxes from state
  document.getElementById("cb-rel").value = c.relationship;
  document.getElementById("cb-minor").checked = !!c.isMinor;
  document.getElementById("cb-trust").checked = !!c.isTrustBeneficiary;
  document.getElementById("cb-entity").checked = !!c.isEntity;
  document.getElementById("cb-withdraw").checked = !!c.enableWithdrawalFlow;
}

/* ======================================================================
   SESSION SCENE — chat-transcript layout
   ====================================================================== */
function renderSession() {
  if (!state.persona) {
    state.scene = "picker";
    render();
    return;
  }
  root.innerHTML = `
    <div class="session-shell">
      <header class="session-header">
        <button class="btn btn-ghost btn-small" data-action="go-picker">← Sessions</button>
        <div class="session-id">
          <strong>${escapeHtml(state.persona.name || "")}</strong>
          <span>${escapeHtml(state.persona.provider || "")} · ${escapeHtml(state.persona.sessionRef || "")}</span>
        </div>
        <div class="session-mode">v5 · deterministic · chat transcript</div>
      </header>
      <div class="session-layout">
        <div class="chat-pane">
          <div class="chat-thread" id="chatThread">${renderTranscript()}</div>
          ${renderBottomBar()}
        </div>
        <div class="orch-pane">
          <div class="orch-pane-header">
            <h3>Orchestrator state</h3>
            <span class="orch-pane-sub">v1.5 schema · canonical fields</span>
          </div>
          <div id="orchSections">${renderOrchSections()}</div>
        </div>
      </div>
      ${state.outroOutcome ? renderOutroOverlay() : ""}
    </div>
  `;
  attachSessionHandlers();
  scrollChatToBottom();
}

function renderBottomBar() {
  const active = findActiveStepMsg();
  const mode = active ? stepInputMode(active.step) : "none";
  const isTextMode = mode === "text";
  const textInput = isTextMode ? active.step.inputs[0] : null;

  let placeholder, primaryLabel, primaryAction, indicator;
  if (state.outroOutcome) {
    placeholder = "Ask the help assistant about this case…";
    primaryLabel = "Ask";
    primaryAction = "bottom-ask";
    indicator = "Workflow complete · ask the help assistant about this case";
  } else if (isTextMode) {
    placeholder = textInput.label + (textInput.suggested ? ` (try ${textInput.suggested})` : "");
    primaryLabel = "Send answer";
    primaryAction = "bottom-answer";
    indicator = `Answering: <strong>${escapeHtml(textInput.label)}</strong> — or click "Ask the assistant" to ask a question instead.`;
  } else {
    placeholder = "Ask the help assistant a question…";
    primaryLabel = "Ask";
    primaryAction = "bottom-ask";
    indicator = active
      ? "Choose an option above, or ask the help assistant a general rules question here."
      : "Ask the help assistant a general rules question.";
  }

  const errorHtml = state.apiError ? `<div class="chat-error">${escapeHtml(state.apiError)}</div>` : "";
  const askInsteadBtn = isTextMode
    ? `<button type="button" class="btn btn-link bottom-secondary" data-action="bottom-ask">Ask the assistant instead</button>`
    : "";

  return `
    <div class="chat-bottom-bar">
      ${errorHtml}
      <div class="chat-bottom-indicator">${indicator}</div>
      <div class="chat-input-row">
        <input id="chatBottomInput" type="text" placeholder="${escapeHtml(placeholder)}" ${state.chatbotLoading || state.loading ? "disabled" : ""} />
        <button class="btn btn-primary" data-action="${primaryAction}" ${state.chatbotLoading || state.loading ? "disabled" : ""}>${primaryLabel}</button>
      </div>
      ${askInsteadBtn ? `<div class="chat-bottom-secondary-row">${askInsteadBtn}</div>` : ""}
    </div>
  `;
}

function scrollChatToBottom() {
  const t = document.getElementById("chatThread");
  if (t) t.scrollTop = t.scrollHeight;
}

function attachSessionHandlers() {
  // Multi-input form-in-bubble handler (rare — only for "form" mode steps)
  const form = document.getElementById("activeStepForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const formData = {};
      const inputs = form.querySelectorAll("input, select, textarea");
      inputs.forEach((el) => {
        if (el.type === "checkbox") {
          formData[el.name] = el.checked ? "true" : "";
        } else if (el.type === "radio") {
          if (el.checked) formData[el.name] = el.value;
        } else {
          formData[el.name] = el.value;
        }
      });
      submitStep(formData);
    });
  }
  // Bottom bar — Enter key triggers the primary action (answer or ask)
  const inp = document.getElementById("chatBottomInput");
  if (inp) {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (!inp.value.trim()) return;
        const active = findActiveStepMsg();
        const mode = active ? stepInputMode(active.step) : "none";
        const v = inp.value;
        inp.value = "";
        if (mode === "text" && !state.outroOutcome) {
          const inputName = active.step.inputs[0].name;
          submitStep({ [inputName]: v });
        } else {
          sendChatbotMessage(v);
        }
      }
    });
    if (!state.chatbotLoading && !state.loading) inp.focus();
  }
}

/* ----------------------------------------------------------------------
   TRANSCRIPT RENDERING
   ---------------------------------------------------------------------- */
function renderTranscript() {
  if (!state.transcript.length) {
    return `<div class="transcript-empty">Loading…</div>`;
  }
  return state.transcript.map(renderMessage).join("");
}

function renderMessage(msg) {
  if (msg.role === "user") return renderUserMessage(msg);
  if (msg.role === "chatbot") return renderChatbotMessage(msg);
  if (msg.role === "system" && msg.kind === "step") return renderStepBubble(msg);
  return "";
}

function renderUserMessage(msg) {
  const cls = msg.kind === "chatbot_question" ? "chat-msg-user chat-msg-user-question" : "chat-msg-user chat-msg-user-response";
  return `
    <div class="chat-msg ${cls}">
      <div class="chat-bubble chat-bubble-user">${escapeHtml(msg.text)}</div>
    </div>
  `;
}

function renderChatbotMessage(msg) {
  if (msg.pending) {
    return `
      <div class="chat-msg chat-msg-chatbot">
        <div class="chat-msg-author">Help assistant</div>
        <div class="chat-bubble chat-bubble-chatbot loading">…</div>
      </div>
    `;
  }
  return `
    <div class="chat-msg chat-msg-chatbot">
      <div class="chat-msg-author">Help assistant</div>
      <div class="chat-bubble chat-bubble-chatbot">${renderMarkdown(msg.text)}</div>
    </div>
  `;
}

function renderStepBubble(msg) {
  const step = msg.step;
  const isActive = msg.status === "active";
  const phaseLabel = {
    intake: "Phase 1 · Intake",
    triage_prep: "Phase 2 · Triage prep",
    election: "Phase 3 · Election",
    wrap: "Phase 4 · Wrap",
    complete: "Complete"
  }[step.phase] || step.phase;

  const meta = `
    <div class="chat-step-meta">
      <span class="chat-step-phase">${escapeHtml(phaseLabel)}</span>
      <span class="chat-step-id">${escapeHtml(step.step_id)}</span>
    </div>
  `;

  const header = `
    <div class="chat-msg-author">Workflow</div>
    <div class="chat-bubble chat-bubble-system ${isActive ? "active" : "resolved"}">
      ${meta}
      ${step.title ? `<h3 class="chat-step-title">${escapeHtml(step.title)}</h3>` : ""}
      ${step.prompt ? `<p class="chat-step-prompt">${escapeHtml(step.prompt)}</p>` : ""}
      ${step.body ? `<div class="chat-step-body">${renderMarkdown(step.body)}</div>` : ""}
      ${step.bullets && step.bullets.length ? `<ul class="chat-step-bullets">${step.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
      ${step.envelope ? `<div class="esign-envelope">DocuSign envelope · <code>${escapeHtml(step.envelope)}</code></div>` : ""}
      ${step.options && step.options.files ? `<div class="upload-files">${step.options.files.map((f) => `<div class="upload-file">${escapeHtml(f)}</div>`).join("")}</div>` : ""}
      ${isActive ? renderActiveStepContent(step) : renderResolvedSummary(msg)}
    </div>
  `;
  return `<div class="chat-msg chat-msg-system">${header}</div>`;
}

/* ----------------------------------------------------------------------
   stepInputMode — categorize how the active step takes user input
   ---------------------------------------------------------------------- */
function stepInputMode(step) {
  if (!step) return "none";
  const inputs = step.inputs || [];
  if (inputs.length === 0) return "button";
  if (inputs.length === 1) {
    const i = inputs[0];
    if (i.type === "text") return "text";          // bottom bar handles
    if (i.type === "radio" || i.type === "select") return "choices"; // chip buttons
    if (i.type === "checkbox") return "button";    // single-confirm = inline button
  }
  return "form"; // multi-input → inline form fallback
}

function renderActiveStepContent(step) {
  const mode = stepInputMode(step);
  const helpHtml = step.helpAvailable && step.helpHint
    ? `<button type="button" class="btn btn-link help-btn" data-action="prefill-help" data-prefill="${escapeHtml(step.helpHint)}">? Ask the assistant: ${escapeHtml(step.helpHint)}</button>`
    : "";

  if (mode === "button") {
    // Single button (or multiple) — synthesize formData (auto-true any required checkbox).
    const inputs = step.inputs || [];
    const actions = (step.actions || []).map((a, idx) => {
      const synth = inputs.reduce((acc, i) => {
        if (i.type === "checkbox" && i.required) acc[i.name] = "true";
        return acc;
      }, {});
      return `<button type="button" class="btn btn-primary chat-step-button" data-action="step-submit" data-form='${escapeHtml(JSON.stringify(synth))}' ${state.loading ? "disabled" : ""}>${escapeHtml(a.label)}</button>`;
    }).join("");
    return `<div class="chat-step-actions">${actions}${helpHtml}</div>`;
  }

  if (mode === "choices") {
    // Each option becomes a clickable bubble. Click → submit immediately.
    const input = step.inputs[0];
    const options = (input.options || []).map((o) => {
      const formData = { [input.name]: o.value };
      return `<button type="button" class="btn btn-choice chat-step-choice" data-action="step-submit" data-form='${escapeHtml(JSON.stringify(formData))}' ${state.loading ? "disabled" : ""}>${escapeHtml(o.label)}</button>`;
    }).join("");
    return `<div class="chat-step-choices">${options}</div>${helpHtml ? `<div class="chat-step-help">${helpHtml}</div>` : ""}`;
  }

  if (mode === "text") {
    const input = step.inputs[0];
    return `
      <div class="chat-step-text-hint">
        <span class="chat-step-text-arrow">↓</span>
        <span>Type your answer in the input below — <em>${escapeHtml(input.label)}</em>${input.suggested ? ` (try <code>${escapeHtml(input.suggested)}</code>)` : ""}</span>
      </div>
      ${helpHtml ? `<div class="chat-step-help">${helpHtml}</div>` : ""}
    `;
  }

  // mode === "form" — multi-input, inline form fallback
  return `
    <form class="chat-form-fields" id="activeStepForm">
      ${(step.inputs || []).map(renderInput).join("")}
      <div class="chat-form-actions">
        ${helpHtml}
        ${(step.actions || []).map((a) => `<button type="submit" class="btn btn-primary" data-kind="${escapeHtml(a.kind)}" ${state.loading ? "disabled" : ""}>${escapeHtml(a.label)}</button>`).join("")}
      </div>
    </form>
  `;
}

function renderResolvedSummary(msg) {
  if (!msg.userResponse) return "";
  return `<div class="chat-step-resolved">Your response: <strong>${escapeHtml(msg.userResponse)}</strong></div>`;
}

function renderInput(input) {
  const required = input.required ? "required" : "";
  if (input.type === "text") {
    return `
      <div class="form-input">
        <label>${escapeHtml(input.label)}</label>
        <input name="${escapeHtml(input.name)}" type="text" ${required} ${input.maxLength ? `maxlength="${input.maxLength}"` : ""} placeholder="${escapeHtml(input.placeholder || "")}" />
        ${input.suggested ? `<span class="form-input-hint">Try: <code>${escapeHtml(input.suggested)}</code></span>` : ""}
      </div>
    `;
  }
  if (input.type === "select") {
    return `
      <div class="form-input">
        <label>${escapeHtml(input.label)}</label>
        <select name="${escapeHtml(input.name)}" ${required}>
          <option value="">Select…</option>
          ${(input.options || []).map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("")}
        </select>
      </div>
    `;
  }
  if (input.type === "radio") {
    return `
      <div class="form-input">
        <label class="form-input-grouplabel">${escapeHtml(input.label)}</label>
        <div class="form-radio-group">
          ${(input.options || []).map((o) => `
            <label class="form-radio">
              <input type="radio" name="${escapeHtml(input.name)}" value="${escapeHtml(o.value)}" ${required} />
              <span>${escapeHtml(o.label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
  }
  if (input.type === "checkbox") {
    return `
      <div class="form-input">
        <label class="form-checkbox">
          <input type="checkbox" name="${escapeHtml(input.name)}" ${required} />
          <span>${escapeHtml(input.label)}</span>
        </label>
      </div>
    `;
  }
  return "";
}

/* ----- Orch pane (right side) ----- */
function renderOrchSections() {
  const bySection = {};
  for (const [k, v] of Object.entries(state.fields)) {
    const sec = FIELD_SECTIONS[k] || "Other";
    if (!bySection[sec]) bySection[sec] = {};
    bySection[sec][k] = v;
  }
  const sectionGroups = SECTION_ORDER
    .filter((sec) => bySection[sec])
    .map((sec) => renderFieldGroup(sec, bySection[sec]))
    .join("");
  const otherHtml = bySection["Other"] ? renderFieldGroup("Other", bySection["Other"]) : "";
  return `
    ${renderEstablishmentBanner()}
    ${renderProviderAttentionAlerts()}
    ${sectionGroups}
    ${otherHtml}
    ${renderEngineSection()}
    ${renderGatesSection()}
    ${renderAuditSection()}
  `;
}

function renderEstablishmentBanner() {
  const status = state.fields["inherited_ira_establishment_status"];
  if (!status) return "";
  const labels = {
    pending_provider_confirmation: "Awaiting provider confirmation (v1.27)",
    confirmed: "In good order — provider confirmed",
    pending_provider_confirmation_fallback_applied: "Confirmation timeout — fallback applied"
  };
  return `
    <div class="orch-section establishment-${status}">
      <h4 class="orch-section-title">Establishment lifecycle (5B / v1.27)</h4>
      <div class="state-row">
        <span class="state-key">inherited_ira_establishment_status</span>
        <span class="state-val">${escapeHtml(labels[status] || status)}</span>
      </div>
    </div>
  `;
}

function renderProviderAttentionAlerts() {
  const alerts = state.providerAttentionAlerts || [];
  if (!alerts.length) return "";
  return `
    <div class="orch-section provider-alerts-section">
      <h4 class="orch-section-title">Provider Attention Alerts (10B)</h4>
      <div class="alert-list">
        ${alerts.map((a) => `
          <div class="alert-item alert-${escapeHtml(a.alert_priority || "informational")}">
            <div class="alert-header"><span class="alert-type">${escapeHtml(a.alert_type)}</span> · <span class="alert-priority">${escapeHtml(a.alert_priority)}</span></div>
            <div class="alert-message">${escapeHtml(a.alert_message)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderFieldGroup(label, obj) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "";
  return `
    <div class="orch-section">
      <h4 class="orch-section-title">${escapeHtml(label)}</h4>
      <div class="state-grid">
        ${entries.map(([k, v]) => `
          <div class="state-row ${state.freshFields.has(k) ? "fresh" : ""}">
            <span class="state-key">${escapeHtml(k)}</span>
            <span class="state-val">${escapeHtml(String(v))}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEngineSection() {
  if (!state.engine) {
    return `
      <div class="orch-section">
        <h4 class="orch-section-title">Triage engine</h4>
        <div class="engine-empty">Engine not yet called.</div>
      </div>
    `;
  }
  const r = state.engine.result || {};
  if (!r.ok) {
    return `
      <div class="orch-section">
        <h4 class="orch-section-title">Triage engine</h4>
        <div class="engine-empty">Engine error: ${escapeHtml(r.error || "")} · ${escapeHtml(r.message || "")}</div>
      </div>
    `;
  }
  const out = r.output_package || {};
  return `
    <div class="orch-section">
      <h4 class="orch-section-title">Triage engine</h4>
      <div class="engine-output-list">
        ${Object.entries(out).map(([k, v]) => `<div class="engine-row"><span class="ek">${escapeHtml(k)}</span><span class="ev">${escapeHtml(JSON.stringify(v))}</span></div>`).join("")}
      </div>
    </div>
  `;
}

function renderGatesSection() {
  const visible = GATE_ORDER.filter((g) => state.gates.hasOwnProperty(g.id));
  if (!visible.length) return "";
  return `
    <div class="orch-section">
      <h4 class="orch-section-title">Workflow gates (5C)</h4>
      <div class="gate-list">
        ${visible.map((g) => `<div class="gate-item ${state.gates[g.id] === "passed" ? "passed" : ""}"><span class="gate-dot"></span><span>${escapeHtml(g.label)}</span></div>`).join("")}
      </div>
    </div>
  `;
}

function renderAuditSection() {
  return `
    <div class="orch-section">
      <h4 class="orch-section-title">Audit log</h4>
      <div class="audit-list">
        ${state.audit.length === 0
          ? `<div class="audit-empty">Empty.</div>`
          : state.audit.map((e) => `<div class="audit-entry"><div class="audit-time">${escapeHtml(e.time || "")}</div><div>${escapeHtml(e.text)}</div></div>`).join("")}
      </div>
    </div>
  `;
}

/* ----- Outro ----- */
function renderOutroOverlay() {
  const status = state.fields["inherited_ira_establishment_status"];
  const isPending = status === "pending_provider_confirmation";
  const isConfirmed = status === "confirmed";
  const isFallback = status === "pending_provider_confirmation_fallback_applied";
  const alertCount = (state.providerAttentionAlerts || []).length;
  const rows = [
    ["Persona", state.persona ? state.persona.name : ""],
    ["Provider", state.persona ? state.persona.provider : ""],
    ["End state", state.outroOutcome || ""],
    ["Establishment status", status || "n/a"],
    ["Audit entries", String(state.audit.length)],
    ["Provider alerts", String(alertCount)],
    ["Fields captured", String(Object.keys(state.fields).length)]
  ];
  let lifeNote = "";
  if (isPending) lifeNote = `<strong>Pending provider confirmation (v1.27).</strong> Click below to simulate the provider's acknowledgment, or simulate a timeout fallback.`;
  else if (isConfirmed) lifeNote = `<strong>In good order.</strong> Provider has confirmed the handoff package.`;
  else if (isFallback) lifeNote = `<strong>Timeout fallback applied.</strong> An establishment_confirmation_timeout alert was raised.`;
  return `
    <div class="outro-overlay">
      <div class="outro-card">
        <div class="outro-kicker">Walkthrough complete</div>
        <h2>What the provider receives</h2>
        <p>The handoff package — verifications, classification, election, withdrawal instructions, alerts, audit log — is transmitted to the provider.</p>
        <div class="outro-summary">
          ${rows.map(([k, v]) => `<div class="outro-summary-row"><span class="outro-summary-key">${escapeHtml(k)}</span><span class="outro-summary-val">${escapeHtml(v)}</span></div>`).join("")}
        </div>
        ${lifeNote ? `<div class="outro-lifecycle">${lifeNote}</div>` : ""}
        <div class="outro-actions">
          <button class="btn btn-ghost" data-action="view-handoff-package">View handoff package</button>
          ${isPending ? `<button class="btn btn-primary" data-action="provider-confirm">Simulate provider confirmation</button>` : ""}
          ${isPending ? `<button class="btn btn-ghost" data-action="simulate-timeout">Simulate timeout</button>` : ""}
          <button class="btn btn-ghost" data-action="go-intro">Back to intro</button>
          <button class="btn btn-primary" data-action="go-picker">Run another →</button>
        </div>
        ${state.handoffPackageOpen ? renderHandoffPackagePreview() : ""}
      </div>
    </div>
  `;
}

function renderHandoffPackagePreview() {
  const pkg = state.handoffPackage;
  if (!pkg) return `<div class="handoff-preview"><em>Loading…</em></div>`;
  return `
    <div class="handoff-preview">
      <div class="handoff-preview-header">
        <h3>Handoff Package — Section 10A</h3>
        <span class="handoff-preview-id">${escapeHtml(pkg.handoff_package_id)}</span>
        <button class="btn btn-ghost btn-small" data-action="close-handoff-package">Close</button>
      </div>
      <p class="handoff-preview-note">Structured artifact transmitted to the provider on session completion.</p>
      <pre class="handoff-preview-body">${escapeHtml(JSON.stringify(pkg, null, 2))}</pre>
    </div>
  `;
}

/* ----------------------------------------------------------------------
   ROUTER
   ---------------------------------------------------------------------- */
function render() {
  if (state.scene === "intro") return renderIntro();
  if (state.scene === "picker") return renderPicker();
  if (state.scene === "custom") return renderCustomBuilder();
  if (state.scene === "session") return renderSession();
}

/* ----------------------------------------------------------------------
   EVENTS
   ---------------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-action]");
  if (!t) return;
  const action = t.dataset.action;
  if (action === "go-intro") { state.scene = "intro"; state.outroOutcome = null; render(); return; }
  if (action === "go-picker") {
    state.scene = "picker"; state.outroOutcome = null; state.persona = null;
    if (state.personas.length === 0) loadPersonas().then(render);
    else render();
    return;
  }
  if (action === "pick-persona") {
    const id = t.dataset.personaId;
    if (id === "custom") { state.scene = "custom"; render(); return; }
    startPersona(id);
    return;
  }
  if (action === "open-custom") { state.scene = "custom"; render(); return; }
  if (action === "run-custom") {
    const spec = {
      beneficiaryName: document.getElementById("cb-bn").value,
      beneficiaryDob: document.getElementById("cb-bdob").value,
      ownerName: document.getElementById("cb-on").value,
      ownerDob: document.getElementById("cb-odob").value,
      ownerDod: document.getElementById("cb-odod").value,
      iraType: document.getElementById("cb-itype").value,
      iraBalance: document.getElementById("cb-bal").value,
      relationship: document.getElementById("cb-rel").value,
      isMinor: document.getElementById("cb-minor").checked,
      isTrustBeneficiary: document.getElementById("cb-trust").checked,
      isEntity: document.getElementById("cb-entity").checked,
      actorName: document.getElementById("cb-actor").value,
      enableWithdrawalFlow: document.getElementById("cb-withdraw").checked
    };
    state.customSpec = spec;
    startPersona("custom", spec);
    return;
  }
  if (action === "prefill-help") {
    const prefill = t.dataset.prefill;
    const inp = document.getElementById("chatBottomInput");
    if (inp) {
      inp.value = prefill || "";
      inp.focus();
    }
    return;
  }
  if (action === "step-submit") {
    // Click on a choice button or single-action button — formData is JSON-encoded in data-form
    if (state.loading) return;
    let formData = {};
    try { formData = t.dataset.form ? JSON.parse(t.dataset.form) : {}; } catch (e) { formData = {}; }
    submitStep(formData);
    return;
  }
  if (action === "bottom-answer") {
    if (state.loading) return;
    const inp = document.getElementById("chatBottomInput");
    if (!inp || !inp.value.trim()) return;
    const active = findActiveStepMsg();
    if (!active || stepInputMode(active.step) !== "text") return;
    const inputName = active.step.inputs[0].name;
    const v = inp.value;
    inp.value = "";
    submitStep({ [inputName]: v });
    return;
  }
  if (action === "bottom-ask") {
    const inp = document.getElementById("chatBottomInput");
    if (inp && inp.value.trim()) {
      const v = inp.value;
      inp.value = "";
      sendChatbotMessage(v);
    } else if (inp) {
      inp.focus();
    }
    return;
  }
  if (action === "provider-confirm") { confirmProvider(); return; }
  if (action === "simulate-timeout") { simulateTimeout(); return; }
  if (action === "view-handoff-package") { viewHandoffPackage(); return; }
  if (action === "close-handoff-package") { state.handoffPackageOpen = false; render(); return; }
});

/* ----------------------------------------------------------------------
   INIT
   ---------------------------------------------------------------------- */
async function init() {
  await Promise.all([loadHealth(), loadPersonas()]);
  render();
}

init();
