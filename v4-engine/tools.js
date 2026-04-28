/* ======================================================================
   AGENT TOOLBELT — v4 (revised)
   ======================================================================
   The agent proposes via tool_use; the orchestrator (this file's
   executeTool function) disposes — validating, mutating session state,
   evaluating gate-clearing conditions, and returning a disposition.

   Architectural commitments enforced here:
     - Allowlisted tools only (TOOL_DEFS registers every legal action).
     - Per-state capability filtering (CAPABILITY_MATRIX restricts which
       tools are available in each phase; computePhase derives the phase
       from gate state).
     - Canonical field registry (CANONICAL_FIELDS validates every
       update_field call against schema-bound paths and types).
     - Deterministic gate clearing (GATE_CONDITIONS predicates run after
       every state mutation; the agent cannot advance gates).
     - Engine-as-single-source (the agent never states engine outputs in
       free text — present_template("engine_report", ...) is the only
       channel for surfacing engine results).
     - Provider-confirmation lifecycle (Schema v1.5 / Change Log v1.27 —
       three "established" end states require provider acknowledgment
       before counting as "in good order").
   ====================================================================== */

const { triageEngine } = require("./backend/triage-engine");

/* ----------------------------------------------------------------------
   GATE DEFINITIONS (Schema Section 5C — eleven gates)
   ---------------------------------------------------------------------- */
const GATE_DEFS = [
  { id: "identity", label: "Identity verified" },
  { id: "death_cert", label: "Death certificate" },
  { id: "authorized_representative", label: "Auth-rep / guardian", optional: true },
  { id: "trust_trustee", label: "Trustee identity", optional: true },
  { id: "edb_conversation", label: "EDB conversation" },
  { id: "selfcert", label: "Self-certification", optional: true },
  { id: "triage", label: "Triage classification" },
  { id: "election_resolution", label: "Election resolution" },
  { id: "withdrawal_request", label: "Withdrawal request", optional: true },
  { id: "yod_rmd_disclosure", label: "YOD RMD disclosure", optional: true },
  { id: "handoff_ready", label: "Handoff ready" }
];

/* ----------------------------------------------------------------------
   GATE_CONDITIONS — deterministic predicates evaluated by the orchestrator.
   The agent does NOT clear gates. After every state mutation, evaluateGates()
   runs each predicate; gates whose conditions hold are auto-cleared.
   ---------------------------------------------------------------------- */
const GATE_CONDITIONS = {
  identity: (s) => Boolean(s.fields["verification.identity"]),
  death_cert: (s) => Boolean(s.fields["verification.death_cert"]),
  authorized_representative: (s) =>
    Boolean(s.fields["actor.role"]) && Boolean(s.fields["auth_rep_docs.uploaded"]),
  trust_trustee: (s) =>
    Boolean(s.fields["trust.name"]) && Boolean(s.fields["verification.identity"]),
  edb_conversation: (s) => {
    const cls = s.fields["beneficiary.classification"];
    if (!cls) return false;
    // For spouse, non-EDB, and trust paths the EDB conversation is structurally not required.
    if (["spouse", "non_edb_person", "non_edb_nonperson", "qualified_see_through_trust"].includes(cls)) {
      return true;
    }
    // For EDB classifications, require explicit conversation completion OR a self-cert resolution.
    return Boolean(s.fields["edb.conversation_complete"]) || Boolean(s.fields["selfcert.trust_status"]);
  },
  selfcert: (s) => Boolean(s.fields["selfcert.trust_status"]),
  triage: (s) => Boolean(s.engine && s.engine.result && s.engine.result.ok),
  election_resolution: (s) =>
    Boolean(s.fields["election.distribution_method"]) ||
    Boolean(s.fields["spouse.path_chosen"]) ||
    Boolean(s.fields["election.declined"]) ||
    Boolean(s.fields["trustee_responsibility_disclosure.acknowledged"]),
  withdrawal_request: (s) => Boolean(s.fields["withdrawal_request.processed"]),
  yod_rmd_disclosure: (s) => Boolean(s.fields["yod_rmd.disclosed"]),
  handoff_ready: (s) =>
    Boolean(s.fields["session.esign_complete"]) && (s.gates.election_resolution === "passed")
};

/* ----------------------------------------------------------------------
   CANONICAL_FIELDS — registered write surface (Schema Data Authority Principle).
   update_field rejects any path not registered here, and validates values
   against the declared type/enum where applicable. Section attributions
   reference v1.5 schema sections.
   ---------------------------------------------------------------------- */
const CANONICAL_FIELDS = {
  // ── Section 1 — Session Metadata ──
  "session.provider": { section: "1A", type: "string", source: "seeded" },
  "session.status": { section: "1B", type: "enum", values: ["initiated", "in_progress", "suspended", "completed", "expired", "escalated"], source: "system_managed" },
  "session.escalated": { section: "5D", type: "boolean", source: "system_managed" },
  "session.escalation_reason": { section: "5D", type: "string", source: "system_managed" },
  "session.esign_complete": { section: "7", type: "boolean", source: "system_managed" },

  // ── Section 2 — IRA Account Data ──
  "ira.type": { section: "2A", type: "enum", values: ["traditional", "roth"], source: "seeded" },
  "ira.balance": { section: "2C", type: "string", source: "seeded" },
  "owner.name": { section: "2A", type: "string", source: "seeded" },
  "owner.dob": { section: "2A", type: "date", source: "seeded" },
  "owner.dod": { section: "2A", type: "date", source: "seeded" },

  // ── Section 3A — Beneficiary Identity (Subject) ──
  "beneficiary.name": { section: "3A", type: "string", source: "seeded" },
  "beneficiary.name (Subject)": { section: "3A", type: "string", source: "seeded", note: "labeled variant for non-individual personas" },
  "beneficiary.dob": { section: "3A", type: "date", source: "seeded_or_collected" },
  "beneficiary.age": { section: "3A", type: "string", source: "computed" },
  "beneficiary.relationship": { section: "4A", type: "string", source: "collected" },
  "beneficiary.type": { section: "4A", type: "enum", values: ["individual", "authorized_representative", "trust_trustee", "entity_rep"], source: "collected" },
  "beneficiary.classification": { section: "4D", type: "enum", values: ["spouse", "edb_minor_child", "edb_age_gap", "edb_disabled", "edb_chronic_illness", "non_edb_person", "non_edb_nonperson", "qualified_see_through_trust"], source: "engine_input" },

  // ── Section 3B — KBA / Verification ──
  "verification.identity": { section: "3B", type: "string", source: "system_managed" },
  "verification.death_cert": { section: "3B", type: "string", source: "system_managed" },

  // ── Section 3D — Session Actor Identity ──
  "actor.name (Operator, 3D)": { section: "3D", type: "string", source: "seeded" },
  "actor.role": { section: "3D", type: "string", source: "collected" },
  "actor.relationship_to_subject": { section: "3D", type: "string", source: "seeded" },

  // ── Section 4F — Authorized Representative ──
  "auth_rep_docs.uploaded": { section: "4F", type: "boolean", source: "collected" },

  // ── Section 4B — Self-cert (trust) ──
  "selfcert.trust_status": { section: "4B", type: "enum", values: ["completed", "declined"], source: "collected" },
  "trust.q1": { section: "4B", type: "string", source: "collected" },
  "trust.q2": { section: "4B", type: "string", source: "collected" },
  "trust.q3": { section: "4B", type: "string", source: "collected" },
  "trust.q4": { section: "4B", type: "string", source: "collected" },

  // ── Section 4G — Trust Identity ──
  "trust.name": { section: "4G", type: "string", source: "collected" },

  // ── Section 5D — EDB conversation tracking ──
  "edb.conversation_complete": { section: "5D", type: "boolean", source: "system_managed" },

  // ── Section 6A — Election ──
  "election.distribution_method": { section: "6A", type: "enum", values: ["life_expectancy", "10_year"], source: "collected" },
  "election.declined": { section: "6A", type: "boolean", source: "collected" },
  "spouse.path_chosen": { section: "6A", type: "string", source: "collected" },

  // ── Section 6C-ii — Trustee responsibility disclosure (Track 3) ──
  "trustee_responsibility_disclosure.acknowledged": { section: "6C", type: "boolean", source: "collected" },

  // ── Section 6E — Year-of-death RMD ──
  "yod_rmd.applicable": { section: "6E", type: "boolean", source: "computed" },
  "yod_rmd.disclosed": { section: "6E", type: "boolean", source: "system_managed" },

  // ── Section 10B — Provider attention alerts ──
  "provider_attention_alerts": { section: "10B", type: "string", source: "system_managed" },

  // ── Section 10D — Handoff package ──
  "case.reference": { section: "10D", type: "string", source: "system_managed" },

  // ── Engine outputs — written automatically when triage_engine returns ──
  "engine.applicable_rule_set": { section: "4D", type: "string", source: "engine" },
  "engine.election_eligible": { section: "4D", type: "string", source: "engine" },
  "engine.election_track": { section: "4D", type: "string", source: "engine" },
  "engine.election_options": { section: "4D", type: "string", source: "engine" },
  "engine.election_deadline": { section: "4D", type: "string", source: "engine" },
  "engine.asserted_rule": { section: "4D", type: "string", source: "engine" },
  "engine.owner_rbd_status": { section: "2B", type: "string", source: "engine" },
  "engine.owner_rbd_date": { section: "2B", type: "string", source: "engine" },
  "engine.owner_rmd_attainment_year": { section: "2B", type: "string", source: "engine" },
  "engine.distribution_window_end": { section: "4D", type: "string", source: "engine" },
  "engine.annual_rmd_required": { section: "4D", type: "string", source: "engine" },

  // ── Section 5B — Provider confirmation lifecycle (v1.27) ──
  "inherited_ira_establishment_status": { section: "5B", type: "enum", values: ["pending_provider_confirmation", "confirmed", "pending_provider_confirmation_fallback_applied"], source: "system_managed" },
  "inherited_ira_provider_confirmation_initiated_at": { section: "5B", type: "string", source: "system_managed" },
  "inherited_ira_provider_confirmation_confirmed_at": { section: "5B", type: "string", source: "system_managed" }
};

/* ----------------------------------------------------------------------
   PHASE COMPUTATION & CAPABILITY MATRIX (Handoff §8.1)
   The agent's tool list is filtered per phase before being sent to Claude.
   Phase is derived deterministically from gate state — the agent does
   not control the phase any more than it controls a gate.
   ---------------------------------------------------------------------- */
function computePhase(session) {
  const g = session.state.gates;
  const passed = (id) => g[id] === "passed";

  if (session.state.completed) return "complete";
  if (passed("election_resolution")) return "wrap";
  if (passed("triage")) return "election";
  if (passed("identity")) return "triage_prep";
  return "intake";
}

const CAPABILITY_MATRIX = {
  intake: ["update_field", "audit", "request_kba", "request_document_upload", "flag_for_ops", "suggest_chatbot"],
  triage_prep: ["update_field", "audit", "request_document_upload", "request_kba", "triage_engine", "flag_for_ops", "suggest_chatbot"],
  election: ["update_field", "audit", "present_template", "request_esign", "flag_for_ops", "suggest_chatbot"],
  wrap: ["update_field", "audit", "present_template", "request_esign", "complete_session", "flag_for_ops", "suggest_chatbot"],
  complete: ["audit"]
};

function getAvailableTools(session) {
  const phase = computePhase(session);
  const allowed = new Set(CAPABILITY_MATRIX[phase] || []);
  return TOOL_DEFS.filter((t) => allowed.has(t.name));
}

/* ----------------------------------------------------------------------
   TOOL DEFINITIONS — every legal agent action.
   Note: `pass_gate` has been removed. Gates clear deterministically via
   evaluateGates() in the orchestrator after every state mutation.
   ---------------------------------------------------------------------- */
const TOOL_DEFS = [
  {
    name: "update_field",
    description:
      "Propose a session-state field value. Path must be a registered canonical field (see Schema Section attribution). Value is a string. The orchestrator validates against the field registry and writes; this is your way of recording a fact you've gathered. ALL substantive facts go through this tool. The orchestrator will reject unregistered paths or invalid enum values.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        value: { type: "string" }
      },
      required: ["path", "value"]
    }
  },
  {
    name: "audit",
    description:
      "Append a system-of-record entry. Brief, professional, past-tense. Use for any consequential event (verification, classification, election, document received, etc.).",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  },
  {
    name: "triage_engine",
    description:
      "Call the deterministic triage engine. Provide the five-field input package: ira_type ('traditional'|'roth'), owner_dob (YYYY-MM-DD), owner_dod (YYYY-MM-DD), beneficiary_dob (YYYY-MM-DD), beneficiary_classification. Returns the engine's output package. You MUST NOT infer these values yourself; only call this tool to obtain them. After the engine returns, you MUST present the result via present_template('engine_report', {...}) before any free-text discussion of what it means.",
    input_schema: {
      type: "object",
      properties: {
        ira_type: { type: "string", enum: ["traditional", "roth"] },
        owner_dob: { type: "string" },
        owner_dod: { type: "string" },
        beneficiary_dob: { type: "string" },
        beneficiary_classification: {
          type: "string",
          enum: [
            "spouse",
            "edb_minor_child",
            "edb_age_gap",
            "edb_disabled",
            "edb_chronic_illness",
            "non_edb_person",
            "non_edb_nonperson",
            "qualified_see_through_trust"
          ]
        }
      },
      required: ["ira_type", "owner_dob", "owner_dod", "beneficiary_dob", "beneficiary_classification"]
    }
  },
  {
    name: "request_kba",
    description:
      "Present a knowledge-based authentication challenge to the user. Provide the question text. The user will respond and the orchestrator will validate.",
    input_schema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"]
    }
  },
  {
    name: "request_document_upload",
    description:
      "Present an in-chat document upload prompt with realistic file names. Pauses the conversation until the user submits.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        files: { type: "array", items: { type: "string" } }
      },
      required: ["title", "files"]
    }
  },
  {
    name: "request_esign",
    description:
      "Present an e-signature form. Provide a clear title, 3-5 plain-English bullets summarizing what's being signed, and a fake DocuSign envelope ID. Pauses until signed. After the user signs, the orchestrator will set session.esign_complete = true automatically.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        bullets: { type: "array", items: { type: "string" } },
        envelope: { type: "string" }
      },
      required: ["title", "bullets", "envelope"]
    }
  },
  {
    name: "present_template",
    description:
      "Emit a structured, templated communication. This is the ONLY channel for substantive structured output — engine reports, acknowledgments, disclosures, wrap-up summaries. Free-form composition of these is forbidden. After triage_engine returns, you MUST call present_template('engine_report', {...}) to surface the engine's output. Available templates: 'engine_report', 'distribution_requirements_track2', 'trustee_responsibility_disclosure_track3', 'wrap_track1_election_made', 'wrap_track2_no_election', 'wrap_track3_qst_handoff'. Variables are substituted from your provided object.",
    input_schema: {
      type: "object",
      properties: {
        template_id: {
          type: "string",
          enum: [
            "engine_report",
            "distribution_requirements_track2",
            "trustee_responsibility_disclosure_track3",
            "wrap_track1_election_made",
            "wrap_track2_no_election",
            "wrap_track3_qst_handoff"
          ]
        },
        variables: { type: "object", additionalProperties: { type: "string" } }
      },
      required: ["template_id"]
    }
  },
  {
    name: "flag_for_ops",
    description:
      "Escalate to provider operations. Provide a reason and an optional case reference.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        case_ref: { type: "string" }
      },
      required: ["reason"]
    }
  },
  {
    name: "suggest_chatbot",
    description:
      "Suggest the user open the help assistant for a general rules question. Use when the user asks something that's general education rather than session-specific.",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"]
    }
  },
  {
    name: "complete_session",
    description:
      "Finalize the session with an end_state. Valid end states: lump_sum_in_good_order, treat_as_own_path_a_instruction_captured, treat_as_own_path_b_in_good_order, treat_as_own_external_offramp, inherited_ira_established_election_made, inherited_ira_established_election_deferred, inherited_ira_established_no_election_required, inherited_ira_established_qst_handoff, expired_no_resolution. For the three inherited_ira_established_election_* and inherited_ira_established_no_election_required end states, the orchestrator will mark the case 'pending_provider_confirmation' (Schema v1.27); the case becomes 'in good order' only after the provider acknowledges.",
    input_schema: {
      type: "object",
      properties: {
        end_state: { type: "string" }
      },
      required: ["end_state"]
    }
  }
];

/* ----------------------------------------------------------------------
   TEMPLATE LIBRARY
   ---------------------------------------------------------------------- */
const TEMPLATES = {
  engine_report: ({
    classification,
    applicable_rule,
    election_eligible,
    election_options,
    election_deadline,
    distribution_window_end,
    owner_rbd_status,
    owner_rbd_date,
    annual_rmd_required,
    beneficiary_name,
    election_track
  }) => {
    const lines = [
      `**Classification:** ${classification || "—"}`,
      `**Election track:** ${election_track || "—"}`,
      `**Owner RBD status:** ${owner_rbd_status || "—"}${owner_rbd_date ? `  ·  RBD: ${owner_rbd_date}` : ""}`,
      `**Applicable rule:** ${applicable_rule || "—"}`,
      `**Election eligibility:** ${election_eligible || "—"}`
    ];
    if (election_options && election_options !== "(none)") {
      lines.push(`**Distribution options:** ${election_options}`);
    }
    if (election_deadline && election_deadline !== "(n/a)") {
      lines.push(`**Election deadline:** ${election_deadline}`);
    }
    if (distribution_window_end && distribution_window_end !== "(n/a)") {
      lines.push(`**Distribution window ends:** ${distribution_window_end}`);
    }
    if (annual_rmd_required) {
      lines.push(`**Annual RMD required during window:** ${annual_rmd_required}`);
    }
    return {
      title: "Triage Engine Report",
      body: `**Triage classification report${beneficiary_name ? ` — ${beneficiary_name}` : ""}**

${lines.join("\n")}

—

*Prototype note: in production this report would be delivered as a PDF document through your provider's secure channel, with full citations to the governing rule set and explanatory commentary. For this prototype the structured output is shown directly in chat. The agent's role is to walk you through the next decision — not to interpret the rules itself.*`,
      bullets: []
    };
  },

  distribution_requirements_track2: ({ asserted_rule, distribution_window_end, beneficiary_name }) => ({
    title: "Distribution Requirements — Acknowledgment",
    body: `As the beneficiary of this inherited IRA, the following distribution rule applies to your account based on the triage engine's classification:

**Applicable rule:** ${asserted_rule || "Life Expectancy"}
${distribution_window_end ? `**Full distribution required by:** ${distribution_window_end}` : ""}

This rule is asserted, not elected — there is no A/B option for this classification. The provider will set up your inherited IRA on this distribution schedule.`,
    bullets: [
      `Asserted rule: ${asserted_rule || "Life Expectancy"}`,
      distribution_window_end ? `Distribution window ends: ${distribution_window_end}` : "Annual distributions on a Life Expectancy schedule",
      "No A/B election applies — rule is asserted",
      "Provider will retitle the account and configure the distribution schedule"
    ]
  }),

  trustee_responsibility_disclosure_track3: ({ trustee_name, trust_name, ira_balance }) => ({
    title: "Trustee Responsibility Disclosure (Section 6C-ii)",
    body: `As trustee of ${trust_name || "the named beneficiary trust"}, you acknowledge:

The system has captured your self-certification regarding the trust's see-through qualification. The applicable distribution rule and election eligibility for this inherited IRA depend on the classifications of the trust's underlying beneficiaries — specifically the oldest beneficiary's classification — and on whether the trust is conduit or accumulation. The Convergent system does not adjudicate trust qualification or classify the underlying beneficiaries.

The provider will determine the applicable rule and election eligibility out-of-system, in coordination with you, per their own policies and procedures. The provider has been notified of this case via the system's structured provider-attention channel.`,
    bullets: [
      `Trust: ${trust_name || "Named beneficiary trust"}`,
      "Self-certification recorded; classification flagged for provider determination",
      "Applicable rule depends on trust beneficiaries — provider determines out-of-system",
      "Provider notified via provider_attention_alerts (qst case)",
      "Inherited IRA will be established; final classification handled separately"
    ]
  }),

  wrap_track1_election_made: ({ election, deadline, beneficiary_name }) => ({
    title: "Confirmation",
    body: `All set${beneficiary_name ? `, ${beneficiary_name}` : ""}.

You've elected the **${election || "selected"}** distribution method.${deadline ? ` Election deadline of record: ${deadline}.` : ""}

Next steps:
- The provider will retitle the account and configure your distribution schedule based on your election.
- A confirmation package is being transmitted to the provider for implementation.
- The case will reach "in good order" status once the provider acknowledges receipt (Schema v1.27 — provider confirmation lifecycle).
- You'll receive an email confirmation shortly.

If you have questions later, the same link will reopen this session.`,
    bullets: []
  }),

  wrap_track2_no_election: ({ asserted_rule, beneficiary_name }) => ({
    title: "Confirmation",
    body: `All set${beneficiary_name ? `, ${beneficiary_name}` : ""}.

The applicable rule for your inherited IRA is **${asserted_rule || "as determined by the triage engine"}** — asserted by the rules, not elected.

Next steps:
- The provider will retitle the account and set up your distribution schedule.
- A confirmation package is being transmitted to the provider for implementation.
- The case will reach "in good order" status once the provider acknowledges receipt (Schema v1.27 — provider confirmation lifecycle).
- You'll receive an email confirmation shortly.`,
    bullets: []
  }),

  wrap_track3_qst_handoff: ({ trust_name, case_ref }) => ({
    title: "Confirmation — Track 3 (QST Handoff)",
    body: `Done.

${trust_name || "The trust"} has been recorded as the beneficiary of record. The inherited IRA is being established. The provider has been notified via the system's structured provider-attention channel and will reach out to determine the applicable rule and any election handling out-of-system.

Case reference: ${case_ref || "[case_ref]"}.

The provider's trust review team will follow up shortly.`,
    bullets: []
  })
};

function renderTemplate(templateId, variables = {}) {
  const fn = TEMPLATES[templateId];
  if (!fn) return { title: "Unknown template", body: "(template not found)", bullets: [] };
  return fn(variables);
}

/* ----------------------------------------------------------------------
   FIELD VALIDATION (against CANONICAL_FIELDS registry)
   ---------------------------------------------------------------------- */
function validateField(path, value) {
  const def = CANONICAL_FIELDS[path];
  if (!def) {
    return { ok: false, reason: `Unregistered path '${path}'. Use a canonical field name from the schema. (See CANONICAL_FIELDS in tools.js.)` };
  }
  if (def.type === "enum" && Array.isArray(def.values) && !def.values.includes(value)) {
    return { ok: false, reason: `Value '${value}' not in enum for ${path}. Allowed: ${def.values.join(", ")}.` };
  }
  if (def.type === "boolean" && !["true", "false"].includes(value)) {
    return { ok: false, reason: `Field '${path}' is boolean; value must be 'true' or 'false'.` };
  }
  if (def.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { ok: false, reason: `Field '${path}' is a date; value must be YYYY-MM-DD.` };
    }
  }
  return { ok: true };
}

/* ----------------------------------------------------------------------
   GATE EVALUATION — runs after every state mutation.
   ---------------------------------------------------------------------- */
function evaluateGates(session) {
  const events = [];
  for (const [gateId, predicate] of Object.entries(GATE_CONDITIONS)) {
    if (!session.state.gates.hasOwnProperty(gateId)) continue;
    if (session.state.gates[gateId] === "passed") continue;
    let cleared = false;
    try { cleared = predicate(session.state); } catch (e) { cleared = false; }
    if (cleared) {
      session.state.gates[gateId] = "passed";
      events.push({ type: "gate_pass", gate_id: gateId });
    }
  }
  return events;
}

/* ----------------------------------------------------------------------
   PROVIDER CONFIRMATION LIFECYCLE (Schema v1.27)
   complete_session for the three inherited_ira_established_election_*
   and inherited_ira_established_no_election_required end states marks
   the case pending; markProviderConfirmed flips it to confirmed.
   QST handoff has its own gating (trustee disclosure ack) and does NOT
   use this lifecycle.
   ---------------------------------------------------------------------- */
const END_STATES_REQUIRING_PROVIDER_CONFIRM = new Set([
  "inherited_ira_established_election_made",
  "inherited_ira_established_election_deferred",
  "inherited_ira_established_no_election_required"
]);

function markProviderConfirmed(session) {
  const events = [];
  if (!session.state.completed) {
    return { ok: false, reason: "Session not yet completed.", events };
  }
  if (!END_STATES_REQUIRING_PROVIDER_CONFIRM.has(session.state.endState)) {
    return { ok: false, reason: "End state does not require provider confirmation.", events };
  }
  const ts = new Date().toISOString();
  session.state.fields["inherited_ira_establishment_status"] = "confirmed";
  session.state.fields["inherited_ira_provider_confirmation_confirmed_at"] = ts;
  events.push({ type: "state_update", path: "inherited_ira_establishment_status", value: "confirmed" });
  events.push({ type: "state_update", path: "inherited_ira_provider_confirmation_confirmed_at", value: ts });
  const auditEntry = { time: nowStamp(), text: `Provider acknowledged establishment package — case marked confirmed (in good order).` };
  session.state.audit.unshift(auditEntry);
  events.push({ type: "audit_add", text: auditEntry.text, time: auditEntry.time });
  return { ok: true, events };
}

/* ----------------------------------------------------------------------
   EXECUTOR — the orchestrator's disposition layer.
   Every tool call passes through here. After every state-mutating call,
   evaluateGates runs to deterministically clear any newly-eligible gate.
   ---------------------------------------------------------------------- */
function executeTool(session, toolName, input) {
  const events = [];
  let result;
  let halt = false;
  let mutated = false;

  switch (toolName) {
    case "update_field": {
      const { path, value } = input;
      const validation = validateField(path, value);
      if (!validation.ok) {
        result = `REJECTED: ${validation.reason}`;
        break;
      }
      session.state.fields[path] = value;
      events.push({ type: "state_update", path, value });
      mutated = true;
      result = `Field '${path}' set to '${value}'.`;
      break;
    }

    case "audit": {
      const entry = { time: nowStamp(), text: input.text };
      session.state.audit.unshift(entry);
      events.push({ type: "audit_add", text: entry.text, time: entry.time });
      result = "Logged.";
      break;
    }

    case "triage_engine": {
      const engResult = triageEngine(input);
      session.state.engine = {
        called_at: nowStamp(),
        input_package: input,
        result: engResult
      };
      if (engResult.ok) {
        const out = engResult.output_package;
        const promoted = {
          "engine.applicable_rule_set": out.applicable_rule_set,
          "engine.election_eligible": out.election_eligible,
          "engine.election_track": out.election_track,
          "engine.election_options": (out.election_options || []).join(", ") || "(none)",
          "engine.election_deadline": out.election_deadline || "(n/a)",
          "engine.asserted_rule": out.asserted_rule || "(none — A/B available)",
          "engine.owner_rbd_status": out.owner_rbd_status,
          "engine.owner_rbd_date": out.owner_rbd_date,
          "engine.owner_rmd_attainment_year": String(out.owner_rmd_attainment_year),
          "engine.distribution_window_end": out.distribution_window_end || "(n/a)",
          "engine.annual_rmd_required": String(out.annual_rmd_required)
        };
        for (const [k, v] of Object.entries(promoted)) {
          session.state.fields[k] = v;
          events.push({ type: "state_update", path: k, value: v });
        }
      }
      events.push({ type: "engine_call", input, result: engResult });
      mutated = true;
      result = JSON.stringify(engResult);
      break;
    }

    case "request_kba": {
      session.pendingUI = { type: "kba", prompt: input.prompt };
      events.push({ type: "request_kba", prompt: input.prompt });
      result = "KBA prompt presented. Wait for the user's response.";
      halt = true;
      break;
    }

    case "request_document_upload": {
      session.pendingUI = { type: "upload", title: input.title, files: input.files };
      events.push({ type: "request_upload", title: input.title, files: input.files });
      result = "Upload prompt presented. STOP RESPONDING. Wait for submission.";
      halt = true;
      break;
    }

    case "request_esign": {
      session.pendingUI = {
        type: "esign",
        title: input.title,
        bullets: input.bullets,
        envelope: input.envelope
      };
      events.push({ type: "request_esign", ...input });
      result = "E-sign form presented. STOP RESPONDING. Wait for signature.";
      halt = true;
      break;
    }

    case "present_template": {
      const rendered = renderTemplate(input.template_id, input.variables || {});
      session.pendingUI = {
        type: "template",
        template_id: input.template_id,
        title: rendered.title,
        body: rendered.body,
        bullets: rendered.bullets
      };
      events.push({
        type: "template_presented",
        template_id: input.template_id,
        title: rendered.title,
        body: rendered.body,
        bullets: rendered.bullets
      });
      result = `Template '${input.template_id}' presented to the user. STOP RESPONDING and wait for the user to acknowledge.`;
      halt = true;
      break;
    }

    case "flag_for_ops": {
      session.state.fields["session.escalated"] = "true";
      session.state.fields["session.escalation_reason"] = input.reason;
      if (input.case_ref) session.state.fields["case.reference"] = input.case_ref;
      events.push({
        type: "ops_escalation",
        reason: input.reason,
        case_ref: input.case_ref || null
      });
      mutated = true;
      result = `Escalated to ops: ${input.reason}`;
      break;
    }

    case "suggest_chatbot": {
      events.push({ type: "suggest_chatbot", topic: input.topic });
      result = `User pointed to help assistant for: ${input.topic}. The chatbot widget should be highlighted in the UI; confirm the user can find it.`;
      break;
    }

    case "complete_session": {
      session.state.completed = true;
      session.state.endState = input.end_state;
      session.state.fields["session.status"] = "completed";
      events.push({ type: "state_update", path: "session.status", value: "completed" });
      events.push({ type: "session_complete", end_state: input.end_state });

      if (END_STATES_REQUIRING_PROVIDER_CONFIRM.has(input.end_state)) {
        const ts = new Date().toISOString();
        session.state.fields["inherited_ira_establishment_status"] = "pending_provider_confirmation";
        session.state.fields["inherited_ira_provider_confirmation_initiated_at"] = ts;
        events.push({ type: "state_update", path: "inherited_ira_establishment_status", value: "pending_provider_confirmation" });
        events.push({ type: "state_update", path: "inherited_ira_provider_confirmation_initiated_at", value: ts });
        const noteEntry = { time: nowStamp(), text: "Establishment package transmitted; awaiting provider confirmation (Schema v1.27 lifecycle)." };
        session.state.audit.unshift(noteEntry);
        events.push({ type: "audit_add", text: noteEntry.text, time: noteEntry.time });
      }
      mutated = true;
      result = "Session marked complete.";
      break;
    }

    default:
      result = `Unknown tool: ${toolName}`;
  }

  // Auto-clear esign on signature submission.
  // (server.js sets a flag via a synthetic update_field after esign UI returns.)

  // Run deterministic gate evaluation after any state mutation.
  if (mutated) {
    const gateEvents = evaluateGates(session);
    events.push(...gateEvents);
  }

  return { result, events, halt };
}

/* ----------------------------------------------------------------------
   esign-complete signal — server.js calls this after the user signs
   the e-sign form so the orchestrator can advance gates without the
   agent having to write a field.
   ---------------------------------------------------------------------- */
function markEsignComplete(session) {
  session.state.fields["session.esign_complete"] = "true";
  const events = [{ type: "state_update", path: "session.esign_complete", value: "true" }];
  events.push(...evaluateGates(session));
  return events;
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

module.exports = {
  TOOL_DEFS,
  GATE_DEFS,
  CANONICAL_FIELDS,
  CAPABILITY_MATRIX,
  GATE_CONDITIONS,
  END_STATES_REQUIRING_PROVIDER_CONFIRM,
  executeTool,
  evaluateGates,
  computePhase,
  getAvailableTools,
  renderTemplate,
  validateField,
  markEsignComplete,
  markProviderConfirmed
};
