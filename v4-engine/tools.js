/* ======================================================================
   AGENT TOOLBELT — v4 Phase 2 (deep schema fidelity)
   ======================================================================
   The agent proposes via tool_use; the orchestrator (this file's
   executeTool function) disposes — validating, mutating session state,
   evaluating gate-clearing conditions, generating structured artifacts,
   and returning a disposition.

   Phase 2 architectural commitments:
     - Canonical field registry expanded to ~150 fields covering Sections
       1, 2, 3, 4, 5, 6, 7, 9, 10 of the v1.5 schema with type/enum/source
       attribution. update_field rejects unregistered paths and invalid
       enum values; system-managed fields are not agent-writable.
     - End-state enum validated against the v1.5 Appendix.
     - provider_attention_alerts is a typed array of alert objects per
       Section 10B; new tool append_provider_attention_alert(...) is the
       only canonical write path.
     - Provider-confirmation lifecycle (Schema v1.27) — three "established"
       end states, timeout/fallback machinery, corrective package re-push.
     - YOD RMD six-field disclosure cluster (Section 6E v1.12), including
       the existing_ira_instruction_status lifecycle (v1.27 second cluster).
     - Withdrawal Request detail (Section 9) — 9A request identity, 9B
       lump_sum, 9C one_time (amount type, timing), 9D standing
       (basis, frequency, start date), 9E withholding (federal + state),
       9F e-sign + handoff. New tools and templates for the full flow.
     - Handoff package generation (Section 10A) — orchestrator emits a
       structured handoff_package object on complete_session, exposed via
       /api/agent/handoff-package and rendered in the outro overlay.
   ====================================================================== */

const { triageEngine } = require("./backend/triage-engine");
const { computeStateWithholding } = require("./backend/state-withholding");

/* ======================================================================
   GATE DEFINITIONS (Schema Section 5C — twelve gates)
   ====================================================================== */
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

/* ======================================================================
   GATE_CONDITIONS — deterministic predicates evaluated by orchestrator.
   ====================================================================== */
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
    if (["spouse", "non_edb_person", "non_edb_nonperson", "qualified_see_through_trust"].includes(cls)) {
      return true;
    }
    return Boolean(s.fields["edb.conversation_complete"]) || Boolean(s.fields["selfcert.trust_status"]);
  },
  selfcert: (s) => Boolean(s.fields["selfcert.trust_status"]),
  triage: (s) => Boolean(s.engine && s.engine.result && s.engine.result.ok),
  election_resolution: (s) =>
    Boolean(s.fields["election.distribution_method"]) ||
    Boolean(s.fields["spouse.path_chosen"]) ||
    Boolean(s.fields["election.declined"]) ||
    Boolean(s.fields["trustee_responsibility_disclosure.acknowledged"]),
  withdrawal_request: (s) =>
    Boolean(s.fields["withdrawal_request_type"]) ||
    s.fields["withdrawal_request_decision"] === "declined",
  yod_rmd_disclosure: (s) =>
    Boolean(s.fields["yod_rmd_disclosure_acknowledged"]) ||
    s.fields["yod_rmd_disclosure_applicable"] === "false" ||
    Boolean(s.fields["yod_rmd.disclosed"]),
  handoff_ready: (s) =>
    Boolean(s.fields["session.esign_complete"]) && (s.gates.election_resolution === "passed")
};

/* ======================================================================
   CANONICAL_FIELDS — schema-bound write surface registry.
   The "primary" field name varies: existing v4-engine personas use
   dot-notation paths; new subsystems (withdrawal, handoff, lifecycle) use
   schema-canonical underscored names. Both are valid; the registry maps
   each to its v1.5 section, type, enum, and source attribution.

   `agent_writable: false` blocks update_field calls — system-managed
   fields are written by the orchestrator only.
   ====================================================================== */
const CANONICAL_FIELDS = {
  // ============= Section 1A — Session Metadata =============
  "session.provider": { section: "1A", type: "string", source: "seeded", agent_writable: false },
  "session.status": { section: "1B", type: "enum", values: ["initiated", "in_progress", "suspended", "awaiting_esign", "awaiting_docs", "escalated", "unresponsive", "completed", "abandoned", "expired"], source: "system_managed", agent_writable: false },
  "session.escalated": { section: "5D", type: "boolean", source: "system_managed", agent_writable: false },
  "session.escalation_reason": { section: "5D", type: "string", source: "system_managed", agent_writable: false },
  "session.esign_complete": { section: "7", type: "boolean", source: "system_managed", agent_writable: false },

  // ============= Section 1B — Unresponsive flow =============
  "unresponsive_flagged_at": { section: "1B", type: "string", source: "system_managed", agent_writable: false },
  "unresponsive_ops_notified": { section: "1B", type: "boolean", source: "system_managed", agent_writable: false },

  // ============= Section 1C — Expiry =============
  "expiry_deadline": { section: "1C", type: "date", source: "seeded", agent_writable: false },
  "expiry_deadline_overridden": { section: "1C", type: "boolean", source: "system_managed", agent_writable: false },

  // ============= Section 2A — IRA Account Data =============
  "ira.type": { section: "2A", type: "enum", values: ["traditional", "roth"], source: "seeded", agent_writable: false },
  "ira.balance": { section: "2C", type: "string", source: "seeded", agent_writable: false },
  "owner.name": { section: "2A", type: "string", source: "seeded", agent_writable: false },
  "owner.dob": { section: "2A", type: "date", source: "seeded", agent_writable: false },
  "owner.dod": { section: "2A", type: "date", source: "seeded", agent_writable: false },

  // ============= Section 3A — Beneficiary Identity (Subject) =============
  "beneficiary.name": { section: "3A", type: "string", source: "seeded", agent_writable: false },
  "beneficiary.name (Subject)": { section: "3A", type: "string", source: "seeded", agent_writable: false, note: "labeled variant for non-individual personas" },
  "beneficiary.dob": { section: "3A", type: "date", source: "seeded_or_collected", agent_writable: true },
  "beneficiary.age": { section: "3A", type: "string", source: "computed", agent_writable: false },
  "beneficiary.state": { section: "3A", type: "string", source: "collected", agent_writable: true, note: "Two-letter state code; drives state withholding determination (Section 9E)." },
  "beneficiary.relationship": { section: "4A", type: "string", source: "collected", agent_writable: true },
  "beneficiary.type": { section: "4A", type: "enum", values: ["individual", "authorized_representative", "trust_trustee", "entity_rep"], source: "collected", agent_writable: true },
  "beneficiary.classification": { section: "4D", type: "enum", values: ["spouse", "edb_minor_child", "edb_age_gap", "edb_disabled", "edb_chronic_illness", "non_edb_person", "non_edb_nonperson", "qualified_see_through_trust"], source: "engine_input", agent_writable: true },

  // ============= Section 3B — KBA / Verification =============
  "verification.identity": { section: "3B", type: "string", source: "system_managed", agent_writable: true, note: "prototype-only; production has system update after KBA validation" },
  "verification.death_cert": { section: "3B", type: "string", source: "system_managed", agent_writable: true, note: "prototype-only" },

  // ============= Section 3D — Session Actor Identity =============
  "actor.name (Operator, 3D)": { section: "3D", type: "string", source: "seeded", agent_writable: false },
  "actor.role": { section: "3D", type: "string", source: "collected", agent_writable: true },
  "actor.relationship_to_subject": { section: "3D", type: "string", source: "seeded", agent_writable: false },

  // ============= Section 4F — Authorized Representative =============
  "auth_rep_docs.uploaded": { section: "4F", type: "boolean", source: "collected", agent_writable: true },
  "representative_role_type": { section: "4F", type: "enum", values: ["guardian", "conservator", "attorney_in_fact"], source: "collected", agent_writable: true },
  "authorized_representative_doc_type": { section: "4F", type: "enum", values: ["court_order", "letters_of_guardianship", "utma_ugma_account_docs", "letters_testamentary", "conservatorship_order", "durable_power_of_attorney"], source: "collected", agent_writable: true },
  "authorized_representative_doc_status": { section: "4F", type: "enum", values: ["not_required", "pending", "submitted", "under_review", "verified", "rejected", "escalated"], source: "system_managed", agent_writable: false },

  // ============= Section 4B — Self-cert (trust qualification) =============
  "selfcert.trust_status": { section: "4B", type: "enum", values: ["completed", "declined"], source: "collected", agent_writable: true },
  "trust.q1": { section: "4B", type: "string", source: "collected", agent_writable: true },
  "trust.q2": { section: "4B", type: "string", source: "collected", agent_writable: true },
  "trust.q3": { section: "4B", type: "string", source: "collected", agent_writable: true },
  "trust.q4": { section: "4B", type: "string", source: "collected", agent_writable: true },

  // ============= Section 4G — Trust Trustee =============
  "trust.name": { section: "4G", type: "string", source: "collected", agent_writable: true },
  "trust_date": { section: "4G", type: "date", source: "collected", agent_writable: true },
  "trustee_type": { section: "4G", type: "enum", values: ["individual_trustee", "co_trustee", "corporate_trustee_authorized_rep"], source: "collected", agent_writable: true },
  "corporate_trustee_entity_name": { section: "4G", type: "string", source: "collected", agent_writable: true },
  "trust_provider_notified": { section: "4G", type: "boolean", source: "system_managed", agent_writable: false },
  "trust_provider_notified_at": { section: "4G", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 5B — Branch State / Establishment =============
  "branch_indicated": { section: "5B", type: "enum", values: ["fast_lane_treat_as_own", "fast_lane_lump_sum", "educational_journey"], source: "collected", agent_writable: true },
  "branch_confirmed": { section: "5B", type: "enum", values: ["fast_lane_treat_as_own", "fast_lane_lump_sum", "educational_journey"], source: "collected", agent_writable: true },
  "branch_locked": { section: "5B", type: "boolean", source: "system_managed", agent_writable: false },

  "session_end_state": { section: "5B", type: "enum", values: ["lump_sum_in_good_order", "treat_as_own_path_a_instruction_captured", "treat_as_own_path_b_in_good_order", "treat_as_own_external_offramp", "inherited_ira_established_election_made", "inherited_ira_established_election_deferred", "inherited_ira_established_no_election_required", "inherited_ira_established_qst_handoff", "expired_no_resolution"], source: "system_managed", agent_writable: false },
  "session_end_state_in_good_order": { section: "5B", type: "boolean", source: "system_managed", agent_writable: false },

  "inherited_ira_establishment_status": { section: "5B", type: "enum", values: ["pending_provider_confirmation", "pending_provider_confirmation_fallback_applied", "confirmed", "rejected", "implementation_error"], source: "system_managed", agent_writable: false },
  "inherited_ira_establishment_status_pending_at": { section: "5B", type: "string", source: "system_managed", agent_writable: false },
  "inherited_ira_establishment_status_confirmed_at": { section: "5B", type: "string", source: "system_managed", agent_writable: false },
  "inherited_ira_establishment_status_rejected_at": { section: "5B", type: "string", source: "system_managed", agent_writable: false },
  "inherited_ira_establishment_status_fallback_applied_at": { section: "5B", type: "string", source: "system_managed", agent_writable: false },
  "inherited_ira_establishment_status_reason": { section: "5B", type: "string", source: "system_managed", agent_writable: false },

  // (legacy aliases — kept for backward compatibility with existing personas)
  "inherited_ira_provider_confirmation_initiated_at": { section: "5B", type: "string", source: "system_managed", agent_writable: false },
  "inherited_ira_provider_confirmation_confirmed_at": { section: "5B", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 5D — EDB conversation tracking + Suspension =============
  "edb.conversation_complete": { section: "5D", type: "boolean", source: "system_managed", agent_writable: true, note: "prototype-only" },
  "current_suspension_reason": { section: "5D", type: "enum", values: ["beneficiary_initiated", "kba_lockout", "death_cert_pending", "selfcert_pending", "election_deferred", "ops_escalation", "authorized_representative_docs_pending", "expiry_deadline_approaching"], source: "system_managed", agent_writable: false },
  "ops_escalation_active": { section: "5D", type: "boolean", source: "system_managed", agent_writable: false },
  "ops_escalation_reason": { section: "5D", type: "enum", values: ["kba_max_attempts", "death_cert_unresolvable", "authorized_representative_docs_incomplete", "system_error", "provider_requested"], source: "system_managed", agent_writable: false },

  // ============= Section 6A — Election (Track 1) =============
  "election.distribution_method": { section: "6A", type: "enum", values: ["life_expectancy", "10_year"], source: "collected", agent_writable: true },
  "election.declined": { section: "6A", type: "boolean", source: "collected", agent_writable: true },
  "spouse.path_chosen": { section: "6A", type: "string", source: "collected", agent_writable: true },
  "election_status": { section: "6B", type: "enum", values: ["not_yet_presented", "presented_pending", "affirmatively_deferred", "deadline_passed_default_applied", "elected"], source: "system_managed", agent_writable: false },
  "deferral_deadline_acknowledged": { section: "6B", type: "boolean", source: "collected", agent_writable: true },

  // ============= Section 6C-i — Distribution Requirements (Track 2) =============
  "distribution_requirements_presented": { section: "6C-i", type: "boolean", source: "system_managed", agent_writable: false },
  "distribution_requirements_acknowledged": { section: "6C-i", type: "boolean", source: "collected", agent_writable: true },
  "applicable_rule_communicated": { section: "6C-i", type: "enum", values: ["life_expectancy", "10_year", "10_year_with_annual_rmd", "5_year", "ghost_life_expectancy", "life_expectancy_until_majority_then_10_year", "see_through_trust_applicable_rule"], source: "system_managed", agent_writable: false },
  "separate_accounting_applicable": { section: "6C-i", type: "boolean", source: "computed", agent_writable: false },
  "separate_accounting_deadline": { section: "6C-i", type: "date", source: "system_managed", agent_writable: false },
  "separate_accounting_requirement_acknowledged": { section: "6C-i", type: "boolean", source: "collected", agent_writable: true },

  // ============= Section 6C-ii — Trustee Responsibility Disclosure (Track 3) =============
  "trustee_responsibility_disclosure.acknowledged": { section: "6C-ii", type: "boolean", source: "collected", agent_writable: true, note: "legacy dot-notation alias" },
  "trustee_responsibility_disclosure_applicable": { section: "6C-ii", type: "boolean", source: "computed", agent_writable: false },
  "trustee_responsibility_disclosure_presented": { section: "6C-ii", type: "boolean", source: "system_managed", agent_writable: false },
  "trustee_responsibility_disclosure_acknowledged": { section: "6C-ii", type: "boolean", source: "collected", agent_writable: true },
  "trustee_responsibility_disclosure_acknowledged_at": { section: "6C-ii", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 6D — Withdrawal Request Decision =============
  "withdrawal_request_decision_applicable": { section: "6D", type: "boolean", source: "computed", agent_writable: false },
  "withdrawal_request_presented": { section: "6D", type: "boolean", source: "system_managed", agent_writable: false },
  "withdrawal_request_decision": { section: "6D", type: "enum", values: ["proceed", "declined"], source: "collected", agent_writable: true },

  // ============= Section 6E — YOD RMD Disclosure (v1.12 six-field cluster) =============
  "yod_rmd.applicable": { section: "6E", type: "boolean", source: "computed", agent_writable: true, note: "legacy dot-notation alias for yod_rmd_disclosure_applicable" },
  "yod_rmd.disclosed": { section: "6E", type: "boolean", source: "system_managed", agent_writable: true, note: "legacy dot-notation alias for yod_rmd_disclosure_acknowledged" },
  "yod_rmd_disclosure_applicable": { section: "6E", type: "boolean", source: "computed", agent_writable: false },
  "yod_rmd_disclosure_presented": { section: "6E", type: "boolean", source: "system_managed", agent_writable: false },
  "yod_rmd_disclosure_presented_at": { section: "6E", type: "string", source: "system_managed", agent_writable: false },
  "yod_rmd_disclosure_content_ref": { section: "6E", type: "string", source: "system_managed", agent_writable: false },
  "yod_rmd_disclosure_acknowledged": { section: "6E", type: "boolean", source: "collected", agent_writable: true },
  "yod_rmd_disclosure_acknowledged_at": { section: "6E", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 6E — existing_ira_instruction lifecycle (v1.27 second cluster) =============
  "existing_ira_instruction_status": { section: "6E", type: "enum", values: ["pending_provider_confirmation", "pending_provider_confirmation_fallback_applied", "confirmed", "rejected", "implementation_error"], source: "system_managed", agent_writable: false },
  "existing_ira_instruction_status_pending_at": { section: "6E", type: "string", source: "system_managed", agent_writable: false },
  "existing_ira_instruction_status_confirmed_at": { section: "6E", type: "string", source: "system_managed", agent_writable: false },
  "existing_ira_instruction_status_fallback_applied_at": { section: "6E", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 7 — E-Sign =============
  "esign_all_complete": { section: "7", type: "boolean", source: "computed", agent_writable: false },
  "esign_last_completed_at": { section: "7", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 9A — Withdrawal Request Identity =============
  "withdrawal_request_id": { section: "9A", type: "string", source: "system_generated", agent_writable: false },
  "withdrawal_request_type": { section: "9A", type: "enum", values: ["lump_sum", "one_time", "standing"], source: "collected", agent_writable: true },
  "withdrawal_request_initiated_at": { section: "9A", type: "string", source: "system_managed", agent_writable: false },
  "withdrawal_path": { section: "9A", type: "enum", values: ["fast_lane_lump_sum", "educational_journey_natural_exit_lump_sum", "educational_journey_withdrawal_request"], source: "system_managed", agent_writable: false },

  // ============= Section 9B — Lump Sum =============
  "lumpsum_instruction": { section: "9B", type: "enum", values: ["distribute_entire_balance"], source: "system_managed", agent_writable: false },
  "lumpsum_instruction_confirmed": { section: "9B", type: "boolean", source: "collected", agent_writable: true },

  // ============= Section 9C — One-Time Withdrawal =============
  "onetime_amount_type": { section: "9C", type: "enum", values: ["dollar_amount", "percentage"], source: "collected", agent_writable: true },
  "onetime_amount": { section: "9C", type: "string", source: "collected", agent_writable: true },
  "onetime_amount_percentage": { section: "9C", type: "string", source: "collected", agent_writable: true },
  "onetime_amount_confirmed": { section: "9C", type: "boolean", source: "collected", agent_writable: true },
  "onetime_timing_preference": { section: "9C", type: "enum", values: ["as_soon_as_possible", "specific_date", "end_of_year"], source: "collected", agent_writable: true },
  "onetime_timing_preference_detail": { section: "9C", type: "string", source: "collected", agent_writable: true },

  // ============= Section 9D — Standing Withdrawal =============
  "standing_distribution_basis": { section: "9D", type: "enum", values: ["fixed_dollar", "fixed_percentage", "annual_rmd"], source: "collected", agent_writable: true },
  "standing_fixed_amount": { section: "9D", type: "string", source: "collected", agent_writable: true },
  "standing_fixed_percentage": { section: "9D", type: "string", source: "collected", agent_writable: true },
  "standing_frequency": { section: "9D", type: "enum", values: ["monthly", "quarterly", "semi_annual", "annual"], source: "collected", agent_writable: true },
  "standing_start_date": { section: "9D", type: "date", source: "collected", agent_writable: true },
  "standing_instruction_confirmed": { section: "9D", type: "boolean", source: "collected", agent_writable: true },

  // ============= Section 9E — Withholding =============
  "federal_withholding_election": { section: "9E", type: "enum", values: ["default_10_percent", "elected_amount", "waived"], source: "collected", agent_writable: true },
  "federal_withholding_percentage": { section: "9E", type: "string", source: "collected", agent_writable: true },
  "state_withholding_applicable": { section: "9E", type: "boolean", source: "computed", agent_writable: false },
  "state_withholding_mandatory": { section: "9E", type: "boolean", source: "computed", agent_writable: false },
  "state_withholding_default_rate": { section: "9E", type: "string", source: "computed", agent_writable: false },
  "state_withholding_state_label": { section: "9E", type: "string", source: "computed", agent_writable: false },
  "state_withholding_election": { section: "9E", type: "enum", values: ["default", "elected_amount", "waived", "not_applicable"], source: "collected", agent_writable: true },
  "state_withholding_percentage": { section: "9E", type: "string", source: "collected", agent_writable: true },
  "withdrawal_tax_disclosure_acknowledged": { section: "9E", type: "boolean", source: "collected", agent_writable: true },
  "withholding_election_confirmed": { section: "9E", type: "boolean", source: "collected", agent_writable: true },

  // ============= Section 9F — Withdrawal e-sign / handoff =============
  "withdrawal_esign_completed": { section: "9F", type: "boolean", source: "system_managed", agent_writable: false },
  "withdrawal_instruction_handoff_included": { section: "9F", type: "boolean", source: "system_managed", agent_writable: false },
  "custodian_notification_sent": { section: "9F", type: "boolean", source: "system_managed", agent_writable: false },

  // ============= Section 10A — Handoff Package =============
  "handoff_package_id": { section: "10A", type: "string", source: "system_generated", agent_writable: false },
  "handoff_package_type": { section: "10A", type: "enum", values: ["initial", "supplemental_election", "post_deadline_notification"], source: "system_managed", agent_writable: false },
  "handoff_package_generated": { section: "10A", type: "boolean", source: "system_managed", agent_writable: false },
  "handoff_package_generated_at": { section: "10A", type: "string", source: "system_managed", agent_writable: false },
  "handoff_package_transmitted": { section: "10A", type: "boolean", source: "system_managed", agent_writable: false },
  "handoff_package_transmitted_at": { section: "10A", type: "string", source: "system_managed", agent_writable: false },
  "handoff_package_acknowledged": { section: "10A", type: "boolean", source: "system_managed", agent_writable: false },
  "handoff_package_acknowledged_at": { section: "10A", type: "string", source: "system_managed", agent_writable: false },

  // ============= Section 10C — Outstanding Items =============
  "outstanding_items_exist": { section: "10C", type: "boolean", source: "computed", agent_writable: false },
  "outstanding_election_deferred": { section: "10C", type: "boolean", source: "computed", agent_writable: false },
  "outstanding_authorized_representative_docs": { section: "10C", type: "boolean", source: "computed", agent_writable: false },
  "outstanding_inherited_ira_establishment_confirmation": { section: "10C", type: "boolean", source: "computed", agent_writable: false },
  "outstanding_existing_ira_instruction_confirmation": { section: "10C", type: "boolean", source: "computed", agent_writable: false },

  // ============= Section 10E — Closure =============
  "session_formally_closed": { section: "10E", type: "boolean", source: "system_managed", agent_writable: false },
  "session_formally_closed_at": { section: "10E", type: "string", source: "system_managed", agent_writable: false },
  "session_closure_initiated_by": { section: "10E", type: "enum", values: ["end_state_reached", "expiry_deadline_passed", "ops_manual_closure", "provider_requested", "acknowledgment_timeout_fallback"], source: "system_managed", agent_writable: false },
  "provider_record_of_authority_confirmed": { section: "10E", type: "boolean", source: "system_managed", agent_writable: false },

  // ============= Section 10D — Handoff Reference =============
  "case.reference": { section: "10D", type: "string", source: "system_managed", agent_writable: true, note: "legacy alias for handoff package case reference" },

  // ============= Engine outputs (Section 4D — written by triage_engine) =============
  "engine.applicable_rule_set": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.election_eligible": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.election_track": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.election_options": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.election_deadline": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.asserted_rule": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.owner_rbd_status": { section: "2B", type: "string", source: "engine", agent_writable: false },
  "engine.owner_rbd_date": { section: "2B", type: "string", source: "engine", agent_writable: false },
  "engine.owner_rmd_attainment_year": { section: "2B", type: "string", source: "engine", agent_writable: false },
  "engine.distribution_window_end": { section: "4D", type: "string", source: "engine", agent_writable: false },
  "engine.annual_rmd_required": { section: "4D", type: "string", source: "engine", agent_writable: false }
};

/* ======================================================================
   VALID_END_STATES — exact enum from v1.5 Appendix.
   complete_session validates against this set.
   ====================================================================== */
const VALID_END_STATES = new Set([
  "lump_sum_in_good_order",
  "treat_as_own_path_a_instruction_captured",
  "treat_as_own_path_b_in_good_order",
  "treat_as_own_external_offramp",
  "inherited_ira_established_election_made",
  "inherited_ira_established_election_deferred",
  "inherited_ira_established_no_election_required",
  "inherited_ira_established_qst_handoff",
  "expired_no_resolution"
]);

const END_STATES_REQUIRING_PROVIDER_CONFIRM = new Set([
  "inherited_ira_established_election_made",
  "inherited_ira_established_election_deferred",
  "inherited_ira_established_no_election_required"
]);

/* ======================================================================
   PROVIDER_ATTENTION_ALERT_TYPES — Section 10B typed array values.
   The v1.5 schema's initial enum value is qst_selfcert_declined, with
   provision for additional alert_types as Gen 1 evolves.
   ====================================================================== */
const PROVIDER_ATTENTION_ALERT_TYPES = new Set([
  "qst_selfcert_declined",
  "qst_selfcert_completed",
  "yod_rmd_obligation_flag",
  "post_deadline_default_applied",
  "establishment_confirmation_timeout",
  "existing_ira_instruction_timeout",
  "handoff_acknowledgment_timeout"
]);

const PROVIDER_ATTENTION_ALERT_PRIORITIES = new Set(["informational", "attention", "urgent"]);

/* ======================================================================
   PHASE COMPUTATION & CAPABILITY MATRIX (Handoff §8.1)
   ====================================================================== */
function computePhase(session) {
  const g = session.state.gates;
  const passed = (id) => g[id] === "passed";

  if (session.state.completed) return "complete";
  // If election_resolution has cleared and a withdrawal decision is pending or in progress, phase is wrap (which exposes withdrawal tools).
  if (passed("election_resolution")) return "wrap";
  if (passed("triage")) return "election";
  if (passed("identity")) return "triage_prep";
  return "intake";
}

const CAPABILITY_MATRIX = {
  intake: ["update_field", "audit", "request_kba", "request_document_upload", "flag_for_ops", "suggest_chatbot"],
  triage_prep: ["update_field", "audit", "request_document_upload", "request_kba", "triage_engine", "flag_for_ops", "suggest_chatbot"],
  election: ["update_field", "audit", "present_template", "request_esign", "flag_for_ops", "suggest_chatbot"],
  wrap: ["update_field", "audit", "present_template", "request_esign", "append_provider_attention_alert", "complete_session", "flag_for_ops", "suggest_chatbot"],
  complete: ["audit"]
};

function getAvailableTools(session) {
  const phase = computePhase(session);
  const allowed = new Set(CAPABILITY_MATRIX[phase] || []);
  return TOOL_DEFS.filter((t) => allowed.has(t.name));
}

/* ======================================================================
   TOOL DEFINITIONS
   ====================================================================== */
const TOOL_DEFS = [
  {
    name: "update_field",
    description:
      "Propose a session-state field value. Path must be a registered canonical field; check beneficiary/election/withdrawal field names against the schema (Sections 1-10). Value is a string. The orchestrator validates against CANONICAL_FIELDS (path registration, type, enum, agent_writable flag) and writes; system-managed fields and engine outputs are not agent-writable.",
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
    description: "Append a system-of-record entry. Brief, professional, past-tense.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"]
    }
  },
  {
    name: "triage_engine",
    description:
      "Call the deterministic triage engine. Provide the five-field input package: ira_type, owner_dob, owner_dod, beneficiary_dob, beneficiary_classification. After it returns you MUST present the result via present_template('engine_report', {...}) before any free-text discussion of what it means.",
    input_schema: {
      type: "object",
      properties: {
        ira_type: { type: "string", enum: ["traditional", "roth"] },
        owner_dob: { type: "string" },
        owner_dod: { type: "string" },
        beneficiary_dob: { type: "string" },
        beneficiary_classification: {
          type: "string",
          enum: ["spouse", "edb_minor_child", "edb_age_gap", "edb_disabled", "edb_chronic_illness", "non_edb_person", "non_edb_nonperson", "qualified_see_through_trust"]
        }
      },
      required: ["ira_type", "owner_dob", "owner_dod", "beneficiary_dob", "beneficiary_classification"]
    }
  },
  {
    name: "request_kba",
    description: "Present a knowledge-based authentication challenge.",
    input_schema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"]
    }
  },
  {
    name: "request_document_upload",
    description: "Present an in-chat document upload prompt with realistic file names. Pauses until the user submits.",
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
    description: "Present an e-signature form. After the user signs, the orchestrator marks session.esign_complete automatically.",
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
      "Emit a structured, templated communication. ONLY channel for substantive structured output. Available templates: 'engine_report', 'distribution_requirements_track2', 'trustee_responsibility_disclosure_track3', 'wrap_track1_election_made', 'wrap_track2_no_election', 'wrap_track3_qst_handoff', 'withdrawal_options', 'withdrawal_lumpsum_form', 'withdrawal_onetime_form', 'withdrawal_standing_form', 'withdrawal_withholding_disclosure', 'withdrawal_wrap', 'yod_rmd_disclosure'. After triage_engine, you MUST call present_template('engine_report'). For Section 6E YOD RMD, use 'yod_rmd_disclosure'. For withdrawals (Section 9), use the withdrawal_* sequence.",
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
            "wrap_track3_qst_handoff",
            "withdrawal_options",
            "withdrawal_lumpsum_form",
            "withdrawal_onetime_form",
            "withdrawal_standing_form",
            "withdrawal_withholding_disclosure",
            "withdrawal_wrap",
            "yod_rmd_disclosure"
          ]
        },
        variables: { type: "object", additionalProperties: { type: "string" } }
      },
      required: ["template_id"]
    }
  },
  {
    name: "append_provider_attention_alert",
    description:
      "Append a typed alert to provider_attention_alerts (Section 10B). Each alert has alert_type, alert_priority, and a human-readable alert_message. Use for: qst_selfcert_completed, qst_selfcert_declined, yod_rmd_obligation_flag, post_deadline_default_applied, and other session-specific conditions surfaced for provider attention.",
    input_schema: {
      type: "object",
      properties: {
        alert_type: {
          type: "string",
          enum: ["qst_selfcert_declined", "qst_selfcert_completed", "yod_rmd_obligation_flag", "post_deadline_default_applied", "establishment_confirmation_timeout", "existing_ira_instruction_timeout", "handoff_acknowledgment_timeout"]
        },
        alert_priority: { type: "string", enum: ["informational", "attention", "urgent"] },
        alert_message: { type: "string" }
      },
      required: ["alert_type", "alert_priority", "alert_message"]
    }
  },
  {
    name: "flag_for_ops",
    description: "Escalate to provider operations.",
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
    description: "Suggest the user open the help assistant for a general rules question.",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"]
    }
  },
  {
    name: "complete_session",
    description:
      "Finalize the session with an end_state. The orchestrator validates against the v1.5 Appendix enum. For inherited_ira_established_election_made, _election_deferred, and _no_election_required, the orchestrator marks pending_provider_confirmation per Schema v1.27 lifecycle. The orchestrator generates the structured handoff package on completion (visible via the outro).",
    input_schema: {
      type: "object",
      properties: {
        end_state: {
          type: "string",
          enum: [
            "lump_sum_in_good_order",
            "treat_as_own_path_a_instruction_captured",
            "treat_as_own_path_b_in_good_order",
            "treat_as_own_external_offramp",
            "inherited_ira_established_election_made",
            "inherited_ira_established_election_deferred",
            "inherited_ira_established_no_election_required",
            "inherited_ira_established_qst_handoff",
            "expired_no_resolution"
          ]
        }
      },
      required: ["end_state"]
    }
  }
];

/* ======================================================================
   TEMPLATE LIBRARY
   ====================================================================== */
const TEMPLATES = {
  engine_report: ({ classification, applicable_rule, election_eligible, election_options, election_deadline, distribution_window_end, owner_rbd_status, owner_rbd_date, annual_rmd_required, beneficiary_name, election_track }) => {
    const lines = [
      `**Classification:** ${classification || "—"}`,
      `**Election track:** ${election_track || "—"}`,
      `**Owner RBD status:** ${owner_rbd_status || "—"}${owner_rbd_date ? `  ·  RBD: ${owner_rbd_date}` : ""}`,
      `**Applicable rule:** ${applicable_rule || "—"}`,
      `**Election eligibility:** ${election_eligible || "—"}`
    ];
    if (election_options && election_options !== "(none)") lines.push(`**Distribution options:** ${election_options}`);
    if (election_deadline && election_deadline !== "(n/a)") lines.push(`**Election deadline:** ${election_deadline}`);
    if (distribution_window_end && distribution_window_end !== "(n/a)") lines.push(`**Distribution window ends:** ${distribution_window_end}`);
    if (annual_rmd_required) lines.push(`**Annual RMD required during window:** ${annual_rmd_required}`);
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
    body: `As the beneficiary of this inherited IRA, the following distribution rule applies based on the triage engine's classification:

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
- You'll receive an email confirmation shortly.`,
    bullets: []
  }),

  wrap_track2_no_election: ({ asserted_rule, beneficiary_name }) => ({
    title: "Confirmation",
    body: `All set${beneficiary_name ? `, ${beneficiary_name}` : ""}.

The applicable rule for your inherited IRA is **${asserted_rule || "as determined by the triage engine"}** — asserted by the rules, not elected.

Next steps:
- The provider will retitle the account and set up your distribution schedule.
- A confirmation package is being transmitted to the provider for implementation.
- The case will reach "in good order" status once the provider acknowledges receipt (Schema v1.27 — provider confirmation lifecycle).`,
    bullets: []
  }),

  wrap_track3_qst_handoff: ({ trust_name, case_ref }) => ({
    title: "Confirmation — Track 3 (QST Handoff)",
    body: `Done.

${trust_name || "The trust"} has been recorded as the beneficiary of record. The inherited IRA is being established. The provider has been notified via the system's structured provider-attention channel and will reach out to determine the applicable rule and any election handling out-of-system.

Case reference: ${case_ref || "[case_ref]"}.

The provider's trust review team will follow up shortly.`,
    bullets: []
  }),

  yod_rmd_disclosure: ({ owner_name, beneficiary_name }) => ({
    title: "Year-of-Death RMD Disclosure (Section 6E)",
    body: `**Year-of-Death RMD Disclosure**

${owner_name || "The original IRA owner"} was past their Required Beginning Date (RBD) at the time of death. Under IRS rules, an RMD obligation for the year of death applies to this Traditional IRA.

**What this means:**
- An RMD for ${owner_name || "the owner"} is owed for the year of death.
- If ${owner_name || "the owner"} did not satisfy that RMD before passing, the obligation transfers to ${beneficiary_name || "the beneficiary"} and must be satisfied before any rollover, transfer, or treat-as-own conversion.
- The provider will reconcile the RMD position from the account's distribution history and notify you of any shortfall or payment owed.

**Convergent's role here is limited to disclosure.** The system does not calculate the RMD amount or process the payment — that is the provider's role, in coordination with you.

By acknowledging, you confirm receipt of this disclosure. The disclosure does not constitute tax advice.`,
    bullets: [
      "YOD RMD applies (Traditional IRA + owner past RBD)",
      "Obligation transfers to beneficiary if not satisfied",
      "Provider reconciles from account history",
      "Convergent's role is disclosure only — not calculation or payment"
    ]
  }),

  withdrawal_options: ({ beneficiary_name }) => ({
    title: "Withdrawal Setup — Options",
    body: `Before we close out, you have the option to set up withdrawals from this inherited IRA now, or skip and let the provider handle distributions on the asserted/elected schedule.

**Three options for active withdrawal setup:**

1. **Lump Sum** — distribute the entire balance now. (One-time, full account close-out.)
2. **One-Time Withdrawal** — take a specific dollar amount or percentage now, leaving the remainder in the inherited IRA on its schedule.
3. **Standing Withdrawal** — set up a recurring distribution (monthly, quarterly, etc.) on a fixed amount, fixed percentage, or annual RMD basis.

**You can also skip** — decline withdrawal setup, and the provider will handle distributions per the schedule we established. You can come back later through the provider's normal withdrawal request process.

Which would you like? (Or skip?)`,
    bullets: [
      "Lump Sum — full account distribution",
      "One-Time — specific amount now",
      "Standing — recurring distributions",
      "Skip — decline withdrawal setup"
    ]
  }),

  withdrawal_lumpsum_form: ({ ira_balance, beneficiary_name }) => ({
    title: "Lump Sum Withdrawal Instruction",
    body: `**Lump Sum Distribution Confirmation**

You are instructing the provider to distribute the entire balance of this inherited IRA${ira_balance ? ` (currently ${ira_balance})` : ""} as a one-time lump sum payment to ${beneficiary_name || "you"}.

**Important implications:**
- The full balance becomes taxable as ordinary income in the year of distribution.
- This closes out the inherited IRA — the account will be terminated after the distribution settles.
- Withholding (federal and any applicable state) will be applied per your withholding election on the next screen.
- Convergent does not provide tax advice; consult a tax advisor for personal planning around lump sum tax impact.

By confirming, you authorize the provider to execute this lump sum distribution.`,
    bullets: [
      `Distribute entire balance${ira_balance ? `: ${ira_balance}` : ""}`,
      "Account closes after distribution settles",
      "Full balance taxable as ordinary income",
      "Withholding election applied (next step)"
    ]
  }),

  withdrawal_onetime_form: ({ amount_type, amount, percentage, timing, beneficiary_name }) => {
    const amountText = amount_type === "percentage"
      ? `${percentage || "[percentage]"}% of the inherited IRA balance`
      : `$${amount || "[amount]"}`;
    const timingText = {
      as_soon_as_possible: "as soon as the provider can process",
      specific_date: "on a specific date you've indicated",
      end_of_year: "by year-end"
    }[timing] || timing || "as scheduled";
    return {
      title: "One-Time Withdrawal Instruction",
      body: `**One-Time Withdrawal Confirmation**

You are instructing the provider to distribute **${amountText}** from this inherited IRA, ${timingText}.

**Implications:**
- The withdrawn portion becomes taxable as ordinary income in the year of distribution.
- The remainder stays in the inherited IRA on the established distribution schedule.
- Withholding (federal and any applicable state) applies — election on the next screen.
- This is a one-time instruction; no further automatic withdrawals will occur from this request.`,
      bullets: [
        `Distribution: ${amountText}`,
        `Timing: ${timingText}`,
        "Remainder stays on schedule",
        "Withholding election applied (next step)"
      ]
    };
  },

  withdrawal_standing_form: ({ basis, frequency, start_date, fixed_amount, fixed_percentage, beneficiary_name }) => {
    const basisText = {
      fixed_dollar: `a fixed dollar amount${fixed_amount ? ` of $${fixed_amount}` : ""}`,
      fixed_percentage: `a fixed percentage${fixed_percentage ? ` of ${fixed_percentage}%` : ""} of the account balance`,
      annual_rmd: `the annual Required Minimum Distribution`
    }[basis] || basis || "[basis]";
    return {
      title: "Standing Withdrawal Instruction",
      body: `**Standing Withdrawal Confirmation**

You are setting up a recurring withdrawal from this inherited IRA on the following terms:

- **Basis:** ${basisText}
- **Frequency:** ${frequency || "[frequency]"}
- **Start date:** ${start_date || "[start_date]"}

**Implications:**
- Distributions will be processed automatically on the schedule above until you cancel or modify the instruction.
- Each distribution becomes taxable as ordinary income in the year received.
- Withholding (federal and any applicable state) applies to each distribution per your election on the next screen.
- You can change or cancel this standing instruction at any time through your provider.`,
      bullets: [
        `Basis: ${basisText}`,
        `Frequency: ${frequency || "—"}`,
        `Start date: ${start_date || "—"}`,
        "Recurring until cancelled"
      ]
    };
  },

  withdrawal_withholding_disclosure: (vars) => {
    const {
      federal_election, federal_pct,
      state_applicable, state_mandatory, state_default_rate_pct,
      state_label, state_note, state_known,
      state_election, state_pct, beneficiary_name
    } = vars;
    const truthy = (v) => v === true || v === "true";
    const stateApplies = truthy(state_applicable);
    const stateMandatory = truthy(state_mandatory);
    const stateKnown = truthy(state_known);
    const fedLabel = federal_election === "default_10_percent" ? "Default (10%)"
      : federal_election === "elected_amount" ? `Elected: ${federal_pct || "—"}%`
      : federal_election === "waived" ? "Waived"
      : "—";
    let stateBlock;
    if (!stateKnown) {
      stateBlock = `**State (${state_label || "—"}):** ${state_note || "Beneficiary state not yet collected; state withholding cannot be determined."}`;
    } else if (!stateApplies) {
      stateBlock = `**State (${state_label || "—"}):** Not applicable. ${state_note || ""}`;
    } else {
      const electionDisplay = state_election === "default" ? `Default rate (${state_default_rate_pct || "—"})`
        : state_election === "elected_amount" ? `Elected: ${state_pct || "—"}%`
        : state_election === "waived" ? "Waived"
        : "Not yet selected";
      stateBlock = `**State (${state_label || "—"}):** ${state_note || ""}\nDefault rate: ${state_default_rate_pct || "—"}.\n${stateMandatory ? "Withholding is **mandatory** when federal withholding applies in this state." : "Withholding is **voluntary** in this state — you may elect or waive."}\nYour election: ${electionDisplay}`;
    }
    return {
      title: "Withholding Election — Federal & State",
      body: `**Withholding Election**

Federal and (where applicable) state income tax withholding apply to this withdrawal. You may elect default rates, a specific elected amount, or — where allowed — waive withholding entirely.

**Federal:** ${fedLabel}

${stateBlock}

**Important:** Withholding is a prepayment of taxes you owe; it does not change your total tax liability. If your actual tax liability differs from the amount withheld, you'll either receive a refund or owe additional tax at filing time. Consult a tax advisor for personal planning.

By acknowledging, you confirm your withholding election. The election is included in the withdrawal instruction transmitted to the provider.`,
      bullets: [
        `Federal: ${federal_election || "—"}${federal_pct ? ` (${federal_pct}%)` : ""}`,
        stateKnown ? (stateApplies ? `State (${state_label}): ${state_election || "not yet selected"} · default ${state_default_rate_pct}` : `State (${state_label}): not applicable`) : `State: not yet collected`,
        "Withholding is a prepayment, not a tax change",
        "Consult a tax advisor for personal planning"
      ]
    };
  },

  withdrawal_wrap: ({ withdrawal_type, beneficiary_name, ira_balance }) => {
    const typeLabel = {
      lump_sum: "lump sum distribution",
      one_time: "one-time withdrawal",
      standing: "standing (recurring) withdrawal instruction"
    }[withdrawal_type] || "withdrawal";
    return {
      title: "Withdrawal Confirmation",
      body: `**Withdrawal Set Up**

Your ${typeLabel} has been recorded${beneficiary_name ? ` for ${beneficiary_name}` : ""} and signed.

**What happens next:**
- The withdrawal instruction is included in the handoff package being transmitted to the provider.
- The provider will execute the distribution per the instruction, applying your withholding election.
- For standing instructions, the recurrence runs until you cancel or modify it through the provider.
- You'll receive distribution confirmations via your normal account communications channel.

The session will close after the provider confirms receipt of the handoff package (Schema v1.27 lifecycle).`,
      bullets: [
        `${typeLabel} recorded`,
        "Instruction included in handoff package",
        "Provider executes per the instruction",
        "Confirmations via normal account comms"
      ]
    };
  }
};

function renderTemplate(templateId, variables = {}) {
  const fn = TEMPLATES[templateId];
  if (!fn) return { title: "Unknown template", body: "(template not found)", bullets: [] };
  return fn(variables);
}

/* ======================================================================
   FIELD VALIDATION
   ====================================================================== */
function validateField(path, value) {
  const def = CANONICAL_FIELDS[path];
  if (!def) {
    return { ok: false, reason: `Unregistered path '${path}'. Use a canonical field name from the schema.` };
  }
  if (def.agent_writable === false) {
    return { ok: false, reason: `Field '${path}' is system-managed (source: ${def.source}). The agent does not write this field directly.` };
  }
  if (def.type === "enum" && Array.isArray(def.values) && !def.values.includes(value)) {
    return { ok: false, reason: `Value '${value}' not in enum for ${path}. Allowed: ${def.values.join(", ")}.` };
  }
  if (def.type === "boolean" && !["true", "false"].includes(value)) {
    return { ok: false, reason: `Field '${path}' is boolean; value must be 'true' or 'false'.` };
  }
  if (def.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, reason: `Field '${path}' is a date; value must be YYYY-MM-DD.` };
  }
  return { ok: true };
}

/* ======================================================================
   GATE EVALUATION
   ====================================================================== */
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

/* ======================================================================
   HANDOFF PACKAGE GENERATION (Schema Section 10A)
   ====================================================================== */
function generateHandoffPackage(session) {
  const ts = new Date().toISOString();
  const f = session.state.fields;
  const pkg = {
    handoff_package_id: `pkg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    handoff_package_type: "initial",
    handoff_package_version: "1.5",
    generated_at: ts,
    transmission_method: "webhook",
    session: {
      provider: f["session.provider"],
      session_end_state: session.state.endState,
      session_end_state_in_good_order: session.state.fields["inherited_ira_establishment_status"] === "confirmed" || (!END_STATES_REQUIRING_PROVIDER_CONFIRM.has(session.state.endState))
    },
    ira_account: {
      type: f["ira.type"],
      balance: f["ira.balance"],
      owner_name: f["owner.name"],
      owner_dob: f["owner.dob"],
      owner_dod: f["owner.dod"]
    },
    beneficiary: {
      name: f["beneficiary.name"] || f["beneficiary.name (Subject)"],
      dob: f["beneficiary.dob"],
      relationship: f["beneficiary.relationship"],
      type: f["beneficiary.type"],
      classification: f["beneficiary.classification"]
    },
    actor: f["actor.name (Operator, 3D)"] ? {
      name: f["actor.name (Operator, 3D)"],
      role: f["actor.role"],
      relationship_to_subject: f["actor.relationship_to_subject"]
    } : null,
    verification: {
      identity: f["verification.identity"],
      death_cert: f["verification.death_cert"]
    },
    triage_engine_output: session.state.engine && session.state.engine.result && session.state.engine.result.ok
      ? session.state.engine.result.output_package
      : null,
    election: {
      track: f["engine.election_track"],
      method: f["election.distribution_method"] || null,
      spouse_path: f["spouse.path_chosen"] || null,
      declined: f["election.declined"] === "true"
    },
    yod_rmd: (f["yod_rmd_disclosure_applicable"] === "true" || f["yod_rmd.applicable"] === "true") ? {
      applicable: true,
      disclosure_acknowledged: f["yod_rmd_disclosure_acknowledged"] === "true" || f["yod_rmd.disclosed"] === "true",
      disclosure_acknowledged_at: f["yod_rmd_disclosure_acknowledged_at"] || null
    } : null,
    withdrawal_request: f["withdrawal_request_type"] ? {
      id: f["withdrawal_request_id"],
      type: f["withdrawal_request_type"],
      lumpsum_confirmed: f["lumpsum_instruction_confirmed"] === "true",
      onetime: f["withdrawal_request_type"] === "one_time" ? {
        amount_type: f["onetime_amount_type"],
        amount: f["onetime_amount"] || null,
        percentage: f["onetime_amount_percentage"] || null,
        timing: f["onetime_timing_preference"]
      } : null,
      standing: f["withdrawal_request_type"] === "standing" ? {
        basis: f["standing_distribution_basis"],
        fixed_amount: f["standing_fixed_amount"] || null,
        fixed_percentage: f["standing_fixed_percentage"] || null,
        frequency: f["standing_frequency"],
        start_date: f["standing_start_date"]
      } : null,
      withholding: {
        federal: f["federal_withholding_election"],
        federal_percentage: f["federal_withholding_percentage"] || null,
        state: f["state_withholding_election"] || "not_applicable",
        state_percentage: f["state_withholding_percentage"] || null
      }
    } : null,
    trust: f["trust.name"] ? {
      name: f["trust.name"],
      trustee_type: f["trustee_type"] || "individual_trustee",
      selfcert_status: f["selfcert.trust_status"] || null,
      trustee_responsibility_disclosure_acknowledged: f["trustee_responsibility_disclosure.acknowledged"] === "true" || f["trustee_responsibility_disclosure_acknowledged"] === "true"
    } : null,
    establishment_lifecycle: f["inherited_ira_establishment_status"] ? {
      status: f["inherited_ira_establishment_status"],
      pending_at: f["inherited_ira_establishment_status_pending_at"] || f["inherited_ira_provider_confirmation_initiated_at"] || null,
      confirmed_at: f["inherited_ira_establishment_status_confirmed_at"] || f["inherited_ira_provider_confirmation_confirmed_at"] || null,
      fallback_applied_at: f["inherited_ira_establishment_status_fallback_applied_at"] || null
    } : null,
    provider_attention_alerts: session.state.providerAttentionAlerts || [],
    audit_log: session.state.audit.slice(0, 50),
    case_reference: f["case.reference"] || null
  };
  return pkg;
}

/* ======================================================================
   PROVIDER CONFIRMATION LIFECYCLE (v1.27)
   ====================================================================== */
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
  session.state.fields["inherited_ira_establishment_status_confirmed_at"] = ts;
  // legacy alias
  session.state.fields["inherited_ira_provider_confirmation_confirmed_at"] = ts;
  session.state.fields["session_end_state_in_good_order"] = "true";
  events.push({ type: "state_update", path: "inherited_ira_establishment_status", value: "confirmed" });
  events.push({ type: "state_update", path: "inherited_ira_establishment_status_confirmed_at", value: ts });
  events.push({ type: "state_update", path: "session_end_state_in_good_order", value: "true" });
  const auditEntry = { time: nowStamp(), text: `Provider acknowledged establishment package — case marked confirmed (in good order).` };
  session.state.audit.unshift(auditEntry);
  events.push({ type: "audit_add", text: auditEntry.text, time: auditEntry.time });
  return { ok: true, events };
}

function applyConfirmationTimeoutFallback(session) {
  const events = [];
  if (!session.state.completed) {
    return { ok: false, reason: "Session not yet completed.", events };
  }
  if (!END_STATES_REQUIRING_PROVIDER_CONFIRM.has(session.state.endState)) {
    return { ok: false, reason: "End state does not require provider confirmation.", events };
  }
  const currentStatus = session.state.fields["inherited_ira_establishment_status"];
  if (currentStatus !== "pending_provider_confirmation") {
    return { ok: false, reason: `Cannot apply fallback from status '${currentStatus}'.`, events };
  }
  const ts = new Date().toISOString();
  session.state.fields["inherited_ira_establishment_status"] = "pending_provider_confirmation_fallback_applied";
  session.state.fields["inherited_ira_establishment_status_fallback_applied_at"] = ts;
  events.push({ type: "state_update", path: "inherited_ira_establishment_status", value: "pending_provider_confirmation_fallback_applied" });
  events.push({ type: "state_update", path: "inherited_ira_establishment_status_fallback_applied_at", value: ts });

  // Record provider_attention_alert for the timeout
  appendProviderAttentionAlert(session, {
    alert_type: "establishment_confirmation_timeout",
    alert_priority: "urgent",
    alert_message: "Provider acknowledgment grace period expired without confirmation. Corrective package re-pushed; case awaits manual resolution by provider ops."
  });
  events.push({ type: "alert_appended", alert_type: "establishment_confirmation_timeout" });

  const auditEntry = { time: nowStamp(), text: "Provider confirmation grace period expired — fallback applied; corrective package re-transmitted; provider attention alert raised." };
  session.state.audit.unshift(auditEntry);
  events.push({ type: "audit_add", text: auditEntry.text, time: auditEntry.time });
  return { ok: true, events };
}

/* ======================================================================
   PROVIDER ATTENTION ALERTS (Section 10B typed array)
   ====================================================================== */
function appendProviderAttentionAlert(session, { alert_type, alert_priority, alert_message }) {
  if (!session.state.providerAttentionAlerts) {
    session.state.providerAttentionAlerts = [];
  }
  const alert = {
    alert_id: `alert_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    alert_type,
    alert_priority,
    alert_message,
    alert_raised_at: new Date().toISOString()
  };
  session.state.providerAttentionAlerts.push(alert);
  return alert;
}

/* ======================================================================
   E-SIGN COMPLETION SIGNAL
   ====================================================================== */
function markEsignComplete(session) {
  session.state.fields["session.esign_complete"] = "true";
  session.state.fields["esign_all_complete"] = "true";
  session.state.fields["esign_last_completed_at"] = new Date().toISOString();
  const events = [
    { type: "state_update", path: "session.esign_complete", value: "true" },
    { type: "state_update", path: "esign_all_complete", value: "true" }
  ];
  events.push(...evaluateGates(session));
  return events;
}

/* ======================================================================
   EXECUTOR
   ====================================================================== */
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

      // Side-effects: state-dependent computed fields auto-populate when their
      // inputs change. The agent does not write these — the orchestrator does.
      if (path === "beneficiary.state" || path === "federal_withholding_election") {
        const stateCode = path === "beneficiary.state" ? value : session.state.fields["beneficiary.state"];
        const fedElection = path === "federal_withholding_election" ? value : session.state.fields["federal_withholding_election"];
        if (stateCode) {
          const computed = computeStateWithholding(stateCode, fedElection);
          const sideEffects = {
            "state_withholding_applicable": String(computed.applicable),
            "state_withholding_mandatory": String(computed.mandatory),
            "state_withholding_default_rate": computed.default_rate_pct,
            "state_withholding_state_label": computed.state_label
          };
          for (const [k, v] of Object.entries(sideEffects)) {
            if (session.state.fields[k] !== v) {
              session.state.fields[k] = v;
              events.push({ type: "state_update", path: k, value: v });
            }
          }
        }
      }
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
      // Variable enrichment: for templates whose substantive content is
      // state-dependent or engine-dependent, the orchestrator overrides
      // any agent-provided variables with values pulled from canonical
      // session state. This prevents the agent from fabricating content
      // (state-specific tax rules, engine outputs) in template variables.
      let variables = { ...(input.variables || {}) };
      if (input.template_id === "engine_report") {
        if (session.state.engine && session.state.engine.result && session.state.engine.result.ok) {
          const out = session.state.engine.result.output_package;
          variables = {
            ...variables,
            classification: session.state.fields["beneficiary.classification"] || variables.classification || "—",
            applicable_rule: out.applicable_rule_set || "—",
            election_eligible: out.election_eligible || "—",
            election_options: (out.election_options || []).join(", ") || "(none)",
            election_deadline: out.election_deadline || "(n/a)",
            distribution_window_end: out.distribution_window_end || "(n/a)",
            owner_rbd_status: out.owner_rbd_status || "—",
            owner_rbd_date: out.owner_rbd_date || "—",
            annual_rmd_required: String(out.annual_rmd_required),
            election_track: out.election_track || "—",
            beneficiary_name: variables.beneficiary_name
              || session.state.fields["beneficiary.name"]
              || session.state.fields["beneficiary.name (Subject)"]
              || ""
          };
        }
      }
      if (input.template_id === "withdrawal_withholding_disclosure") {
        const state = session.state.fields["beneficiary.state"];
        const fedElection = session.state.fields["federal_withholding_election"];
        const fedPct = session.state.fields["federal_withholding_percentage"];
        const computed = computeStateWithholding(state, fedElection);
        variables = {
          ...variables,
          federal_election: fedElection || variables.federal_election || "—",
          federal_pct: fedPct || variables.federal_pct,
          state_applicable: computed.applicable,
          state_mandatory: computed.mandatory,
          state_default_rate_pct: computed.default_rate_pct,
          state_label: computed.state_label,
          state_note: computed.state_note,
          state_known: computed.known_state,
          state_election: session.state.fields["state_withholding_election"] || variables.state_election,
          state_pct: session.state.fields["state_withholding_percentage"] || variables.state_pct,
          beneficiary_name: variables.beneficiary_name
            || session.state.fields["beneficiary.name"]
            || session.state.fields["beneficiary.name (Subject)"]
            || ""
        };
      }
      const rendered = renderTemplate(input.template_id, variables);
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

    case "append_provider_attention_alert": {
      const { alert_type, alert_priority, alert_message } = input;
      if (!PROVIDER_ATTENTION_ALERT_TYPES.has(alert_type)) {
        result = `REJECTED: alert_type '${alert_type}' not in registered enum.`;
        break;
      }
      if (!PROVIDER_ATTENTION_ALERT_PRIORITIES.has(alert_priority)) {
        result = `REJECTED: alert_priority '${alert_priority}' not in registered enum.`;
        break;
      }
      const alert = appendProviderAttentionAlert(session, { alert_type, alert_priority, alert_message });
      events.push({ type: "alert_appended", alert });
      result = `Alert appended (${alert_type}, ${alert_priority}).`;
      mutated = true;
      break;
    }

    case "flag_for_ops": {
      session.state.fields["session.escalated"] = "true";
      session.state.fields["session.escalation_reason"] = input.reason;
      session.state.fields["ops_escalation_active"] = "true";
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
      result = `User pointed to help assistant for: ${input.topic}.`;
      break;
    }

    case "complete_session": {
      const endState = input.end_state;
      if (!VALID_END_STATES.has(endState)) {
        result = `REJECTED: end_state '${endState}' not in v1.5 Appendix enum. Valid: ${[...VALID_END_STATES].join(", ")}.`;
        break;
      }
      session.state.completed = true;
      session.state.endState = endState;
      session.state.fields["session.status"] = "completed";
      session.state.fields["session_end_state"] = endState;
      events.push({ type: "state_update", path: "session.status", value: "completed" });
      events.push({ type: "state_update", path: "session_end_state", value: endState });
      events.push({ type: "session_complete", end_state: endState });

      // v1.27 lifecycle for the three "established" end states
      if (END_STATES_REQUIRING_PROVIDER_CONFIRM.has(endState)) {
        const ts = new Date().toISOString();
        session.state.fields["inherited_ira_establishment_status"] = "pending_provider_confirmation";
        session.state.fields["inherited_ira_establishment_status_pending_at"] = ts;
        // legacy alias
        session.state.fields["inherited_ira_provider_confirmation_initiated_at"] = ts;
        session.state.fields["session_end_state_in_good_order"] = "false";
        events.push({ type: "state_update", path: "inherited_ira_establishment_status", value: "pending_provider_confirmation" });
        events.push({ type: "state_update", path: "inherited_ira_establishment_status_pending_at", value: ts });
        events.push({ type: "state_update", path: "session_end_state_in_good_order", value: "false" });
        const noteEntry = { time: nowStamp(), text: "Establishment package transmitted; awaiting provider confirmation (Schema v1.27 lifecycle)." };
        session.state.audit.unshift(noteEntry);
        events.push({ type: "audit_add", text: noteEntry.text, time: noteEntry.time });
      } else {
        session.state.fields["session_end_state_in_good_order"] = "true";
        events.push({ type: "state_update", path: "session_end_state_in_good_order", value: "true" });
      }

      // Generate handoff package (Section 10A)
      const pkg = generateHandoffPackage(session);
      session.state.handoffPackage = pkg;
      session.state.fields["handoff_package_id"] = pkg.handoff_package_id;
      session.state.fields["handoff_package_type"] = "initial";
      session.state.fields["handoff_package_generated"] = "true";
      session.state.fields["handoff_package_generated_at"] = pkg.generated_at;
      session.state.fields["handoff_package_transmitted"] = "true";
      session.state.fields["handoff_package_transmitted_at"] = pkg.generated_at;
      events.push({ type: "handoff_package_generated", package_id: pkg.handoff_package_id });
      const pkgEntry = { time: nowStamp(), text: `Handoff package ${pkg.handoff_package_id} generated and transmitted to ${pkg.session.provider}.` };
      session.state.audit.unshift(pkgEntry);
      events.push({ type: "audit_add", text: pkgEntry.text, time: pkgEntry.time });

      // Closure record (Section 10E)
      session.state.fields["session_formally_closed"] = "true";
      session.state.fields["session_formally_closed_at"] = new Date().toISOString();
      session.state.fields["session_closure_initiated_by"] = "end_state_reached";
      events.push({ type: "state_update", path: "session_formally_closed", value: "true" });

      mutated = true;
      result = "Session marked complete. Handoff package generated and transmitted.";
      break;
    }

    default:
      result = `Unknown tool: ${toolName}`;
  }

  if (mutated) {
    const gateEvents = evaluateGates(session);
    events.push(...gateEvents);
  }

  return { result, events, halt };
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
  VALID_END_STATES,
  END_STATES_REQUIRING_PROVIDER_CONFIRM,
  PROVIDER_ATTENTION_ALERT_TYPES,
  executeTool,
  evaluateGates,
  computePhase,
  getAvailableTools,
  renderTemplate,
  validateField,
  markEsignComplete,
  markProviderConfirmed,
  applyConfirmationTimeoutFallback,
  generateHandoffPackage,
  appendProviderAttentionAlert
};
