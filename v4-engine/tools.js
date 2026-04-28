/* ======================================================================
   AGENT TOOLBELT — v4
   ======================================================================
   Tools the conversational agent can invoke. Each tool is enforced by
   the orchestrator: the agent proposes via tool_use; the executor here
   disposes (validates, mutates state, returns disposition).
   ====================================================================== */

const { triageEngine } = require("./backend/triage-engine");

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

const TOOL_DEFS = [
  {
    name: "update_field",
    description:
      "Propose a session-state field value. Path is dot notation (e.g. 'beneficiary.dob_collected', 'classification.beneficiary_classification'). Value is a string. The orchestrator validates and writes; this is your way of recording a fact you've gathered. ALL substantive facts go through this tool — do not just say a fact in chat without recording it.",
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
    name: "pass_gate",
    description:
      "Propose that a workflow gate has cleared. Available: identity, death_cert, authorized_representative, trust_trustee, edb_conversation, selfcert, triage, election_resolution, withdrawal_request, yod_rmd_disclosure, handoff_ready. Orchestrator validates the underlying conditions before accepting.",
    input_schema: {
      type: "object",
      properties: {
        gate_id: {
          type: "string",
          enum: GATE_DEFS.map((g) => g.id)
        }
      },
      required: ["gate_id"]
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
      "Call the deterministic triage engine. Provide the five-field input package: ira_type ('traditional'|'roth'), owner_dob (YYYY-MM-DD), owner_dod (YYYY-MM-DD), beneficiary_dob (YYYY-MM-DD), beneficiary_classification ('spouse'|'edb_minor_child'|'edb_age_gap'|'edb_disabled'|'edb_chronic_illness'|'non_edb_person'|'non_edb_nonperson'|'qualified_see_through_trust'). Returns the engine's output package — applicable_rule_set, election_eligible, election_options, election_track, election_deadline, etc. You MUST NOT infer these values yourself; only call this tool to obtain them.",
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
      "Present an e-signature form. Provide a clear title, 3-5 plain-English bullets summarizing what's being signed, and a fake DocuSign envelope ID. Pauses until signed.",
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
      "Emit a structured, templated communication (acknowledgment, disclosure, wrap-up summary). Use this whenever you would otherwise compose structured output. Available templates: 'distribution_requirements_track2', 'trustee_responsibility_disclosure_track3', 'wrap_track1_election_made', 'wrap_track2_no_election', 'wrap_track3_qst_handoff'. Variables are substituted from session state.",
    input_schema: {
      type: "object",
      properties: {
        template_id: {
          type: "string",
          enum: [
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
      "Finalize the session with an end_state. Valid end states: lump_sum_in_good_order, treat_as_own_path_a_instruction_captured, treat_as_own_path_b_in_good_order, treat_as_own_external_offramp, inherited_ira_established_election_made, inherited_ira_established_election_deferred, inherited_ira_established_no_election_required, inherited_ira_established_qst_handoff, expired_no_resolution.",
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
   EXECUTOR
   ---------------------------------------------------------------------- */
function executeTool(session, toolName, input) {
  const events = [];

  switch (toolName) {
    case "update_field": {
      const { path, value } = input;
      session.state.fields[path] = value;
      events.push({ type: "state_update", path, value });
      return { result: `Field '${path}' set to '${value}'.`, events, halt: false };
    }

    case "pass_gate": {
      const { gate_id } = input;
      if (!session.state.gates.hasOwnProperty(gate_id)) {
        return { result: `Gate '${gate_id}' not active in this session.`, events, halt: false };
      }
      session.state.gates[gate_id] = "passed";
      events.push({ type: "gate_pass", gate_id });
      return { result: `Gate '${gate_id}' passed.`, events, halt: false };
    }

    case "audit": {
      const entry = { time: nowStamp(), text: input.text };
      session.state.audit.unshift(entry);
      events.push({ type: "audit_add", text: entry.text, time: entry.time });
      return { result: "Logged.", events, halt: false };
    }

    case "triage_engine": {
      const result = triageEngine(input);
      // Record input package + output for the right pane
      session.state.engine = {
        called_at: nowStamp(),
        input_package: input,
        result
      };
      // Promote engine outputs to session state under the canonical names
      if (result.ok) {
        const out = result.output_package;
        const promoted = {
          "engine.applicable_rule_set": out.applicable_rule_set,
          "engine.election_eligible": out.election_eligible,
          "engine.election_track": out.election_track,
          "engine.election_options": out.election_options.join(", ") || "(none)",
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
      events.push({ type: "engine_call", input, result });
      return { result: JSON.stringify(result), events, halt: false };
    }

    case "request_kba": {
      session.pendingUI = { type: "kba", prompt: input.prompt };
      events.push({ type: "request_kba", prompt: input.prompt });
      return {
        result: "KBA prompt presented. Wait for the user's response.",
        events,
        halt: true
      };
    }

    case "request_document_upload": {
      session.pendingUI = { type: "upload", title: input.title, files: input.files };
      events.push({ type: "request_upload", title: input.title, files: input.files });
      return {
        result: "Upload prompt presented. STOP RESPONDING. Wait for submission.",
        events,
        halt: true
      };
    }

    case "request_esign": {
      session.pendingUI = {
        type: "esign",
        title: input.title,
        bullets: input.bullets,
        envelope: input.envelope
      };
      events.push({ type: "request_esign", ...input });
      return {
        result: "E-sign form presented. STOP RESPONDING. Wait for signature.",
        events,
        halt: true
      };
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
      return {
        result: `Template '${input.template_id}' presented to the user. STOP RESPONDING and wait for the user to acknowledge.`,
        events,
        halt: true
      };
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
      return { result: `Escalated to ops: ${input.reason}`, events, halt: false };
    }

    case "suggest_chatbot": {
      events.push({ type: "suggest_chatbot", topic: input.topic });
      return {
        result: `User pointed to help assistant for: ${input.topic}. The chatbot widget should be highlighted in the UI; confirm the user can find it.`,
        events,
        halt: false
      };
    }

    case "complete_session": {
      session.state.completed = true;
      session.state.endState = input.end_state;
      events.push({ type: "session_complete", end_state: input.end_state });
      return { result: "Session marked complete.", events, halt: false };
    }

    default:
      return { result: `Unknown tool: ${toolName}`, events, halt: false };
  }
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

module.exports = { TOOL_DEFS, GATE_DEFS, executeTool, renderTemplate };
