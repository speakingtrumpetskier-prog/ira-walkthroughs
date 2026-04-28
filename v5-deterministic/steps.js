/* ======================================================================
   STEP STATE MACHINE — v5 deterministic
   ======================================================================
   The form-driven analog of v4's conversational agent. getCurrentStep
   inspects session state and returns the step descriptor the user should
   see right now. handleSubmit accepts the user's form data, applies the
   appropriate runAction calls (update_field, triage_engine,
   complete_session, etc.), and the front-end re-fetches getCurrentStep
   to render the next form.

   No LLM is involved in driving the workflow. The chatbot is invokable
   from any step as inline help; it's scoped to general rules only and
   does not write to session state.
   ====================================================================== */

const {
  executeTool,
  evaluateGates,
  computePhase,
  renderTemplate,
  generateHandoffPackage,
  appendProviderAttentionAlert
} = require("./tools");

const { computeStateWithholding } = require("./backend/state-withholding");

/* ======================================================================
   UI-STATE TRACKING
   ====================================================================== */
function ensureUiState(session) {
  if (!session.state.uiAcks) session.state.uiAcks = {};
  if (!session.state.welcomeAcked) session.state.welcomeAcked = false;
}

function ack(session, key) {
  ensureUiState(session);
  session.state.uiAcks[key] = true;
}

function isAcked(session, key) {
  return Boolean(session.state.uiAcks && session.state.uiAcks[key]);
}

/* ======================================================================
   getCurrentStep — derive the step from session state
   ====================================================================== */
function getCurrentStep(session) {
  ensureUiState(session);
  const f = session.state.fields;
  const g = session.state.gates;
  const phase = computePhase(session);

  if (session.state.completed) {
    return outcomeStep(session);
  }

  // Welcome acknowledgment as the very first step
  if (!session.state.welcomeAcked) {
    return welcomeStep(session);
  }

  // ===== PHASE: INTAKE =====
  // Auth-rep flow first if applicable
  if (Object.prototype.hasOwnProperty.call(g, "authorized_representative") && g.authorized_representative !== "passed") {
    if (!f["actor.role"]) return authRepRoleStep(session);
    if (!f["auth_rep_docs.uploaded"]) return authRepUploadStep(session);
  }

  // Trust-trustee flow if applicable
  if (Object.prototype.hasOwnProperty.call(g, "trust_trustee") && g.trust_trustee !== "passed") {
    if (!f["trust.name"]) return trustInfoStep(session);
    // KBA can clear with verification.identity; trust_trustee gate also requires trust.name
  }

  if (g.identity !== "passed") return kbaStep(session);
  if (g.death_cert !== "passed") return deathCertStep(session);

  // Trust self-cert (after identity, before triage)
  if (Object.prototype.hasOwnProperty.call(g, "selfcert") && g.selfcert !== "passed") {
    return trustSelfCertStep(session);
  }

  // ===== PHASE: TRIAGE PREP =====
  if (g.triage !== "passed") {
    if (!f["beneficiary.classification"]) {
      return classificationStep(session);
    }
    const cls = f["beneficiary.classification"];
    const isEdbInteractive = ["edb_age_gap", "edb_disabled", "edb_chronic_illness", "edb_minor_child"].includes(cls);
    if (isEdbInteractive && !f["edb.conversation_complete"] && cls !== "edb_minor_child") {
      return edbConfirmStep(session);
    }
    return engineCallStep(session);
  }

  // ===== PHASE: ELECTION =====
  if (g.election_resolution !== "passed") {
    if (!isAcked(session, "engine_report")) return engineReportStep(session);

    // YOD RMD disclosure — applies for Traditional + post-RBD (Section 6E)
    if (computeYodRmdApplicable(session) && !f["yod_rmd_disclosure_acknowledged"] && !f["yod_rmd.disclosed"]) {
      return yodRmdStep(session);
    }

    const cls = f["beneficiary.classification"];
    const eligibility = f["engine.election_eligible"];

    // Spouse-only path: surface treat-as-own option before electing
    if (cls === "spouse" && !f["spouse.path_chosen"]) {
      return spouseOptionsStep(session);
    }

    if (eligibility === "eligible") {
      // Track 1 — A/B election
      if (!f["election.distribution_method"]) return electionTrack1Step(session);
    } else if (eligibility === "not_eligible") {
      // Track 2 — acknowledge asserted rule
      if (!f["distribution_requirements_acknowledged"]) return acknowledgeTrack2Step(session);
    } else if (eligibility === "determined_by_trust_beneficiaries") {
      // Track 3 — trustee responsibility disclosure
      const ackVal = f["trustee_responsibility_disclosure_acknowledged"] || f["trustee_responsibility_disclosure.acknowledged"];
      if (!ackVal) return trustDisclosureStep(session);
    }

    if (!f["session.esign_complete"]) return esignStep(session);
  }

  // ===== PHASE: WRAP =====
  if (!isAcked(session, "wrap")) return wrapTemplateStep(session);

  // Withdrawal flow (optional)
  if (Object.prototype.hasOwnProperty.call(g, "withdrawal_request") && g.withdrawal_request !== "passed") {
    if (!f["withdrawal_request_decision"]) return withdrawalOptionsStep(session);
    if (f["withdrawal_request_decision"] === "proceed") {
      const wdType = f["withdrawal_request_type"];
      if (!wdType) return withdrawalOptionsStep(session);
      if (wdType === "lump_sum" && !f["lumpsum_instruction_confirmed"]) return withdrawalLumpsumStep(session);
      if (wdType === "one_time" && !f["onetime_amount_confirmed"]) return withdrawalOnetimeStep(session);
      if (wdType === "standing" && !f["standing_instruction_confirmed"]) return withdrawalStandingStep(session);
      if (!f["beneficiary.state"]) return stateCaptureStep(session);
      if (!f["withholding_election_confirmed"]) return withholdingStep(session);
      if (!f["withdrawal_esign_completed"]) return withdrawalEsignStep(session);
      if (!isAcked(session, "withdrawal_wrap")) return withdrawalWrapStep(session);
    }
  }

  // ===== PHASE: COMPLETE =====
  return completeSessionStep(session);
}

/* ======================================================================
   STEP DEFINITIONS — each returns a step descriptor
   ====================================================================== */
function welcomeStep(session) {
  const f = session.state.fields;
  return {
    type: "welcome",
    step_id: "welcome",
    phase: "intake",
    title: "Welcome",
    prompt: `${f["session.provider"]} has set up this session for an inherited IRA from ${f["owner.name"] || "the original IRA owner"}.`,
    body: `**Provider:** ${f["session.provider"]}
**IRA:** ${f["ira.type"]}, ${f["ira.balance"] || "(balance forthcoming)"}
**Original owner:** ${f["owner.name"]}, born ${f["owner.dob"]}, deceased ${f["owner.dod"]}
**Beneficiary on file:** ${f["beneficiary.name"] || f["beneficiary.name (Subject)"]}
${f["actor.name (Operator, 3D)"] ? `**Session operator:** ${f["actor.name (Operator, 3D)"]} (${f["actor.relationship_to_subject"] || "operator"})` : ""}

Use the **Help assistant** at any point to ask general questions about inherited IRA rules. The assistant has its own scope and won't see this session's data.

When ready, click Begin to proceed with identity verification.`,
    inputs: [],
    actions: [{ kind: "submit", label: "Begin" }],
    helpAvailable: true,
    helpHint: "What is an inherited IRA?"
  };
}

function authRepRoleStep(session) {
  return {
    type: "auth_rep_role",
    step_id: "auth_rep_role",
    phase: "intake",
    title: "Authorized Representative — Your Role",
    prompt: "What is your role in operating this session on behalf of the beneficiary?",
    body: null,
    inputs: [
      {
        name: "actor.role",
        type: "select",
        label: "Your role",
        required: true,
        options: [
          { value: "surviving_parent", label: "Surviving parent (for a minor child beneficiary)" },
          { value: "guardian", label: "Court-appointed guardian" },
          { value: "conservator", label: "Court-appointed conservator" },
          { value: "attorney_in_fact", label: "Attorney-in-fact (durable power of attorney)" },
          { value: "authorized_representative", label: "Other authorized representative" }
        ]
      }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "Who can be an authorized representative?"
  };
}

function authRepUploadStep(session) {
  const role = session.state.fields["actor.role"];
  const fileSuggestions = role === "surviving_parent"
    ? ["Birth_certificate.pdf", "Government_ID.pdf"]
    : role === "guardian" || role === "conservator"
      ? ["Court_order.pdf", "Government_ID.pdf"]
      : role === "attorney_in_fact"
        ? ["Durable_power_of_attorney.pdf", "Government_ID.pdf"]
        : ["Authority_document.pdf", "Government_ID.pdf"];
  return {
    type: "auth_rep_upload",
    step_id: "auth_rep_upload",
    phase: "intake",
    title: "Authorized Representative — Documentation",
    prompt: "Upload the documents that establish your authority to operate this session, plus your government ID.",
    body: `In production this is a real upload; here it's simulated. The provider's ops team would normally review the documents before clearing the gate. For the prototype, click Submit to proceed.`,
    inputs: [],
    options: { files: fileSuggestions },
    actions: [{ kind: "submit", label: "Submit documents" }],
    helpAvailable: true,
    helpHint: "What documents establish authorized-representative authority?"
  };
}

function trustInfoStep(session) {
  return {
    type: "trust_info",
    step_id: "trust_info",
    phase: "intake",
    title: "Trust Information",
    prompt: "Tell us about the trust that's named as the IRA beneficiary.",
    body: null,
    inputs: [
      { name: "trust.name", type: "text", label: "Trust name", required: true },
      {
        name: "trustee_type",
        type: "select",
        label: "Your role as trustee",
        required: true,
        options: [
          { value: "individual_trustee", label: "Individual trustee" },
          { value: "co_trustee", label: "Co-trustee" },
          { value: "corporate_trustee_authorized_rep", label: "Authorized representative of a corporate trustee" }
        ]
      },
      { name: "corporate_trustee_entity_name", type: "text", label: "Corporate trustee entity name (if applicable)", required: false }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "What is a 'see-through' trust?"
  };
}

function kbaStep(session) {
  const f = session.state.fields;
  const expected = session.persona.kbaAnswer || "1234";
  const subjectName = f["actor.name (Operator, 3D)"] || f["beneficiary.name"] || f["beneficiary.name (Subject)"] || "the beneficiary";
  return {
    type: "kba",
    step_id: "kba",
    phase: "intake",
    title: "Identity Verification",
    prompt: `What are the last 4 digits of ${subjectName}'s Social Security Number?`,
    body: `For the prototype, the answer is **${expected}** — in production this would be a real KBA challenge against the bank's records.`,
    inputs: [
      { name: "kba_answer", type: "text", label: "Last 4 of SSN", required: true, maxLength: 4, suggested: expected }
    ],
    actions: [{ kind: "submit", label: "Verify" }],
    helpAvailable: true,
    helpHint: "Why do you need to verify my identity?"
  };
}

function deathCertStep(session) {
  return {
    type: "death_cert",
    step_id: "death_cert",
    phase: "intake",
    title: "Death Certificate",
    prompt: "The provider has indicated the death certificate is already on file.",
    body: "In production, this gate clears automatically when the provider's seed includes a verified death certificate. The prototype mirrors that — click Confirm to record the verification.",
    inputs: [],
    actions: [{ kind: "submit", label: "Confirm" }],
    helpAvailable: true,
    helpHint: "What if the death certificate isn't on file?"
  };
}

function trustSelfCertStep(session) {
  return {
    type: "trust_selfcert",
    step_id: "trust_selfcert",
    phase: "intake",
    title: "Trust Qualification — Self-Certification",
    prompt: "Confirm the four prongs of see-through trust qualification, to the best of your knowledge.",
    body: `**The four prongs (per Treasury Regulation):**
1. The trust is valid under state law (or would be but for the lack of a corpus).
2. The trust is irrevocable, or by its terms becomes irrevocable upon the IRA owner's death.
3. The trust's beneficiaries are individually identifiable from the trust document itself.
4. The trustee provides documentation to the provider by October 31 of the year following the year of death (October 31, ${(new Date(session.state.fields["owner.dod"] || Date.now()).getFullYear() + 1)} for this case).

The system records your assertion. The provider determines the actual qualification out-of-system.`,
    inputs: [
      {
        name: "selfcert_decision",
        type: "radio",
        label: "Do all four prongs apply?",
        required: true,
        options: [
          { value: "completed", label: "Yes — all four prongs apply (self-cert completed)" },
          { value: "declined", label: "No / unsure — decline self-cert (case still flows through Track 3 unified handoff)" }
        ]
      }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "Help me understand each prong."
  };
}

function classificationStep(session) {
  const f = session.state.fields;
  const beneType = f["beneficiary.type"];
  if (beneType === "trust_trustee") {
    return {
      type: "classification",
      step_id: "classification_trust",
      phase: "triage_prep",
      title: "Beneficiary Classification",
      prompt: "Setting classification for the trust beneficiary.",
      body: "Trust beneficiaries flow through Track 3 — qualified see-through trust handoff. Click Continue to set the classification.",
      inputs: [],
      hidden_field: { name: "beneficiary.classification", value: "qualified_see_through_trust" },
      actions: [{ kind: "submit", label: "Continue" }],
      helpAvailable: true,
      helpHint: "What does Track 3 mean?"
    };
  }
  return {
    type: "classification",
    step_id: "classification",
    phase: "triage_prep",
    title: "Relationship to the Original Owner",
    prompt: "What was your relationship to the original IRA owner?",
    body: "This determines how the beneficiary classification is computed.",
    inputs: [
      {
        name: "beneficiary.relationship",
        type: "select",
        label: "Relationship",
        required: true,
        options: [
          { value: "spouse", label: "Spouse" },
          { value: "child", label: "Child (of the original owner)" },
          { value: "grandchild", label: "Grandchild" },
          { value: "sibling", label: "Sibling" },
          { value: "parent", label: "Parent" },
          { value: "other_relative", label: "Other relative" },
          { value: "non_relative", label: "Non-relative (friend, partner, etc.)" }
        ]
      },
      {
        name: "is_minor",
        type: "checkbox",
        label: "Beneficiary is a minor (under 21) AND a child of the deceased"
      },
      {
        name: "is_disabled",
        type: "checkbox",
        label: "Beneficiary qualifies as disabled (per IRS definition)"
      },
      {
        name: "is_chronically_ill",
        type: "checkbox",
        label: "Beneficiary qualifies as chronically ill (per IRS definition)"
      }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "What is an Eligible Designated Beneficiary?"
  };
}

function edbConfirmStep(session) {
  const cls = session.state.fields["beneficiary.classification"];
  const desc = {
    edb_disabled: "the beneficiary qualifies as **disabled** per IRS rules (substantially gainful activity is not possible)",
    edb_chronic_illness: "the beneficiary qualifies as **chronically ill** per IRS rules (a licensed health-care practitioner has certified the condition)",
    edb_age_gap: "the beneficiary is **not more than 10 years younger** than the original owner (computed from dates already on file)"
  }[cls] || "the qualifying condition applies";
  return {
    type: "edb_confirm",
    step_id: "edb_confirm",
    phase: "triage_prep",
    title: "Eligible Designated Beneficiary — Confirmation",
    prompt: `Confirm the qualifying condition: ${desc}.`,
    body: "The system records the self-certification. Real qualification is verified through documentation by the provider where applicable.",
    inputs: [],
    actions: [{ kind: "submit", label: "Confirm" }],
    helpAvailable: true,
    helpHint: "What does this EDB category mean?"
  };
}

function engineCallStep(session) {
  return {
    type: "engine_call",
    step_id: "engine_call",
    phase: "triage_prep",
    title: "Triage Engine — Determine Applicable Rules",
    prompt: "All inputs collected. Click below to run the deterministic triage engine.",
    body: "The engine takes the five-field input package (IRA type, owner DOB/DOD, beneficiary DOB, classification) and returns the applicable rule, election eligibility, and election deadlines per the v1.5 Beneficiary Classification Landscape.",
    inputs: [],
    actions: [{ kind: "submit", label: "Run engine" }],
    helpAvailable: true,
    helpHint: "What does the triage engine actually do?"
  };
}

function engineReportStep(session) {
  const eng = session.state.engine && session.state.engine.result;
  const out = (eng && eng.ok) ? eng.output_package : {};
  const f = session.state.fields;
  const rendered = renderTemplate("engine_report", {
    classification: f["beneficiary.classification"] || "—",
    applicable_rule: out.applicable_rule_set || "—",
    election_eligible: out.election_eligible || "—",
    election_options: (out.election_options || []).join(", ") || "(none)",
    election_deadline: out.election_deadline || "(n/a)",
    distribution_window_end: out.distribution_window_end || "(n/a)",
    owner_rbd_status: out.owner_rbd_status || "—",
    owner_rbd_date: out.owner_rbd_date || "—",
    annual_rmd_required: String(out.annual_rmd_required),
    election_track: out.election_track || "—",
    beneficiary_name: f["beneficiary.name"] || f["beneficiary.name (Subject)"] || ""
  });
  return {
    type: "engine_report",
    step_id: "engine_report",
    phase: "election",
    title: rendered.title,
    prompt: "Take a moment to review the report.",
    body: rendered.body,
    inputs: [],
    actions: [{ kind: "submit", label: "Acknowledge" }],
    helpAvailable: true,
    helpHint: "What does this report mean for me?"
  };
}

function spouseOptionsStep(session) {
  const f = session.state.fields;
  const rendered = renderTemplate("spouse_treat_as_own_options", {
    owner_name: f["owner.name"] || "the original owner",
    beneficiary_name: f["beneficiary.name"] || "you",
    ira_balance: f["ira.balance"] || ""
  });
  return {
    type: "spouse_options",
    step_id: "spouse_options",
    phase: "election",
    title: rendered.title,
    prompt: "Pick the path you want to pursue.",
    body: rendered.body,
    inputs: [
      {
        name: "spouse.path_chosen",
        type: "radio",
        label: "Your choice",
        required: true,
        options: [
          { value: "inherited_ira", label: "Continue with the inherited-IRA path (the engine's findings apply)" },
          { value: "treat_as_own_path_a", label: "Treat-as-own — Path A (internal transfer to existing own IRA)" },
          { value: "treat_as_own_path_b", label: "Treat-as-own — Path B (new own IRA established here)" },
          { value: "treat_as_own_external", label: "Treat-as-own — external transfer (session closes)" }
        ]
      }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "Which spouse path makes sense for me?"
  };
}

function electionTrack1Step(session) {
  const eng = session.state.engine && session.state.engine.result;
  const out = (eng && eng.ok) ? eng.output_package : {};
  return {
    type: "election_track1",
    step_id: "election_track1",
    phase: "election",
    title: "Distribution Method Election (Track 1)",
    prompt: "Pick your distribution method.",
    body: `Engine determined this is a Track 1 case — both options are available.

**Election deadline of record:** ${out.election_deadline || "(n/a)"}.

The detailed mechanics of each option are summarized in the report above; the help assistant can explain them in general terms.`,
    inputs: [
      {
        name: "election.distribution_method",
        type: "radio",
        label: "Distribution method",
        required: true,
        options: [
          { value: "life_expectancy", label: "Life Expectancy" },
          { value: "10_year", label: "10-Year" }
        ]
      }
    ],
    actions: [{ kind: "submit", label: "Capture election" }],
    helpAvailable: true,
    helpHint: "What's the difference between LE and 10-year?"
  };
}

function acknowledgeTrack2Step(session) {
  const eng = session.state.engine && session.state.engine.result;
  const out = (eng && eng.ok) ? eng.output_package : {};
  const rendered = renderTemplate("distribution_requirements_track2", {
    asserted_rule: out.asserted_rule || out.applicable_rule_set || "Life Expectancy",
    distribution_window_end: out.distribution_window_end || "",
    beneficiary_name: session.state.fields["beneficiary.name"] || ""
  });
  return {
    type: "acknowledge_track2",
    step_id: "acknowledge_track2",
    phase: "election",
    title: rendered.title,
    prompt: "Acknowledge the distribution requirements.",
    body: rendered.body,
    inputs: [],
    actions: [{ kind: "submit", label: "Acknowledge" }],
    helpAvailable: true,
    helpHint: "Why no A/B election here?"
  };
}

function trustDisclosureStep(session) {
  const f = session.state.fields;
  const rendered = renderTemplate("trustee_responsibility_disclosure_track3", {
    trustee_name: f["actor.name (Operator, 3D)"] || "the trustee",
    trust_name: f["trust.name"] || "the named trust",
    ira_balance: f["ira.balance"] || ""
  });
  return {
    type: "trust_disclosure",
    step_id: "trust_disclosure",
    phase: "election",
    title: rendered.title,
    prompt: "Acknowledge the trustee responsibility disclosure.",
    body: rendered.body,
    inputs: [],
    actions: [{ kind: "submit", label: "Acknowledge" }],
    helpAvailable: true,
    helpHint: "What does the trustee responsibility disclosure mean?"
  };
}

function yodRmdStep(session) {
  const f = session.state.fields;
  const rendered = renderTemplate("yod_rmd_disclosure", {
    owner_name: f["owner.name"] || "the original owner",
    beneficiary_name: f["beneficiary.name"] || ""
  });
  return {
    type: "yod_rmd_disclosure",
    step_id: "yod_rmd",
    phase: "election",
    title: rendered.title,
    prompt: "Acknowledge the year-of-death RMD disclosure.",
    body: rendered.body,
    inputs: [],
    actions: [{ kind: "submit", label: "Acknowledge" }],
    helpAvailable: true,
    helpHint: "What is a year-of-death RMD?"
  };
}

function esignStep(session) {
  const f = session.state.fields;
  const cls = f["beneficiary.classification"];
  const eligibility = f["engine.election_eligible"];
  let title, bullets;
  if (eligibility === "eligible") {
    title = "Inherited IRA Election";
    const election = f["election.distribution_method"];
    bullets = [
      `Election: ${election}`,
      `Election deadline of record: ${f["engine.election_deadline"] || "(n/a)"}`,
      `Provider: ${f["session.provider"]}`,
      "By signing, you authorize the provider to retitle the account and configure the schedule per this election."
    ];
  } else if (eligibility === "not_eligible") {
    title = "Distribution Requirements Acknowledgment";
    bullets = [
      `Asserted rule: ${f["engine.asserted_rule"] || f["engine.applicable_rule_set"] || "—"}`,
      `Distribution window ends: ${f["engine.distribution_window_end"] || "(n/a)"}`,
      "By signing, you acknowledge the asserted distribution rule applies."
    ];
  } else {
    title = "Trustee Responsibility Acknowledgment (Track 3)";
    bullets = [
      `Trust: ${f["trust.name"] || "the named trust"}`,
      "Self-certification recorded; provider determines applicable rule out-of-system",
      "By signing, you acknowledge the trustee responsibility disclosure."
    ];
  }
  return {
    type: "esign",
    step_id: "esign",
    phase: "election",
    title: "E-Sign — " + title,
    prompt: "Sign electronically to capture the decision.",
    body: null,
    bullets,
    envelope: `env_${Math.random().toString(36).slice(2, 10)}`,
    inputs: [],
    actions: [{ kind: "submit", label: "Sign electronically" }],
    helpAvailable: true,
    helpHint: "What am I signing?"
  };
}

function wrapTemplateStep(session) {
  const f = session.state.fields;
  const eligibility = f["engine.election_eligible"];
  let templateId, vars;
  if (eligibility === "eligible") {
    templateId = "wrap_track1_election_made";
    vars = {
      election: f["election.distribution_method"],
      deadline: f["engine.election_deadline"],
      beneficiary_name: f["beneficiary.name"]
    };
  } else if (eligibility === "not_eligible") {
    templateId = "wrap_track2_no_election";
    vars = {
      asserted_rule: f["engine.asserted_rule"] || f["engine.applicable_rule_set"],
      beneficiary_name: f["beneficiary.name"]
    };
  } else {
    templateId = "wrap_track3_qst_handoff";
    vars = {
      trust_name: f["trust.name"],
      case_ref: f["case.reference"] || f["handoff_package_id"] || "(generated at close)"
    };
  }
  const rendered = renderTemplate(templateId, vars);
  return {
    type: "wrap_template",
    step_id: "wrap_template",
    phase: "wrap",
    title: rendered.title,
    prompt: "Acknowledge to continue.",
    body: rendered.body,
    inputs: [],
    actions: [{ kind: "submit", label: "Acknowledge" }],
    helpAvailable: true,
    helpHint: "What happens next?"
  };
}

function withdrawalOptionsStep(session) {
  const f = session.state.fields;
  const rendered = renderTemplate("withdrawal_options", {
    beneficiary_name: f["beneficiary.name"]
  });
  return {
    type: "withdrawal_options",
    step_id: "withdrawal_options",
    phase: "wrap",
    title: rendered.title,
    prompt: "Pick a withdrawal option, or skip to close out.",
    body: rendered.body,
    inputs: [
      {
        name: "withdrawal_choice",
        type: "radio",
        label: "Your choice",
        required: true,
        options: [
          { value: "lump_sum", label: "Lump sum (full account distribution)" },
          { value: "one_time", label: "One-time withdrawal (specific amount)" },
          { value: "standing", label: "Standing withdrawal (recurring distributions)" },
          { value: "decline", label: "Skip — close out without setting up a withdrawal now" }
        ]
      }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "What's the difference between these withdrawal types?"
  };
}

function withdrawalLumpsumStep(session) {
  const f = session.state.fields;
  const rendered = renderTemplate("withdrawal_lumpsum_form", {
    ira_balance: f["ira.balance"],
    beneficiary_name: f["beneficiary.name"]
  });
  return {
    type: "withdrawal_lumpsum",
    step_id: "withdrawal_lumpsum",
    phase: "wrap",
    title: rendered.title,
    prompt: "Confirm the lump sum instruction.",
    body: rendered.body,
    inputs: [
      {
        name: "lumpsum_instruction_confirmed",
        type: "checkbox",
        label: "I confirm this lump sum instruction",
        required: true
      }
    ],
    actions: [{ kind: "submit", label: "Confirm" }],
    helpAvailable: true,
    helpHint: "What are the implications of a lump sum?"
  };
}

function withdrawalOnetimeStep(session) {
  const rendered = renderTemplate("withdrawal_onetime_form", {
    amount_type: "—",
    amount: "—",
    timing: "—",
    beneficiary_name: session.state.fields["beneficiary.name"]
  });
  return {
    type: "withdrawal_onetime",
    step_id: "withdrawal_onetime",
    phase: "wrap",
    title: "One-Time Withdrawal — Specify Amount and Timing",
    prompt: "Tell us the amount and when.",
    body: null,
    inputs: [
      {
        name: "onetime_amount_type",
        type: "radio",
        label: "Amount type",
        required: true,
        options: [
          { value: "dollar_amount", label: "Specific dollar amount" },
          { value: "percentage", label: "Percentage of balance" }
        ]
      },
      { name: "onetime_amount", type: "text", label: "Dollar amount (if applicable)", required: false, placeholder: "e.g., 50000" },
      { name: "onetime_amount_percentage", type: "text", label: "Percentage (if applicable)", required: false, placeholder: "e.g., 25" },
      {
        name: "onetime_timing_preference",
        type: "radio",
        label: "Timing",
        required: true,
        options: [
          { value: "as_soon_as_possible", label: "As soon as the provider can process" },
          { value: "specific_date", label: "On a specific date" },
          { value: "end_of_year", label: "By year-end" }
        ]
      },
      { name: "onetime_timing_preference_detail", type: "text", label: "Specific date (if applicable)", required: false, placeholder: "YYYY-MM-DD" }
    ],
    actions: [{ kind: "submit", label: "Confirm" }],
    helpAvailable: true,
    helpHint: "How is a one-time withdrawal taxed?"
  };
}

function withdrawalStandingStep(session) {
  return {
    type: "withdrawal_standing",
    step_id: "withdrawal_standing",
    phase: "wrap",
    title: "Standing Withdrawal — Set Up Recurring Distributions",
    prompt: "Configure the recurring instruction.",
    body: null,
    inputs: [
      {
        name: "standing_distribution_basis",
        type: "radio",
        label: "Basis",
        required: true,
        options: [
          { value: "fixed_dollar", label: "Fixed dollar amount per distribution" },
          { value: "fixed_percentage", label: "Fixed percentage of account balance" },
          { value: "annual_rmd", label: "Annual RMD" }
        ]
      },
      { name: "standing_fixed_amount", type: "text", label: "Dollar amount (if applicable)", required: false },
      { name: "standing_fixed_percentage", type: "text", label: "Percentage (if applicable)", required: false },
      {
        name: "standing_frequency",
        type: "select",
        label: "Frequency",
        required: true,
        options: [
          { value: "monthly", label: "Monthly" },
          { value: "quarterly", label: "Quarterly" },
          { value: "semi_annual", label: "Semi-annual" },
          { value: "annual", label: "Annual" }
        ]
      },
      { name: "standing_start_date", type: "text", label: "Start date (YYYY-MM-DD)", required: true, placeholder: "2026-06-01" }
    ],
    actions: [{ kind: "submit", label: "Confirm" }],
    helpAvailable: true,
    helpHint: "Can I change a standing withdrawal later?"
  };
}

function stateCaptureStep(session) {
  return {
    type: "state_capture",
    step_id: "state_capture",
    phase: "wrap",
    title: "State of Residence (for Tax Purposes)",
    prompt: "What state are you in for tax purposes?",
    body: "This determines whether state withholding applies to your withdrawal. Two-letter state code (e.g., CA, TX, NY).",
    inputs: [
      { name: "beneficiary.state", type: "text", label: "State (two-letter code)", required: true, maxLength: 2 }
    ],
    actions: [{ kind: "submit", label: "Continue" }],
    helpAvailable: true,
    helpHint: "Why does my state matter?"
  };
}

function withholdingStep(session) {
  const f = session.state.fields;
  const stateCode = f["beneficiary.state"];
  const fedElection = f["federal_withholding_election"];
  const computed = computeStateWithholding(stateCode, fedElection);
  const rendered = renderTemplate("withdrawal_withholding_disclosure", {
    federal_election: fedElection || "—",
    federal_pct: f["federal_withholding_percentage"],
    state_applicable: computed.applicable,
    state_mandatory: computed.mandatory,
    state_default_rate_pct: computed.default_rate_pct,
    state_label: computed.state_label,
    state_note: computed.state_note,
    state_known: computed.known_state,
    state_election: f["state_withholding_election"],
    state_pct: f["state_withholding_percentage"],
    beneficiary_name: f["beneficiary.name"]
  });
  const inputs = [
    {
      name: "federal_withholding_election",
      type: "radio",
      label: "Federal withholding",
      required: true,
      options: [
        { value: "default_10_percent", label: "Default (10%)" },
        { value: "elected_amount", label: "Elect a specific percentage" },
        { value: "waived", label: "Waive (where permitted)" }
      ]
    },
    { name: "federal_withholding_percentage", type: "text", label: "Federal % (if elected)", required: false, placeholder: "e.g., 15" }
  ];
  if (computed.applicable) {
    inputs.push({
      name: "state_withholding_election",
      type: "radio",
      label: `State withholding (${computed.state_label})`,
      required: true,
      options: [
        { value: "default", label: `Default state rate (${computed.default_rate_pct})` },
        { value: "elected_amount", label: "Elect a specific percentage" },
        { value: "waived", label: computed.mandatory ? "Waive (not permitted in this state when federal applies)" : "Waive" }
      ]
    });
    inputs.push({ name: "state_withholding_percentage", type: "text", label: "State % (if elected)", required: false, placeholder: "e.g., 5" });
  }
  inputs.push({
    name: "withdrawal_tax_disclosure_acknowledged",
    type: "checkbox",
    label: "I acknowledge the withholding disclosure",
    required: true
  });
  return {
    type: "withholding",
    step_id: "withholding",
    phase: "wrap",
    title: rendered.title,
    prompt: "Make your withholding election.",
    body: rendered.body,
    inputs,
    actions: [{ kind: "submit", label: "Confirm withholding" }],
    helpAvailable: true,
    helpHint: "How does withholding affect my tax bill?"
  };
}

function withdrawalEsignStep(session) {
  const f = session.state.fields;
  const wdType = f["withdrawal_request_type"];
  const typeLabel = { lump_sum: "Lump Sum", one_time: "One-Time", standing: "Standing" }[wdType] || "Withdrawal";
  const bullets = [
    `Withdrawal type: ${typeLabel}`,
    wdType === "lump_sum" ? `Distribute entire balance: ${f["ira.balance"] || ""}` :
      wdType === "one_time" ? `Amount: ${f["onetime_amount_type"] === "percentage" ? `${f["onetime_amount_percentage"]}%` : `$${f["onetime_amount"]}`}` :
        wdType === "standing" ? `${f["standing_distribution_basis"]} · ${f["standing_frequency"]} · start ${f["standing_start_date"]}` : "",
    `Federal withholding: ${f["federal_withholding_election"] || "—"}${f["federal_withholding_percentage"] ? ` (${f["federal_withholding_percentage"]}%)` : ""}`,
    `State withholding: ${f["state_withholding_state_label"] || "—"} — ${f["state_withholding_election"] || "—"}`
  ].filter(Boolean);
  return {
    type: "withdrawal_esign",
    step_id: "withdrawal_esign",
    phase: "wrap",
    title: `E-Sign — ${typeLabel} Withdrawal Instruction`,
    prompt: "Sign electronically to authorize the withdrawal instruction.",
    body: null,
    bullets,
    envelope: `env_wd_${Math.random().toString(36).slice(2, 10)}`,
    inputs: [],
    actions: [{ kind: "submit", label: "Sign electronically" }],
    helpAvailable: true,
    helpHint: "What does signing this do?"
  };
}

function withdrawalWrapStep(session) {
  const f = session.state.fields;
  const rendered = renderTemplate("withdrawal_wrap", {
    withdrawal_type: f["withdrawal_request_type"],
    beneficiary_name: f["beneficiary.name"],
    ira_balance: f["ira.balance"]
  });
  return {
    type: "withdrawal_wrap",
    step_id: "withdrawal_wrap",
    phase: "wrap",
    title: rendered.title,
    prompt: "Acknowledge to finalize.",
    body: rendered.body,
    inputs: [],
    actions: [{ kind: "submit", label: "Acknowledge" }],
    helpAvailable: true,
    helpHint: "When will the distribution arrive?"
  };
}

function completeSessionStep(session) {
  const f = session.state.fields;
  const eligibility = f["engine.election_eligible"];
  const cls = f["beneficiary.classification"];
  const spousePath = f["spouse.path_chosen"];
  const wdType = f["withdrawal_request_type"];

  // Determine end_state from current state
  let endState;
  if (cls === "qualified_see_through_trust") {
    endState = "inherited_ira_established_qst_handoff";
  } else if (spousePath === "treat_as_own_path_a") {
    endState = "treat_as_own_path_a_instruction_captured";
  } else if (spousePath === "treat_as_own_path_b") {
    endState = "treat_as_own_path_b_in_good_order";
  } else if (spousePath === "treat_as_own_external") {
    endState = "treat_as_own_external_offramp";
  } else if (wdType === "lump_sum") {
    endState = "lump_sum_in_good_order";
  } else if (eligibility === "eligible" && f["election.distribution_method"]) {
    endState = "inherited_ira_established_election_made";
  } else if (eligibility === "not_eligible") {
    endState = "inherited_ira_established_no_election_required";
  } else {
    endState = "inherited_ira_established_election_made";
  }

  return {
    type: "complete_session",
    step_id: "complete_session",
    phase: "complete",
    title: "Finalize Session",
    prompt: "Ready to close out the session.",
    body: `**End state:** \`${endState}\`

The orchestrator will validate the end state, generate the structured handoff package (Section 10A), and — for "established" end states — mark \`pending_provider_confirmation\` per the v1.27 lifecycle. Click Finalize to close.`,
    hidden_field: { name: "_end_state", value: endState },
    inputs: [],
    actions: [{ kind: "submit", label: "Finalize" }],
    helpAvailable: true,
    helpHint: "What happens after I finalize?"
  };
}

function outcomeStep(session) {
  return {
    type: "outcome",
    step_id: "outcome",
    phase: "complete",
    title: "Session Complete",
    prompt: "The session is closed and the handoff package has been transmitted.",
    body: null,
    inputs: [],
    actions: [],
    helpAvailable: false
  };
}

/* ======================================================================
   computeYodRmdApplicable — Section 6E rule
   YOD RMD applies when ira_type=traditional AND owner died post-RBD.
   ====================================================================== */
function computeYodRmdApplicable(session) {
  const f = session.state.fields;
  const out = session.state.engine && session.state.engine.result && session.state.engine.result.ok
    ? session.state.engine.result.output_package
    : null;
  if (!out) return false;
  return f["ira.type"] === "traditional" && out.owner_rbd_status === "post_rbd";
}

/* ======================================================================
   handleSubmit — apply form data via runAction calls, return events
   ====================================================================== */
const { triageEngine } = require("./backend/triage-engine");

function handleSubmit(session, formData) {
  const events = [];
  const step = getCurrentStep(session);
  ensureUiState(session);

  switch (step.type) {
    case "welcome": {
      session.state.welcomeAcked = true;
      events.push({ type: "ui_ack", key: "welcome" });
      break;
    }

    case "auth_rep_role": {
      const role = formData["actor.role"];
      if (role) {
        const r = executeTool(session, "update_field", { path: "actor.role", value: role });
        events.push(...r.events);
      }
      break;
    }

    case "auth_rep_upload": {
      const r = executeTool(session, "update_field", { path: "auth_rep_docs.uploaded", value: "true" });
      events.push(...r.events);
      const r2 = executeTool(session, "audit", { text: `Authorized representative documentation submitted.` });
      events.push(...r2.events);
      break;
    }

    case "trust_info": {
      for (const k of ["trust.name", "trustee_type", "corporate_trustee_entity_name"]) {
        if (formData[k]) {
          const r = executeTool(session, "update_field", { path: k, value: formData[k] });
          events.push(...r.events);
        }
      }
      break;
    }

    case "kba": {
      const expected = session.persona.kbaAnswer || "1234";
      const answer = (formData.kba_answer || "").trim();
      // Theatrical KBA — accepts any non-empty answer in the prototype; in production this is real validation.
      if (!answer) {
        return { events, error: "KBA answer required." };
      }
      const matchNote = answer === expected ? "verified · KBA" : "verified · KBA (lenient match — prototype)";
      const r1 = executeTool(session, "update_field", { path: "verification.identity", value: matchNote });
      events.push(...r1.events);
      const r2 = executeTool(session, "audit", { text: `Identity verified via KBA.` });
      events.push(...r2.events);
      break;
    }

    case "death_cert": {
      const r = executeTool(session, "update_field", { path: "verification.death_cert", value: "verified · provider" });
      events.push(...r.events);
      break;
    }

    case "trust_selfcert": {
      const decision = formData.selfcert_decision;
      if (decision) {
        const r = executeTool(session, "update_field", { path: "selfcert.trust_status", value: decision });
        events.push(...r.events);
        // For "completed", record q1-q4 yes
        if (decision === "completed") {
          for (const q of ["trust.q1", "trust.q2", "trust.q3", "trust.q4"]) {
            const rq = executeTool(session, "update_field", { path: q, value: "yes" });
            events.push(...rq.events);
          }
        }
        // QST cases append a provider attention alert
        const alertType = decision === "completed" ? "qst_selfcert_completed" : "qst_selfcert_declined";
        const r2 = executeTool(session, "append_provider_attention_alert", {
          alert_type: alertType,
          alert_priority: "attention",
          alert_message: decision === "completed"
            ? "Trustee completed see-through self-certification. Provider determines applicable rule out-of-system."
            : "Trustee declined see-through self-certification. Provider determines applicable rule out-of-system."
        });
        events.push(...r2.events);
      }
      break;
    }

    case "classification": {
      let cls;
      if (formData.beneficiary_classification_override) {
        cls = formData.beneficiary_classification_override;
      } else if (session.state.fields["beneficiary.type"] === "trust_trustee") {
        cls = "qualified_see_through_trust";
      } else if (session.state.fields["beneficiary.type"] === "entity_rep") {
        cls = "non_edb_nonperson";
      } else {
        const rel = formData["beneficiary.relationship"];
        const isMinor = formData.is_minor === "true" || formData.is_minor === true || formData.is_minor === "on";
        const isDisabled = formData.is_disabled === "true" || formData.is_disabled === true || formData.is_disabled === "on";
        const isChronic = formData.is_chronically_ill === "true" || formData.is_chronically_ill === true || formData.is_chronically_ill === "on";
        if (rel === "spouse") {
          cls = "spouse";
        } else if (rel === "child" && isMinor) {
          cls = "edb_minor_child";
        } else if (isDisabled) {
          cls = "edb_disabled";
        } else if (isChronic) {
          cls = "edb_chronic_illness";
        } else {
          // Age-gap test
          const benDob = new Date(session.state.fields["beneficiary.dob"]);
          const ownDob = new Date(session.state.fields["owner.dob"]);
          const benMinusTen = new Date(benDob);
          benMinusTen.setFullYear(benMinusTen.getFullYear() - 10);
          if (benMinusTen <= ownDob) cls = "edb_age_gap";
          else cls = "non_edb_person";
        }
        if (rel) {
          const r = executeTool(session, "update_field", { path: "beneficiary.relationship", value: rel });
          events.push(...r.events);
        }
      }
      const rc = executeTool(session, "update_field", { path: "beneficiary.classification", value: cls });
      events.push(...rc.events);
      // For non-EDB-interactive classifications, mark conversation complete immediately
      if (!["edb_age_gap", "edb_disabled", "edb_chronic_illness"].includes(cls)) {
        const rcc = executeTool(session, "update_field", { path: "edb.conversation_complete", value: "true" });
        events.push(...rcc.events);
      }
      break;
    }

    case "edb_confirm": {
      const r = executeTool(session, "update_field", { path: "edb.conversation_complete", value: "true" });
      events.push(...r.events);
      break;
    }

    case "engine_call": {
      const f = session.state.fields;
      const result = triageEngine({
        ira_type: f["ira.type"],
        owner_dob: f["owner.dob"],
        owner_dod: f["owner.dod"],
        beneficiary_dob: f["beneficiary.dob"],
        beneficiary_classification: f["beneficiary.classification"]
      });
      // Use the executor's triage_engine pathway to promote outputs to canonical fields
      const r = executeTool(session, "triage_engine", {
        ira_type: f["ira.type"],
        owner_dob: f["owner.dob"],
        owner_dod: f["owner.dod"],
        beneficiary_dob: f["beneficiary.dob"],
        beneficiary_classification: f["beneficiary.classification"]
      });
      events.push(...r.events);
      break;
    }

    case "engine_report": {
      ack(session, "engine_report");
      events.push({ type: "ui_ack", key: "engine_report" });
      break;
    }

    case "yod_rmd_disclosure": {
      const r1 = executeTool(session, "update_field", { path: "yod_rmd.applicable", value: "true" });
      events.push(...r1.events);
      const r2 = executeTool(session, "update_field", { path: "yod_rmd.disclosed", value: "true" });
      events.push(...r2.events);
      const r3 = executeTool(session, "update_field", { path: "yod_rmd_disclosure_acknowledged", value: "true" });
      events.push(...r3.events);
      const r4 = executeTool(session, "append_provider_attention_alert", {
        alert_type: "yod_rmd_obligation_flag",
        alert_priority: "attention",
        alert_message: "Owner died post-RBD on a Traditional IRA. YOD RMD obligation flagged for provider reconciliation."
      });
      events.push(...r4.events);
      break;
    }

    case "spouse_options": {
      const choice = formData["spouse.path_chosen"];
      if (choice) {
        const r = executeTool(session, "update_field", { path: "spouse.path_chosen", value: choice });
        events.push(...r.events);
      }
      break;
    }

    case "election_track1": {
      const choice = formData["election.distribution_method"];
      if (choice) {
        const r = executeTool(session, "update_field", { path: "election.distribution_method", value: choice });
        events.push(...r.events);
      }
      break;
    }

    case "acknowledge_track2": {
      const r = executeTool(session, "update_field", { path: "distribution_requirements_acknowledged", value: "true" });
      events.push(...r.events);
      break;
    }

    case "trust_disclosure": {
      const r1 = executeTool(session, "update_field", { path: "trustee_responsibility_disclosure_acknowledged", value: "true" });
      events.push(...r1.events);
      const r2 = executeTool(session, "update_field", { path: "trustee_responsibility_disclosure.acknowledged", value: "true" });
      events.push(...r2.events);
      break;
    }

    case "esign":
    case "withdrawal_esign": {
      // Mark esign complete via the orchestrator helper
      const { markEsignComplete } = require("./tools");
      const e = markEsignComplete(session);
      events.push(...e);
      if (step.type === "withdrawal_esign") {
        const r = executeTool(session, "update_field", { path: "withdrawal_esign_completed", value: "true" });
        events.push(...r.events);
      }
      break;
    }

    case "wrap_template": {
      ack(session, "wrap");
      events.push({ type: "ui_ack", key: "wrap" });
      break;
    }

    case "withdrawal_options": {
      const choice = formData.withdrawal_choice;
      if (choice === "decline") {
        const r = executeTool(session, "update_field", { path: "withdrawal_request_decision", value: "declined" });
        events.push(...r.events);
      } else if (choice) {
        const r1 = executeTool(session, "update_field", { path: "withdrawal_request_decision", value: "proceed" });
        events.push(...r1.events);
        const r2 = executeTool(session, "update_field", { path: "withdrawal_request_type", value: choice });
        events.push(...r2.events);
      }
      break;
    }

    case "withdrawal_lumpsum": {
      const r = executeTool(session, "update_field", { path: "lumpsum_instruction_confirmed", value: "true" });
      events.push(...r.events);
      break;
    }

    case "withdrawal_onetime": {
      for (const k of ["onetime_amount_type", "onetime_amount", "onetime_amount_percentage", "onetime_timing_preference", "onetime_timing_preference_detail"]) {
        if (formData[k]) {
          const r = executeTool(session, "update_field", { path: k, value: formData[k] });
          events.push(...r.events);
        }
      }
      const rc = executeTool(session, "update_field", { path: "onetime_amount_confirmed", value: "true" });
      events.push(...rc.events);
      break;
    }

    case "withdrawal_standing": {
      for (const k of ["standing_distribution_basis", "standing_fixed_amount", "standing_fixed_percentage", "standing_frequency", "standing_start_date"]) {
        if (formData[k]) {
          const r = executeTool(session, "update_field", { path: k, value: formData[k] });
          events.push(...r.events);
        }
      }
      const rc = executeTool(session, "update_field", { path: "standing_instruction_confirmed", value: "true" });
      events.push(...rc.events);
      break;
    }

    case "state_capture": {
      const code = (formData["beneficiary.state"] || "").toUpperCase();
      if (code) {
        const r = executeTool(session, "update_field", { path: "beneficiary.state", value: code });
        events.push(...r.events);
      }
      break;
    }

    case "withholding": {
      for (const k of ["federal_withholding_election", "federal_withholding_percentage", "state_withholding_election", "state_withholding_percentage"]) {
        if (formData[k]) {
          const r = executeTool(session, "update_field", { path: k, value: formData[k] });
          events.push(...r.events);
        }
      }
      const r1 = executeTool(session, "update_field", { path: "withdrawal_tax_disclosure_acknowledged", value: "true" });
      events.push(...r1.events);
      const r2 = executeTool(session, "update_field", { path: "withholding_election_confirmed", value: "true" });
      events.push(...r2.events);
      break;
    }

    case "withdrawal_wrap": {
      ack(session, "withdrawal_wrap");
      events.push({ type: "ui_ack", key: "withdrawal_wrap" });
      break;
    }

    case "complete_session": {
      const endState = step.hidden_field && step.hidden_field.value;
      if (endState) {
        const r = executeTool(session, "complete_session", { end_state: endState });
        events.push(...r.events);
      }
      break;
    }

    default:
      return { events, error: `Unknown step type: ${step.type}` };
  }

  return { events };
}

module.exports = { getCurrentStep, handleSubmit };
