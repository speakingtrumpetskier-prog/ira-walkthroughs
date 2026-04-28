/* ======================================================================
   CONVERGENT v4 — Live agent + deterministic engine + separate chatbot
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

/* Schema section attribution — mirrors CANONICAL_FIELDS in tools.js.
   Used to organize the right-pane field display by v1.5 schema section. */
const FIELD_SECTIONS = {
  "session.provider": "1A · Session Identity",
  "session.status": "1B · Session Status",
  "session.escalated": "5D · Escalation",
  "session.escalation_reason": "5D · Escalation",
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
  "beneficiary.relationship": "4A · Classification",
  "beneficiary.type": "4A · Classification",
  "beneficiary.classification": "4D · Engine Input",
  "verification.identity": "3B · Verification",
  "verification.death_cert": "3B · Verification",
  "actor.name (Operator, 3D)": "3D · Session Actor",
  "actor.role": "3D · Session Actor",
  "actor.relationship_to_subject": "3D · Session Actor",
  "auth_rep_docs.uploaded": "4F · Authorized Rep",
  "selfcert.trust_status": "4B · Self-cert",
  "trust.q1": "4B · Self-cert",
  "trust.q2": "4B · Self-cert",
  "trust.q3": "4B · Self-cert",
  "trust.q4": "4B · Self-cert",
  "trust.name": "4G · Trust Identity",
  "edb.conversation_complete": "5D · EDB Conversation",
  "election.distribution_method": "6A · Election",
  "election.declined": "6A · Election",
  "spouse.path_chosen": "6A · Election",
  "trustee_responsibility_disclosure.acknowledged": "6C-ii · Trustee Disclosure",
  "yod_rmd.applicable": "6E · YOD RMD",
  "yod_rmd.disclosed": "6E · YOD RMD",
  "provider_attention_alerts": "10B · Provider Alerts",
  "case.reference": "10D · Handoff",
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
  "inherited_ira_establishment_status": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_pending_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_confirmed_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_rejected_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_fallback_applied_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_establishment_status_reason": "5B · Establishment Status (v1.27)",
  "inherited_ira_provider_confirmation_initiated_at": "5B · Establishment Status (v1.27)",
  "inherited_ira_provider_confirmation_confirmed_at": "5B · Establishment Status (v1.27)",
  "session_end_state": "5B · Session End State",
  "session_end_state_in_good_order": "5B · Session End State",

  // Section 1B/C — extended
  "unresponsive_flagged_at": "1B · Unresponsive",
  "unresponsive_ops_notified": "1B · Unresponsive",
  "expiry_deadline": "1C · Expiry",
  "expiry_deadline_overridden": "1C · Expiry",

  // Section 4F/G — extended
  "representative_role_type": "4F · Authorized Rep",
  "authorized_representative_doc_type": "4F · Authorized Rep",
  "authorized_representative_doc_status": "4F · Authorized Rep",
  "trust_date": "4G · Trust Identity",
  "trustee_type": "4G · Trust Identity",
  "corporate_trustee_entity_name": "4G · Trust Identity",
  "trust_provider_notified": "4G · Trust Identity",
  "trust_provider_notified_at": "4G · Trust Identity",

  // Section 5B — branch / fast-lane
  "branch_indicated": "5B · Branch State",
  "branch_confirmed": "5B · Branch State",
  "branch_locked": "5B · Branch State",

  // Section 5D — suspension / escalation
  "current_suspension_reason": "5D · Suspension",
  "ops_escalation_active": "5D · Escalation",
  "ops_escalation_reason": "5D · Escalation",

  // Section 6A/B — election extended
  "election_status": "6B · Election Status",
  "deferral_deadline_acknowledged": "6B · Election Status",

  // Section 6C-i — distribution requirements
  "distribution_requirements_presented": "6C-i · Distribution Reqs",
  "distribution_requirements_acknowledged": "6C-i · Distribution Reqs",
  "applicable_rule_communicated": "6C-i · Distribution Reqs",
  "separate_accounting_applicable": "6C-i · Separate Accounting",
  "separate_accounting_deadline": "6C-i · Separate Accounting",
  "separate_accounting_requirement_acknowledged": "6C-i · Separate Accounting",

  // Section 6C-ii — trustee responsibility (canonical-name variants)
  "trustee_responsibility_disclosure_applicable": "6C-ii · Trustee Disclosure",
  "trustee_responsibility_disclosure_presented": "6C-ii · Trustee Disclosure",
  "trustee_responsibility_disclosure_acknowledged": "6C-ii · Trustee Disclosure",
  "trustee_responsibility_disclosure_acknowledged_at": "6C-ii · Trustee Disclosure",

  // Section 6D — withdrawal decision
  "withdrawal_request_decision_applicable": "6D · Withdrawal Decision",
  "withdrawal_request_presented": "6D · Withdrawal Decision",
  "withdrawal_request_decision": "6D · Withdrawal Decision",

  // Section 6E — YOD RMD canonical cluster (v1.12)
  "yod_rmd_disclosure_applicable": "6E · YOD RMD",
  "yod_rmd_disclosure_presented": "6E · YOD RMD",
  "yod_rmd_disclosure_presented_at": "6E · YOD RMD",
  "yod_rmd_disclosure_content_ref": "6E · YOD RMD",
  "yod_rmd_disclosure_acknowledged": "6E · YOD RMD",
  "yod_rmd_disclosure_acknowledged_at": "6E · YOD RMD",

  // Section 6E — existing IRA instruction lifecycle (v1.27)
  "existing_ira_instruction_status": "6E · Existing IRA Instruction (v1.27)",
  "existing_ira_instruction_status_pending_at": "6E · Existing IRA Instruction (v1.27)",
  "existing_ira_instruction_status_confirmed_at": "6E · Existing IRA Instruction (v1.27)",
  "existing_ira_instruction_status_fallback_applied_at": "6E · Existing IRA Instruction (v1.27)",

  // Section 7 — e-sign
  "esign_all_complete": "7 · E-Sign",
  "esign_last_completed_at": "7 · E-Sign",

  // Section 9 — Withdrawal Request Detail
  "withdrawal_request_type": "9A · Withdrawal Identity",
  "withdrawal_request_id": "9A · Withdrawal Identity",
  "withdrawal_request_initiated_at": "9A · Withdrawal Identity",
  "withdrawal_path": "9A · Withdrawal Identity",
  "lumpsum_instruction": "9B · Lump Sum",
  "lumpsum_instruction_confirmed": "9B · Lump Sum",
  "onetime_amount_type": "9C · One-Time",
  "onetime_amount": "9C · One-Time",
  "onetime_amount_percentage": "9C · One-Time",
  "onetime_amount_confirmed": "9C · One-Time",
  "onetime_timing_preference": "9C · One-Time",
  "onetime_timing_preference_detail": "9C · One-Time",
  "standing_distribution_basis": "9D · Standing",
  "standing_fixed_amount": "9D · Standing",
  "standing_fixed_percentage": "9D · Standing",
  "standing_frequency": "9D · Standing",
  "standing_start_date": "9D · Standing",
  "standing_instruction_confirmed": "9D · Standing",
  "federal_withholding_election": "9E · Withholding",
  "federal_withholding_percentage": "9E · Withholding",
  "state_withholding_applicable": "9E · Withholding",
  "state_withholding_election": "9E · Withholding",
  "state_withholding_percentage": "9E · Withholding",
  "withdrawal_tax_disclosure_acknowledged": "9E · Withholding",
  "withholding_election_confirmed": "9E · Withholding",
  "withdrawal_esign_completed": "9F · Withdrawal Handoff",
  "withdrawal_instruction_handoff_included": "9F · Withdrawal Handoff",
  "custodian_notification_sent": "9F · Withdrawal Handoff",

  // Section 10A — Handoff Package
  "handoff_package_id": "10A · Handoff Package",
  "handoff_package_type": "10A · Handoff Package",
  "handoff_package_generated": "10A · Handoff Package",
  "handoff_package_generated_at": "10A · Handoff Package",
  "handoff_package_transmitted": "10A · Handoff Package",
  "handoff_package_transmitted_at": "10A · Handoff Package",
  "handoff_package_acknowledged": "10A · Handoff Package",
  "handoff_package_acknowledged_at": "10A · Handoff Package",

  // Section 10C — Outstanding Items
  "outstanding_items_exist": "10C · Outstanding Items",
  "outstanding_election_deferred": "10C · Outstanding Items",
  "outstanding_authorized_representative_docs": "10C · Outstanding Items",
  "outstanding_inherited_ira_establishment_confirmation": "10C · Outstanding Items",
  "outstanding_existing_ira_instruction_confirmation": "10C · Outstanding Items",

  // Section 10E — Closure
  "session_formally_closed": "10E · Session Closure",
  "session_formally_closed_at": "10E · Session Closure",
  "session_closure_initiated_by": "10E · Session Closure",
  "provider_record_of_authority_confirmed": "10E · Session Closure"
};

const SECTION_ORDER = [
  "1A · Session Identity",
  "1B · Session Status",
  "1B · Unresponsive",
  "1C · Expiry",
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
  "5B · Branch State",
  "5B · Session End State",
  "5B · Establishment Status (v1.27)",
  "5D · EDB Conversation",
  "5D · Suspension",
  "5D · Escalation",
  "6A · Election",
  "6B · Election Status",
  "6C-i · Distribution Reqs",
  "6C-i · Separate Accounting",
  "6C-ii · Trustee Disclosure",
  "6D · Withdrawal Decision",
  "6E · YOD RMD",
  "6E · Existing IRA Instruction (v1.27)",
  "7 · E-Sign",
  "9A · Withdrawal Identity",
  "9B · Lump Sum",
  "9C · One-Time",
  "9D · Standing",
  "9E · Withholding",
  "9F · Withdrawal Handoff",
  "10A · Handoff Package",
  "10B · Provider Alerts",
  "10C · Outstanding Items",
  "10D · Handoff",
  "10E · Session Closure"
];

const ENGINE_KEY_PREFIXES = ["engine."];

const state = {
  scene: "intro",
  personas: [],
  personaId: null,
  sessionId: null,
  persona: null,
  thread: [],
  fields: {},
  gates: {},
  audit: [],
  freshFields: new Set(),
  pendingChips: [],
  pendingUI: null,
  pendingTemplate: null,
  loading: false,
  outroOutcome: null,
  apiError: null,
  health: null,
  // engine state
  engineState: "idle", // idle | calling | complete
  engineInput: null,
  engineOutput: null,
  // chatbot
  chatbotOpen: false,
  chatbotSessionId: null,
  chatbotThread: [],
  chatbotLoading: false,
  // chatbot nudge
  chatbotNudge: null,
  // custom builder
  customSpec: defaultCustomSpec()
};

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
    explicitClassification: "",
    isDisabled: false,
    isChronicallyIll: false,
    isTrustBeneficiary: false,
    isEntity: false,
    enableWithdrawalFlow: false,
    withdrawalType: "one_time"
  };
}

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
async function apiAgentStart(personaId, customSpec) {
  const r = await fetch("/api/agent/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personaId, customSpec })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Start failed");
  }
  return r.json();
}
async function apiAgentChat(message) {
  const r = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.sessionId, message })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Chat failed");
  }
  return r.json();
}
async function apiChatbotChat(message) {
  const r = await fetch("/api/chatbot/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: state.chatbotSessionId, message })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error || "Chatbot failed");
  }
  return r.json();
}

/* ----------------------------------------------------------------------
   APPLY AGENT TURN RESULT
   ---------------------------------------------------------------------- */
function applyAgentResult(result) {
  if (result.text) state.thread.push({ role: "agent", text: result.text });

  state.freshFields = new Set();

  if (Array.isArray(result.events)) {
    for (const ev of result.events) {
      if (ev.type === "state_update") {
        state.fields[ev.path] = ev.value;
        state.freshFields.add(ev.path);
      } else if (ev.type === "gate_pass") {
        state.gates[ev.gate_id] = "passed";
      } else if (ev.type === "audit_add") {
        state.audit.unshift({ time: ev.time, text: ev.text });
      } else if (ev.type === "engine_call") {
        state.engineState = "complete";
        state.engineInput = ev.input;
        state.engineOutput = ev.result;
      } else if (ev.type === "ops_escalation") {
        state.audit.unshift({
          time: nowStamp(),
          text: `OPS ESCALATION — ${ev.reason}${ev.case_ref ? ` (${ev.case_ref})` : ""}`
        });
      } else if (ev.type === "suggest_chatbot") {
        state.chatbotNudge = ev.topic;
      } else if (ev.type === "alert_appended") {
        if (!state.providerAttentionAlerts) state.providerAttentionAlerts = [];
        if (ev.alert) state.providerAttentionAlerts.push(ev.alert);
      } else if (ev.type === "handoff_package_generated") {
        // package_id flows through state_update events; full package fetched on demand
      }
    }
  }

  if (Array.isArray(result.providerAttentionAlerts) && result.providerAttentionAlerts.length) {
    state.providerAttentionAlerts = result.providerAttentionAlerts.slice();
  }
  if (result.handoffPackage) state.handoffPackage = result.handoffPackage;

  state.pendingChips = result.chips || [];
  state.pendingUI = result.pendingUI || null;

  if (result.completed) {
    state.outroOutcome = result.endState;
  }

  setTimeout(() => {
    state.freshFields = new Set();
    if (state.scene === "sim") renderState();
  }, 1600);
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/* ----------------------------------------------------------------------
   ACTIONS
   ---------------------------------------------------------------------- */
async function startPersona(personaId, customSpec) {
  state.personaId = personaId;
  state.thread = [];
  state.fields = {};
  state.gates = {};
  state.audit = [];
  state.pendingUI = null;
  state.providerAttentionAlerts = [];
  state.handoffPackage = null;
  state.handoffPackageOpen = false;
  state.pendingChips = [];
  state.outroOutcome = null;
  state.apiError = null;
  state.engineState = "idle";
  state.engineInput = null;
  state.engineOutput = null;
  state.chatbotNudge = null;
  // Pre-populate persona from picker list so renderSim has something to show
  // while we wait for the server's full payload.
  const fromList = state.personas.find((p) => p.id === personaId);
  state.persona = fromList || { id: personaId, name: "Loading…", initials: "..", provider: "", sessionRef: "" };
  state.scene = "sim";
  state.loading = true;
  render();

  try {
    const res = await apiAgentStart(personaId, customSpec);
    state.sessionId = res.sessionId;
    state.persona = res.persona;
    if (res.state) {
      Object.assign(state.fields, res.state.fields || {});
      Object.assign(state.gates, res.state.gates || {});
      if (Array.isArray(res.state.audit)) {
        state.audit = res.state.audit.slice();
      }
    }
    applyAgentResult(res);
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
    const res = await apiAgentChat(text.trim());
    applyAgentResult(res);
  } catch (e) {
    state.apiError = e.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function confirmKba(answer) {
  await sendUserMessage(answer);
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
async function ackTemplate() {
  const ui = state.pendingUI;
  if (!ui || ui.type !== "template") return;
  await sendUserMessage(`[Acknowledged: ${ui.title}]`);
}

async function confirmProviderEstablishment() {
  if (!state.sessionId) return;
  try {
    const r = await fetch("/api/agent/provider-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId })
    });
    const data = await r.json();
    if (data.events) {
      for (const ev of data.events) {
        if (ev.type === "state_update") state.fields[ev.path] = ev.value;
        if (ev.type === "audit_add") state.audit.unshift({ time: ev.time, text: ev.text });
      }
    }
    if (Array.isArray(data.providerAttentionAlerts)) state.providerAttentionAlerts = data.providerAttentionAlerts.slice();
    render();
  } catch (e) {
    state.apiError = e.message;
    render();
  }
}

async function simulateProviderTimeout() {
  if (!state.sessionId) return;
  try {
    const r = await fetch("/api/agent/simulate-timeout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: state.sessionId })
    });
    const data = await r.json();
    if (data.events) {
      for (const ev of data.events) {
        if (ev.type === "state_update") state.fields[ev.path] = ev.value;
        if (ev.type === "audit_add") state.audit.unshift({ time: ev.time, text: ev.text });
      }
    }
    if (Array.isArray(data.providerAttentionAlerts)) state.providerAttentionAlerts = data.providerAttentionAlerts.slice();
    render();
  } catch (e) {
    state.apiError = e.message;
    render();
  }
}

async function viewHandoffPackage() {
  if (!state.sessionId) return;
  state.handoffPackageOpen = true;
  if (!state.handoffPackage) {
    try {
      const r = await fetch(`/api/agent/handoff-package?sessionId=${encodeURIComponent(state.sessionId)}`);
      const data = await r.json();
      if (data.handoffPackage) state.handoffPackage = data.handoffPackage;
    } catch (e) {
      state.apiError = e.message;
    }
  }
  render();
}

async function openChatbot() {
  state.chatbotOpen = true;
  state.chatbotNudge = null;
  if (!state.chatbotSessionId) {
    try {
      const r = await fetch("/api/chatbot/start", { method: "POST" });
      const data = await r.json();
      state.chatbotSessionId = data.sessionId;
    } catch (e) { /* fall through */ }
  }
  render();
}
function closeChatbot() {
  state.chatbotOpen = false;
  render();
}
async function sendChatbotMessage(text) {
  if (!text || !text.trim() || state.chatbotLoading) return;
  state.chatbotThread.push({ role: "user", text: text.trim() });
  state.chatbotLoading = true;
  renderChatbotPanel();
  try {
    const res = await apiChatbotChat(text.trim());
    if (res.sessionId) state.chatbotSessionId = res.sessionId;
    state.chatbotThread.push({ role: "bot", text: res.text || "(no response)" });
  } catch (e) {
    state.chatbotThread.push({ role: "bot", text: `Error: ${e.message}` });
  } finally {
    state.chatbotLoading = false;
    renderChatbotPanel();
  }
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
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
          <div class="intro-meta">v4 — Agent + Engine + Chatbot</div>
          ${keyOk
            ? `<span class="mode-pill">Live · ${state.health.model}</span>`
            : `<span class="mode-pill" style="background: rgba(177, 79, 60, 0.10); color: var(--danger);">API key missing</span>`}
        </div>
      </header>

      <div class="intro-hero">
        <h1>Agent in a cage,<br>engine outside the cage.</h1>
        <p class="lede">
          The conversational agent gathers data and routes the conversation. The orchestrator validates and writes
          to a canonical record. The deterministic triage engine — separate from the agent — classifies the
          beneficiary, sets the rule, and computes deadlines. The agent reports the engine's output; it does not
          derive it. A separate help assistant runs alongside, advisory only, with no access to your record.
        </p>
      </div>

      <div class="intro-grid">
        <div>
          <h3>What's new in v4</h3>
          <p><strong>Triage engine as deterministic JS.</strong> Encoded directly from the v1.5 schema — classification landscape, cohort-aware RBD, age-gap qualification, deadline formulas. The agent calls it; the engine returns; no inference happens in chat.</p>
          <p><strong>Two LLM surfaces.</strong> Agent and chatbot are separate Claude sessions with separate system prompts. The chatbot can't read your session state and never will.</p>
          <p><strong>Subject vs Actor.</strong> Minor / authorized-rep / trustee sessions distinguish operator from beneficiary in the right pane.</p>
          <p><strong>Track 3 unified path.</strong> Trust beneficiaries no longer escalate to ops — they flow through Track 3, get a trustee responsibility disclosure, and the IRA is established with a provider-attention flag.</p>
        </div>
        <div>
          <h3>How to drive it</h3>
          <p>Pick a beneficiary. Suggested-reply chips are the happy path; the text input lets you stress-test. Click <em>Help & rules</em> in the bottom-right to talk to the chatbot — it's a separate session, advisory only.</p>
          <p><strong>Watch for the engine moment.</strong> The right pane shows the input package building up; when complete, the engine fires and its output flows back into session state.</p>
        </div>
      </div>

      ${!keyOk ? `<div class="error-banner">The server can't find ANTHROPIC_API_KEY in .env. Set it and restart.</div>` : ""}

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
          <p>Three real cases — each shows a different track. Or build a custom scenario to stress-test the engine.</p>
        </div>
        ${brandLockup()}
      </header>

      <div class="persona-grid">
        ${state.personas
          .map((p) => `
            <button class="persona-card ${p.id === "custom" ? "custom-style" : ""}" data-action="${p.id === "custom" ? "open-custom" : "pick"}" data-persona="${p.id}">
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
          `)
          .join("")}
      </div>

      <div style="margin-top: 28px;">
        <button class="btn-link" data-action="go-intro">← Back to intro</button>
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
          <p>Set the inputs the provider would seed. The engine routes the case based on these.</p>
        </div>
        ${brandLockup()}
      </header>

      <div class="custom-builder-card">
        <h3>Provider-seeded inputs</h3>
        <p>The agent will run a session with these as the starting context. Identity-verification answer is "1234" for any custom session.</p>
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
              <option value="spouse" ${c.relationship === "spouse" ? "selected" : ""}>Spouse</option>
              <option value="child" ${c.relationship === "child" ? "selected" : ""}>Child</option>
              <option value="grandchild" ${c.relationship === "grandchild" ? "selected" : ""}>Grandchild</option>
              <option value="sibling" ${c.relationship === "sibling" ? "selected" : ""}>Sibling</option>
              <option value="parent" ${c.relationship === "parent" ? "selected" : ""}>Parent</option>
              <option value="other_relative" ${c.relationship === "other_relative" ? "selected" : ""}>Other relative</option>
              <option value="non_relative" ${c.relationship === "non_relative" ? "selected" : ""}>Non-relative</option>
              <option value="trust" ${c.relationship === "trust" ? "selected" : ""}>Trust</option>
            </select>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox">
              <input type="checkbox" id="cb-minor" ${c.isMinor ? "checked" : ""} />
              Beneficiary is a minor (parent/auth-rep operates session)
            </label>
          </div>
          <div class="custom-field">
            <label>Actor (operator) name — leave blank if same as beneficiary</label>
            <input id="cb-actor" value="${escapeHtml(c.actorName || "")}" />
          </div>
        </div>

        <h3 style="margin-top: 24px;">Edge-case toggles (optional)</h3>
        <p>Override the inferred classification or force specific paths. Useful for stress-testing the engine on cases the inference logic doesn't naturally produce.</p>
        <div class="custom-grid">
          <div class="custom-field">
            <label>Explicit classification override (engine input)</label>
            <select id="cb-explicit">
              <option value="" ${c.explicitClassification === "" ? "selected" : ""}>(none — infer from inputs)</option>
              <option value="spouse" ${c.explicitClassification === "spouse" ? "selected" : ""}>spouse</option>
              <option value="edb_minor_child" ${c.explicitClassification === "edb_minor_child" ? "selected" : ""}>edb_minor_child</option>
              <option value="edb_age_gap" ${c.explicitClassification === "edb_age_gap" ? "selected" : ""}>edb_age_gap</option>
              <option value="edb_disabled" ${c.explicitClassification === "edb_disabled" ? "selected" : ""}>edb_disabled</option>
              <option value="edb_chronic_illness" ${c.explicitClassification === "edb_chronic_illness" ? "selected" : ""}>edb_chronic_illness</option>
              <option value="non_edb_person" ${c.explicitClassification === "non_edb_person" ? "selected" : ""}>non_edb_person</option>
              <option value="non_edb_nonperson" ${c.explicitClassification === "non_edb_nonperson" ? "selected" : ""}>non_edb_nonperson</option>
              <option value="qualified_see_through_trust" ${c.explicitClassification === "qualified_see_through_trust" ? "selected" : ""}>qualified_see_through_trust</option>
            </select>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox">
              <input type="checkbox" id="cb-disabled" ${c.isDisabled ? "checked" : ""} />
              Beneficiary qualifies as disabled (EDB)
            </label>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox">
              <input type="checkbox" id="cb-chronic" ${c.isChronicallyIll ? "checked" : ""} />
              Beneficiary qualifies as chronically ill (EDB)
            </label>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox">
              <input type="checkbox" id="cb-trust" ${c.isTrustBeneficiary ? "checked" : ""} />
              Trust beneficiary (Track 3 QST)
            </label>
          </div>
          <div class="custom-field">
            <label class="custom-checkbox">
              <input type="checkbox" id="cb-entity" ${c.isEntity ? "checked" : ""} />
              Entity (estate / charity / corporation — non-EDB non-person)
            </label>
          </div>
        </div>

        <h3 style="margin-top: 24px;">Withdrawal flow (Section 9)</h3>
        <p>Demonstrate the withdrawal request flow at the end of the session. Useful for testing Section 9 — withdrawal request detail.</p>
        <div class="custom-grid">
          <div class="custom-field">
            <label class="custom-checkbox">
              <input type="checkbox" id="cb-withdraw" ${c.enableWithdrawalFlow ? "checked" : ""} />
              Demo withdrawal flow after election
            </label>
          </div>
          <div class="custom-field">
            <label>Withdrawal type (when enabled)</label>
            <select id="cb-wdtype">
              <option value="lump_sum" ${c.withdrawalType === "lump_sum" ? "selected" : ""}>Lump sum (full account)</option>
              <option value="one_time" ${c.withdrawalType === "one_time" ? "selected" : ""}>One-time (specific amount)</option>
              <option value="standing" ${c.withdrawalType === "standing" ? "selected" : ""}>Standing (recurring)</option>
            </select>
          </div>
        </div>

        <div class="custom-actions">
          <button class="btn btn-ghost" data-action="go-picker">Cancel</button>
          <button class="btn btn-primary" data-action="run-custom">Run with these inputs →</button>
        </div>
      </div>
    </section>
  `;
}

function renderSim() {
  if (!state.persona) {
    state.scene = "picker";
    render();
    return;
  }
  const p = state.persona;
  root.innerHTML = `
    <section class="sim-scene">
      <header class="sim-header">
        <div class="sim-header-left">
          <div class="persona-avatar">${p.initials}</div>
          <div>
            <h2>${escapeHtml(p.name)}</h2>
            <div class="subline">${escapeHtml(p.sessionRef)} · ${escapeHtml(p.provider)} · ${escapeHtml(p.laneHint || "")}</div>
          </div>
        </div>
        <div>${state.health && state.health.keyAvailable ? `<span class="mode-pill">Live · ${state.health.model}</span>` : ""}</div>
        <div><button class="btn-link" data-action="go-picker">↺ Pick another</button></div>
      </header>

      <div class="sim-body">
        <div class="chat-pane">
          <div class="chat-meta">Conversational agent</div>
          <div class="chat-thread" id="chatThread"></div>
          <div class="chat-actions" id="chatActions"></div>
        </div>

        <div class="orch-pane">
          <div class="orch-meta">
            <div class="orch-meta-label">Behind the glass</div>
            <div class="orch-meta-title">Orchestrator · Engine · State · Audit</div>
          </div>
          <div class="orch-sections" id="orchSections"></div>
        </div>
      </div>

      ${state.outroOutcome ? renderOutroOverlay() : ""}
      ${state.loading ? `<div class="loading-overlay show"><div class="loading-spinner"></div></div>` : ""}

      ${renderChatbotWidget()}
    </section>
  `;
  renderThread();
  renderActions();
  renderOrchSections();
  if (state.chatbotOpen) renderChatbotPanel();
}

function renderThread() {
  const el = document.getElementById("chatThread");
  if (!el) return;
  const bubbles = state.thread.map((m) => `<div class="chat-bubble ${m.role}">${formatMessage(m.text)}</div>`).join("");
  const typing = state.loading ? `<div class="typing-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>` : "";
  el.innerHTML = bubbles + typing;
  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
}

function renderActions() {
  const el = document.getElementById("chatActions");
  if (!el) return;
  if (state.outroOutcome) { el.innerHTML = ""; return; }

  let errorHtml = state.apiError ? `<div class="error-banner">${escapeHtml(state.apiError)}</div>` : "";
  let nudgeHtml = "";
  if (state.chatbotNudge) {
    nudgeHtml = `
      <div class="chatbot-nudge">
        <span>The agent suggested asking the help assistant about: <strong>${escapeHtml(state.chatbotNudge)}</strong></span>
        <button data-action="open-chatbot">Open</button>
      </div>
    `;
  }

  if (state.pendingUI && state.pendingUI.type === "kba") {
    el.innerHTML = `
      ${errorHtml}${nudgeHtml}
      <div class="esign-mock">
        <div class="chat-prompt">${escapeHtml(state.pendingUI.prompt || "Identity verification")}</div>
        <div class="input-row">
          <input class="text-input" id="kbaInput" placeholder="Type your answer…" ${state.loading ? "disabled" : ""}/>
          <button class="send-button" data-action="kba-submit" ${state.loading ? "disabled" : ""}>Submit</button>
        </div>
      </div>
    `;
    const input = document.getElementById("kbaInput");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmKba(input.value);
        }
      });
      if (!state.loading) input.focus();
    }
    return;
  }

  if (state.pendingUI && state.pendingUI.type === "upload") {
    const ui = state.pendingUI;
    el.innerHTML = `
      ${errorHtml}${nudgeHtml}
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
      ${errorHtml}${nudgeHtml}
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

  if (state.pendingUI && state.pendingUI.type === "template") {
    const ui = state.pendingUI;
    el.innerHTML = `
      ${errorHtml}${nudgeHtml}
      <div class="template-mock">
        <div class="template-tag">Template · ${escapeHtml(ui.template_id || "")}</div>
        <div class="template-title">${escapeHtml(ui.title || "")}</div>
        <div class="template-body">${escapeHtml(ui.body || "")}</div>
        ${ui.bullets && ui.bullets.length ? `<ul class="template-bullets">${ui.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>` : ""}
        <div class="continue-row">
          <button class="btn btn-primary" data-action="template-ack" ${state.loading ? "disabled" : ""}>Acknowledge</button>
        </div>
      </div>
    `;
    return;
  }

  // Default: chips + free text
  const chipsHtml = (state.pendingChips || []).length > 0
    ? `<div class="suggestion-row">
         <span class="suggestion-label">Try</span>
         ${state.pendingChips.map((label) => `<button class="suggestion-chip" data-action="chip" data-label="${escapeHtml(label)}">${escapeHtml(label)}</button>`).join("")}
       </div>`
    : "";
  el.innerHTML = `
    ${errorHtml}${nudgeHtml}${chipsHtml}
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
        if (input.value.trim()) sendUserMessage(input.value);
      }
    });
    if (!state.loading) input.focus();
  }
}

/* Right pane sections — organized by v1.5 schema section */
function renderOrchSections() {
  const el = document.getElementById("orchSections");
  if (!el) return;

  // Bucket fields by schema section
  const bySection = {};
  const unsectioned = {};
  for (const [k, v] of Object.entries(state.fields)) {
    const sec = FIELD_SECTIONS[k];
    if (sec) {
      if (!bySection[sec]) bySection[sec] = {};
      bySection[sec][k] = v;
    } else {
      unsectioned[k] = v;
    }
  }

  // Render in canonical section order
  const sectionGroups = SECTION_ORDER
    .filter((sec) => bySection[sec])
    .map((sec) => renderFieldGroup(sec, bySection[sec], sec.includes("Engine Output") || sec.includes("Computed RBD") ? "engine" : ""))
    .join("");

  const unsectionedHtml = Object.keys(unsectioned).length
    ? renderFieldGroup("(unregistered — would be rejected in production)", unsectioned, "")
    : "";

  el.innerHTML = `
    ${renderEstablishmentBanner()}
    ${renderProviderAttentionAlerts()}
    ${sectionGroups}
    ${unsectionedHtml}
    ${renderEngineSection()}
    ${renderGatesSection()}
    ${renderAuditSection()}
  `;
}

function renderProviderAttentionAlerts() {
  const alerts = state.providerAttentionAlerts || [];
  if (!alerts.length) return "";
  return `
    <div class="orch-section provider-alerts-section">
      <h4 class="orch-section-title">Provider Attention Alerts (Section 10B · typed array)</h4>
      <div class="alert-list">
        ${alerts.map((a) => `
          <div class="alert-item alert-${escapeHtml(a.alert_priority || "informational")}">
            <div class="alert-header">
              <span class="alert-type">${escapeHtml(a.alert_type)}</span>
              <span class="alert-priority">${escapeHtml(a.alert_priority || "")}</span>
            </div>
            <div class="alert-message">${escapeHtml(a.alert_message || "")}</div>
            <div class="alert-meta">${escapeHtml(a.alert_id || "")} · ${escapeHtml((a.alert_raised_at || "").slice(0, 19))}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEstablishmentBanner() {
  const status = state.fields["inherited_ira_establishment_status"];
  if (!status) return "";
  const label = {
    pending_provider_confirmation: "Awaiting provider confirmation (v1.27)",
    confirmed: "In good order — provider confirmed",
    pending_provider_confirmation_fallback_applied: "Confirmation timeout — fallback applied"
  }[status] || status;
  const cls = status === "confirmed" ? "establishment-confirmed" : "establishment-pending";
  return `
    <div class="orch-section ${cls}">
      <h4 class="orch-section-title">Establishment lifecycle (Schema 5B / v1.27)</h4>
      <div class="state-row">
        <span class="state-key">inherited_ira_establishment_status</span>
        <span class="state-val">${escapeHtml(label)}</span>
      </div>
    </div>
  `;
}

function renderFieldGroup(label, obj, rowClass) {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return `<div class="orch-section"><h4 class="orch-section-title">${label}</h4><div class="state-empty">(none yet)</div></div>`;
  }
  return `
    <div class="orch-section">
      <h4 class="orch-section-title">${label}</h4>
      <div class="state-grid">
        ${entries.map(([k, v]) => `
          <div class="state-row ${rowClass} ${state.freshFields.has(k) ? "fresh" : ""}">
            <span class="state-key">${escapeHtml(k)}</span>
            <span class="state-val">${escapeHtml(String(v))}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEngineSection() {
  const status = state.engineState;
  const cls = status === "complete" ? "complete" : (status === "calling" ? "calling" : "idle");
  const pillCls = cls;
  const pillText = status === "complete" ? "Complete" : (status === "calling" ? "Calling…" : "Idle");

  let inputHtml = "";
  let outputHtml = "";
  if (state.engineInput) {
    inputHtml = `
      <h5>Input package</h5>
      <div class="engine-input-list">
        ${Object.entries(state.engineInput).map(([k, v]) => `<div class="engine-row"><span class="ek">${escapeHtml(k)}</span><span class="ev">${escapeHtml(String(v))}</span></div>`).join("")}
      </div>
    `;
  }
  if (state.engineOutput && state.engineOutput.ok) {
    const out = state.engineOutput.output_package;
    outputHtml = `
      <h5>Output package</h5>
      <div class="engine-output-list">
        ${Object.entries(out).map(([k, v]) => `<div class="engine-row"><span class="ek">${escapeHtml(k)}</span><span class="ev">${escapeHtml(JSON.stringify(v))}</span></div>`).join("")}
      </div>
    `;
  } else if (state.engineOutput && !state.engineOutput.ok) {
    outputHtml = `
      <h5>Output</h5>
      <div class="engine-empty">Error: ${escapeHtml(state.engineOutput.error || "unknown")}: ${escapeHtml(state.engineOutput.message || "")}</div>
    `;
  }

  return `
    <div class="orch-section">
      <h4 class="orch-section-title">Triage Engine (deterministic)</h4>
      <div class="engine-section ${cls}">
        <div class="engine-title">
          <span>Triage Engine · v1.5 schema</span>
          <span class="engine-status-pill ${pillCls}">${pillText}</span>
        </div>
        ${inputHtml || `<div class="engine-empty">Awaiting 5-field input package…</div>`}
        ${outputHtml}
      </div>
    </div>
  `;
}

function renderGatesSection() {
  const visible = GATE_ORDER.filter((g) => state.gates.hasOwnProperty(g.id));
  if (visible.length === 0) return "";
  return `
    <div class="orch-section">
      <h4 class="orch-section-title">Workflow gates</h4>
      <div class="gate-list">
        ${visible.map((g) => {
          const status = state.gates[g.id];
          return `
            <div class="gate-item ${status === "passed" ? "passed" : ""} ${status === "flagged" ? "flagged" : ""}">
              <span class="gate-dot"></span>
              <span>${g.label}</span>
            </div>
          `;
        }).join("")}
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
          ? `<div class="audit-empty">Audit entries stream in as actions are taken…</div>`
          : state.audit.map((e) => `
            <div class="audit-entry">
              <div class="audit-time">${escapeHtml(e.time || "")}</div>
              <div>${escapeHtml(e.text)}</div>
            </div>
          `).join("")}
      </div>
    </div>
  `;
}

function renderState() { renderOrchSections(); }

/* ----------------------------------------------------------------------
   CHATBOT WIDGET
   ---------------------------------------------------------------------- */
function renderChatbotWidget() {
  if (state.chatbotOpen) {
    return `<div class="chatbot-widget" id="chatbotWidget"></div>`;
  }
  return `
    <div class="chatbot-widget">
      <button class="chatbot-launcher" data-action="open-chatbot">Help &amp; rules</button>
    </div>
  `;
}

function renderChatbotPanel() {
  const widget = document.getElementById("chatbotWidget");
  if (!widget && !state.chatbotOpen) return;

  const html = state.chatbotOpen ? `
    <div class="chatbot-panel">
      <div class="chatbot-header">
        <div>
          <div class="chatbot-header-title">Help &amp; rules</div>
          <div class="chatbot-header-sub">Advisory · separate session · no record access</div>
        </div>
        <button class="chatbot-close" data-action="close-chatbot">×</button>
      </div>
      <div class="chatbot-banner">In production, this is where Convergent's beneficiary chatbot plugs in. Cannot read your session state.</div>
      <div class="chatbot-thread" id="chatbotThread">
        ${state.chatbotThread.length === 0
          ? `<div class="chatbot-bubble bot">Ask me anything about the inherited IRA rules — what an EDB is, how the 10-year rule works, what an RBD is. I can't see your session, so I'll keep my answers general.</div>`
          : state.chatbotThread.map((m) => `<div class="chatbot-bubble ${m.role}">${formatMessage(m.text)}</div>`).join("")}
        ${state.chatbotLoading ? `<div class="typing-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>` : ""}
      </div>
      <div class="chatbot-actions">
        <input class="chatbot-input" id="chatbotInput" placeholder="Ask a rules question…" ${state.chatbotLoading ? "disabled" : ""} />
        <button class="chatbot-send" data-action="chatbot-send" ${state.chatbotLoading ? "disabled" : ""}>Send</button>
      </div>
    </div>
  ` : "";

  if (widget) widget.innerHTML = html;

  const thread = document.getElementById("chatbotThread");
  if (thread) requestAnimationFrame(() => { thread.scrollTop = thread.scrollHeight; });

  const input = document.getElementById("chatbotInput");
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (input.value.trim()) {
          const v = input.value;
          input.value = "";
          sendChatbotMessage(v);
        }
      }
    });
    if (!state.chatbotLoading) input.focus();
  }
}

/* ----------------------------------------------------------------------
   OUTRO
   ---------------------------------------------------------------------- */
function renderOutroOverlay() {
  const p = state.persona;
  const establishmentStatus = state.fields["inherited_ira_establishment_status"];
  const isPending = establishmentStatus === "pending_provider_confirmation";
  const isConfirmed = establishmentStatus === "confirmed";

  const rows = [
    ["Persona", p ? p.name : ""],
    ["Provider", p ? p.provider : ""],
    ["End state", state.outroOutcome || ""],
    ["Establishment status", establishmentStatus || "n/a"],
    ["Audit entries", String(state.audit.length)],
    ["Captured fields", String(Object.keys(state.fields).length)],
    ["Engine called", state.engineOutput ? "Yes" : "No"]
  ];

  const lifecycleNote = establishmentStatus
    ? `<div class="outro-lifecycle ${isPending ? "pending" : (isConfirmed ? "confirmed" : "")}">
         ${isPending
           ? `<strong>Pending provider confirmation (Schema v1.27).</strong> The handoff package has been transmitted; "in good order" status awaits the provider's acknowledgment. In production this is a callback from the provider's systems; for the prototype, click below to simulate.`
           : isConfirmed
             ? `<strong>In good order.</strong> The provider has acknowledged the handoff package. The case is now formally complete per Schema v1.27.`
             : ""}
       </div>`
    : "";

  const isFallback = establishmentStatus === "pending_provider_confirmation_fallback_applied";
  const alertCount = (state.providerAttentionAlerts || []).length;

  return `
    <div class="outro-overlay">
      <div class="outro-card">
        <div class="outro-kicker">Walkthrough complete</div>
        <h2>What the provider receives</h2>
        <p>The handoff package — verifications, classification, election, documents, e-signatures, withdrawal instructions, provider attention alerts, and full audit log — is transmitted to ${p ? escapeHtml(p.provider) : "the provider"}. The provider remains the record of authority.</p>
        <div class="outro-summary">
          ${rows.map(([k, v]) => `
            <div class="outro-summary-row">
              <span class="outro-summary-key">${escapeHtml(k)}</span>
              <span class="outro-summary-val">${escapeHtml(v)}</span>
            </div>
          `).join("")}
          ${alertCount ? `<div class="outro-summary-row"><span class="outro-summary-key">Provider alerts</span><span class="outro-summary-val">${alertCount}</span></div>` : ""}
        </div>
        ${lifecycleNote}
        ${isFallback ? `<div class="outro-lifecycle fallback"><strong>Confirmation timeout fallback applied (Schema v1.27).</strong> Grace period elapsed without provider acknowledgment. Corrective package re-pushed; an <code>establishment_confirmation_timeout</code> alert has been raised on the provider attention channel. The case awaits manual resolution by provider ops.</div>` : ""}
        <div class="outro-actions">
          <button class="btn btn-ghost" data-action="view-handoff-package">View handoff package</button>
          ${isPending ? `<button class="btn btn-primary" data-action="provider-confirm">Simulate provider confirmation</button>` : ""}
          ${isPending ? `<button class="btn btn-ghost" data-action="simulate-timeout">Simulate timeout fallback</button>` : ""}
          <button class="btn btn-ghost" data-action="go-intro">Back to intro</button>
          <button class="btn btn-primary" data-action="go-picker">Walk through another →</button>
        </div>
        ${state.handoffPackageOpen ? renderHandoffPackagePreview() : ""}
      </div>
    </div>
  `;
}

function renderHandoffPackagePreview() {
  const pkg = state.handoffPackage;
  if (!pkg) return `<div class="handoff-preview"><em>Loading handoff package…</em></div>`;
  return `
    <div class="handoff-preview">
      <div class="handoff-preview-header">
        <h3>Handoff Package — Section 10A</h3>
        <span class="handoff-preview-id">${escapeHtml(pkg.handoff_package_id || "")}</span>
        <button class="btn btn-ghost btn-small" data-action="close-handoff-package">Close</button>
      </div>
      <p class="handoff-preview-note">Structured artifact transmitted to the provider on session completion. In production this is JSON over webhook (or PDF) per the schema's transmission semantics.</p>
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
  if (state.scene === "sim") return renderSim();
}

/* ----------------------------------------------------------------------
   EVENT DELEGATION
   ---------------------------------------------------------------------- */
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "go-intro") { state.scene = "intro"; state.outroOutcome = null; state.pendingUI = null; render(); return; }
  if (action === "go-picker") { state.scene = "picker"; state.outroOutcome = null; state.pendingUI = null; render(); return; }
  if (action === "provider-confirm") { confirmProviderEstablishment(); return; }
  if (action === "simulate-timeout") { simulateProviderTimeout(); return; }
  if (action === "view-handoff-package") { viewHandoffPackage(); return; }
  if (action === "close-handoff-package") { state.handoffPackageOpen = false; render(); return; }
  if (action === "open-custom") { state.scene = "custom"; render(); return; }
  if (action === "run-custom") {
    const getVal = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const getCheck = (id) => { const el = document.getElementById(id); return el ? el.checked : false; };
    const spec = {
      beneficiaryName: getVal("cb-bn"),
      beneficiaryDob: getVal("cb-bdob"),
      ownerName: getVal("cb-on"),
      ownerDob: getVal("cb-odob"),
      ownerDod: getVal("cb-odod"),
      iraType: getVal("cb-itype"),
      iraBalance: getVal("cb-bal"),
      relationship: getVal("cb-rel"),
      isMinor: getCheck("cb-minor"),
      actorName: getVal("cb-actor"),
      explicitClassification: getVal("cb-explicit"),
      isDisabled: getCheck("cb-disabled"),
      isChronicallyIll: getCheck("cb-chronic"),
      isTrustBeneficiary: getCheck("cb-trust"),
      isEntity: getCheck("cb-entity"),
      enableWithdrawalFlow: getCheck("cb-withdraw"),
      withdrawalType: getVal("cb-wdtype") || "one_time"
    };
    state.customSpec = spec;
    startPersona("custom", spec);
    return;
  }
  if (action === "pick") { startPersona(target.dataset.persona); return; }
  if (action === "send") {
    const input = document.getElementById("userInput");
    if (input && input.value.trim()) sendUserMessage(input.value);
    return;
  }
  if (action === "chip") { sendUserMessage(target.dataset.label); return; }
  if (action === "kba-submit") {
    const input = document.getElementById("kbaInput");
    if (input && input.value.trim()) confirmKba(input.value.trim());
    return;
  }
  if (action === "upload-confirm") { confirmUpload(); return; }
  if (action === "esign-confirm") { confirmEsign(); return; }
  if (action === "template-ack") { ackTemplate(); return; }
  if (action === "open-chatbot") { openChatbot(); return; }
  if (action === "close-chatbot") { closeChatbot(); return; }
  if (action === "chatbot-send") {
    const input = document.getElementById("chatbotInput");
    if (input && input.value.trim()) {
      const v = input.value;
      input.value = "";
      sendChatbotMessage(v);
    }
    return;
  }
});

/* Detect engine "calling" state by intercepting agent responses */
const _originalApplyAgentResult = applyAgentResult;
// (engine transitions to "calling" when input package is being assembled — but for the demo we transition to "complete" on the engine_call event from the server, after the deterministic call. We don't show a long "calling" animation since the call is instant. We can briefly flash "calling" client-side if desired.)

/* ----------------------------------------------------------------------
   BOOT
   ---------------------------------------------------------------------- */
async function boot() {
  try {
    state.health = await apiHealth();
    const p = await apiPersonas();
    state.personas = p.personas || [];
  } catch (e) {
    state.apiError = e.message;
  }
  render();
}
boot();
