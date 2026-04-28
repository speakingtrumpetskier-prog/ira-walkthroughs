/* ======================================================================
   PERSONAS — v4
   ====================================================================== */

const ELENA = {
  id: "elena-hale",
  name: "Elena Hale",
  initials: "EH",
  age: 54,
  sessionRef: "EH-2025-1187",
  provider: "Northstar Custody",
  laneHint: "Track 2 (post-RBD spouse) · separate treat-as-own option",
  tagline: "Recently widowed. $462K traditional IRA.",
  situation:
    "Martin passed three months ago. He was 78 — past his Required Beginning Date. Elena is 54. Per the v1.5 schema, this is a Track 2 (asserted Life Expectancy) case, but she retains the spouse-only treat-as-own option as a separate path.",
  tag: "Track 2 + spouse treat-as-own",

  personaPrompt: `## Session context (provider seed)

This session is operated for **Northstar Custody**. The actor is **Elena Hale** — the surviving spouse herself. Subject and Actor are the same person.

Provider-seeded facts (already in your session state — do not re-elicit):
- Beneficiary: Elena Hale, surviving spouse, born 1971-07-26
- Owner: Martin Hale, born 1947-03-02, died 2025-11-08
- IRA: Traditional, $462,000
- Beneficiary classification: spouse (already seeded)
- Death certificate: already verified by Northstar (provider-supplied)

KBA expected answer: the last 4 of Elena's SSN is **5512**. (In production this would be validated against bank records; in the prototype, accept whatever the user types and record verification.identity.)

Operate per the Standard Session Flow in your reference material. The session state and the schema-bound canonical fields tell you everything else you need.`,

  initialState: () => ({
    fields: {
      "session.provider": "Northstar Custody",
      "session.status": "in_progress",
      "ira.type": "traditional",
      "ira.balance": "$462,000",
      "owner.name": "Martin Hale",
      "owner.dob": "1947-03-02",
      "owner.dod": "2025-11-08",
      "beneficiary.name": "Elena Hale",
      "beneficiary.dob": "1971-07-26",
      "beneficiary.age": "54",
      "beneficiary.relationship": "spouse",
      "beneficiary.classification": "spouse"
    },
    gates: {
      identity: "pending",
      death_cert: "pending",
      edb_conversation: "pending",
      triage: "pending",
      election_resolution: "pending",
      handoff_ready: "pending"
    },
    audit: [
      {
        time: nowStamp(),
        text: "Session seeded from Northstar Custody (provider_api). Subject=Actor (Elena Hale, individual). Death certificate provider-supplied."
      }
    ],
    completed: false,
    endState: null,
    engine: null
  }),

  chips: [
    { label: "5512", when: (s) => s.gates.identity !== "passed" },
    { label: "Tell me what applies for me", when: (s) => s.gates.death_cert === "passed" && s.gates.triage !== "passed" },
    { label: "Keep it as an inherited IRA", when: (s) => s.gates.triage === "passed" && !s.fields["spouse.path_chosen"] },
    { label: "Treat it as my own", when: (s) => s.gates.triage === "passed" && !s.fields["spouse.path_chosen"] },
    { label: "I'm not sure — what do most spouses my age do?", when: (s) => s.gates.triage === "passed" && !s.fields["spouse.path_chosen"] }
  ]
};

const MILO = {
  id: "milo-everett",
  name: "Milo Everett (via parent)",
  initials: "ME",
  age: 12,
  sessionRef: "ME-2026-0331",
  provider: "Blue Prairie Trust Co.",
  laneHint: "Track 1 EDB minor child · Subject ≠ Actor",
  tagline: "12-year-old beneficiary. Surviving parent operating session.",
  situation:
    "Jasmine Everett died in March. Account ($524,700, traditional, owner pre-RBD) goes to her son Milo. The surviving parent is the Actor (Section 3D); Milo is the Subject (3A). EDB minor child — Track 1 with A/B election available.",
  tag: "Subject vs Actor · Track 1 EDB minor",

  personaPrompt: `## Session context (provider seed)

This session is operated for **Blue Prairie Trust Co.** This is an authorized-representative session — a minor beneficiary cannot operate their own session.

Provider-seeded facts (already in your session state — do not re-elicit):
- Beneficiary (Subject, 3A): Milo Everett, age 12, born 2013-08-19
- Actor (3D, the operator): Daniel Everett, surviving father, authorized representative for Milo
- Owner: Jasmine Everett, born 1979-12-14, died 2026-03-02
- IRA: Traditional, $524,700
- beneficiary.type: authorized_representative (already seeded)
- Death certificate: already verified by Blue Prairie (provider-supplied)

These are different people: address Daniel directly; reference Milo in the third person.

KBA expected answer: the last 4 of **Daniel's** SSN is **8841**. (KBA is run on the actor in authorized-representative sessions.)

For the auth-rep document upload step, suggested file names: ["Milo_Everett_birth_certificate.pdf", "Daniel_Everett_government_id.pdf"].

Operate per the Standard Session Flow in your reference material. The session state and the schema-bound canonical fields tell you everything else you need.`,

  initialState: () => ({
    fields: {
      "session.provider": "Blue Prairie Trust Co.",
      "session.status": "in_progress",
      "ira.type": "traditional",
      "ira.balance": "$524,700",
      "owner.name": "Jasmine Everett",
      "owner.dob": "1979-12-14",
      "owner.dod": "2026-03-02",
      "beneficiary.name (Subject)": "Milo Everett",
      "beneficiary.dob": "2013-08-19",
      "beneficiary.age": "12",
      "beneficiary.relationship": "child",
      "beneficiary.type": "authorized_representative",
      "actor.name (Operator, 3D)": "Daniel Everett",
      "actor.relationship_to_subject": "surviving parent"
    },
    gates: {
      authorized_representative: "pending",
      identity: "pending",
      death_cert: "pending",
      edb_conversation: "pending",
      triage: "pending",
      election_resolution: "pending",
      handoff_ready: "pending"
    },
    audit: [
      {
        time: nowStamp(),
        text: "Session seeded from Blue Prairie Trust Co. (ops_initiated). Subject=Milo Everett (minor, age 12); Actor=Daniel Everett (surviving father). Authorized representative gate active."
      }
    ],
    completed: false,
    endState: null,
    engine: null
  }),

  chips: [
    { label: "Surviving father", when: (s) => !s.fields["actor.role"] },
    { label: "8841", when: (s) => s.gates.authorized_representative === "passed" && s.gates.identity !== "passed" },
    { label: "What applies for Milo?", when: (s) => s.gates.identity === "passed" && s.gates.triage !== "passed" },
    { label: "Life Expectancy option", when: (s) => s.gates.triage === "passed" && !s.fields["election.distribution_method"] },
    { label: "10-Year option", when: (s) => s.gates.triage === "passed" && !s.fields["election.distribution_method"] }
  ]
};

const DANE = {
  id: "dane-trust",
  name: "Dane Family Trust (Track 3)",
  initials: "DF",
  age: null,
  sessionRef: "DF-2025-0660",
  provider: "Redwood Fiduciary",
  laneHint: "Track 3 unified QST handoff (v1.5)",
  tagline: "Trustee operating session. QST self-cert + responsibility disclosure.",
  situation:
    "Gloria Dane named the Dane Family Trust as her IRA beneficiary. Under v1.5's unified Track 3, the trustee self-certifies, acknowledges the trustee responsibility disclosure, and the inherited IRA is established in-system. Final classification is determined by the provider out-of-system. Provider notified via provider_attention_alerts.",
  tag: "Track 3 — graceful in-system completion",

  personaPrompt: `## Session context (provider seed)

This session is operated for **Redwood Fiduciary**. This is a trust-trustee session — the beneficiary is a trust (the Dane Family Trust), and the actor is the trustee (Marcus Chen) operating on its behalf. Section 3A (the beneficiary's natural-person identity) is null for this case; the beneficiary is identified in Section 4G as the trust.

Provider-seeded facts (already in your session state):
- Beneficiary: Dane Family Trust (a trust, not an individual)
- Actor (3D, the operator): Marcus Chen, trustee
- Owner: Gloria Dane, born 1944-01-20, died 2025-09-11
- IRA: Traditional, $883,250
- beneficiary.type: trust_trustee (already seeded)
- Death certificate: already verified by Redwood (provider-supplied)

Address Marcus directly as the trustee.

KBA expected answer: the last 4 of **Marcus's** SSN is **3392**.

For the trust documentation upload, suggested file names: ["Dane_Family_Trust_Agreement.pdf", "Trustee_Certification.pdf"].

Operate per the Standard Session Flow in your reference material. Track 3 (QST) is the unified in-system path for trust beneficiaries; the engine will return \`election_eligible: "determined_by_trust_beneficiaries"\` and the provider determines the applicable rule out-of-system. Don't forget the \`append_provider_attention_alert\` step for QST.`,

  initialState: () => ({
    fields: {
      "session.provider": "Redwood Fiduciary",
      "session.status": "in_progress",
      "ira.type": "traditional",
      "ira.balance": "$883,250",
      "owner.name": "Gloria Dane",
      "owner.dob": "1944-01-20",
      "owner.dod": "2025-09-11",
      "beneficiary.name": "Dane Family Trust",
      "beneficiary.type": "trust_trustee",
      "actor.name (Operator, 3D)": "Marcus Chen",
      "actor.role": "trustee"
    },
    gates: {
      identity: "pending",
      death_cert: "pending",
      trust_trustee: "pending",
      edb_conversation: "pending",
      selfcert: "pending",
      triage: "pending",
      election_resolution: "pending",
      handoff_ready: "pending"
    },
    audit: [
      {
        time: nowStamp(),
        text: "Session seeded from Redwood Fiduciary (provider_api). Subject=null (trust beneficiary); Actor=Marcus Chen (trustee). Track 3 unified QST path."
      }
    ],
    completed: false,
    endState: null,
    engine: null
  }),

  chips: [
    { label: "3392", when: (s) => s.gates.identity !== "passed" },
    { label: "Yes", when: (s) => s.gates.identity === "passed" && (!s.fields["trust.q1"] || !s.fields["trust.q2"] || !s.fields["trust.q3"]) },
    { label: "What's the verdict?", when: (s) => s.gates.selfcert === "passed" && s.gates.triage !== "passed" }
  ]
};

/* ----------------------------------------------------------------------
   MARISOL ORTEGA — Track 1 EDB age-gap with withdrawal request flow
   ---------------------------------------------------------------------- */
const MARISOL = {
  id: "marisol-ortega",
  name: "Marisol Ortega",
  initials: "MO",
  age: 58,
  sessionRef: "MO-2026-0418",
  provider: "Lakeshore Trust Bank",
  laneHint: "Track 1 EDB age-gap · withdrawal request flow",
  tagline: "Age-gap sibling. $310K traditional, owner pre-RBD. Demonstrates withdrawal request setup (Section 9).",
  situation:
    "Daniel Ortega died at 64, pre-RBD. His sister Marisol (58) inherits a $310K traditional IRA at Lakeshore Trust Bank. She qualifies as EDB age-gap (less than 10 years younger). After electing Life Expectancy, she sets up a one-time withdrawal for tax-planning purposes — exercising the full Section 9 withdrawal flow with federal/state withholding election.",
  tag: "Track 1 EDB · withdrawal_request",

  personaPrompt: `## Session context (provider seed)

This session is operated for **Lakeshore Trust Bank**. The actor is **Marisol Ortega** — the beneficiary herself. Subject and Actor are the same person.

Provider-seeded facts (already in your session state):
- Beneficiary: Marisol Ortega, sister of the decedent, born 1967-04-15
- Owner: Daniel Ortega, born 1962-09-12, died 2026-11-15
- IRA: Traditional, $310,000
- Death certificate: provider-verified

KBA expected answer: the last 4 of Marisol's SSN is **7821**.

Test scenario for this case: Marisol intends to elect Life Expectancy and then exercise the Section 9 withdrawal flow (a one-time $50,000 withdrawal for tax-planning purposes, with default federal withholding). If she walks the standard flow naturally, this is the path she'll choose; offer the withdrawal flow after the wrap acknowledgment per the Standard Session Flow's Phase 4.

Operate per the Standard Session Flow in your reference material.`,

  initialState: () => ({
    fields: {
      "session.provider": "Lakeshore Trust Bank",
      "session.status": "in_progress",
      "ira.type": "traditional",
      "ira.balance": "$310,000",
      "owner.name": "Daniel Ortega",
      "owner.dob": "1962-09-12",
      "owner.dod": "2026-11-15",
      "beneficiary.name": "Marisol Ortega",
      "beneficiary.dob": "1967-04-15",
      "beneficiary.age": "58"
    },
    gates: {
      identity: "pending",
      death_cert: "pending",
      edb_conversation: "pending",
      triage: "pending",
      election_resolution: "pending",
      withdrawal_request: "pending",
      handoff_ready: "pending"
    },
    audit: [
      {
        time: nowStamp(),
        text: "Session seeded from Lakeshore Trust Bank (provider_api). Subject=Actor (Marisol Ortega). Death certificate provider-supplied."
      }
    ],
    completed: false,
    endState: null,
    engine: null,
    providerAttentionAlerts: [],
    handoffPackage: null
  }),

  chips: [
    { label: "7821", when: (s) => s.gates.identity !== "passed" },
    { label: "Sister", when: (s) => s.gates.identity === "passed" && !s.fields["beneficiary.relationship"] },
    { label: "What applies for me?", when: (s) => s.fields["beneficiary.classification"] === "edb_age_gap" && s.gates.triage !== "passed" },
    { label: "Life Expectancy", when: (s) => s.gates.triage === "passed" && !s.fields["election.distribution_method"] },
    { label: "10-Year option", when: (s) => s.gates.triage === "passed" && !s.fields["election.distribution_method"] },
    { label: "Yes, set up a withdrawal", when: (s) => s.gates.election_resolution === "passed" && !s.fields["withdrawal_request_decision"] },
    { label: "Skip withdrawal setup", when: (s) => s.gates.election_resolution === "passed" && !s.fields["withdrawal_request_decision"] },
    { label: "$50,000 one-time", when: (s) => s.fields["withdrawal_request_decision"] === "proceed" && !s.fields["withdrawal_request_type"] },
    { label: "Default withholding (10%)", when: (s) => s.fields["withdrawal_request_type"] === "one_time" && !s.fields["federal_withholding_election"] }
  ]
};

/* ----------------------------------------------------------------------
   CUSTOM PERSONA BUILDER
   ---------------------------------------------------------------------- */
function buildCustomPersona(spec) {
  const {
    beneficiaryName = "Test Beneficiary",
    beneficiaryDob = "1985-01-01",
    iraType = "traditional",
    iraBalance = "$250,000",
    ownerName = "Test Owner",
    ownerDob = "1955-01-01",
    ownerDod = "2025-06-01",
    relationship = "spouse",
    isMinor = false,
    actorName = "",
    // Phase 2 expansions: explicit classification override + edge-case toggles
    explicitClassification = "",       // override the inferred beneficiary.classification
    isDisabled = false,                // EDB disabled (regardless of relationship)
    isChronicallyIll = false,          // EDB chronic illness
    isTrustBeneficiary = false,        // override to qualified_see_through_trust
    isEntity = false,                  // non-EDB non-person path
    enableWithdrawalFlow = false,      // demo Section 9 withdrawal flow at end
    withdrawalType = "one_time"        // lump_sum / one_time / standing
  } = spec || {};

  const isAuthRep = isMinor || actorName;
  let beneType = "individual";
  if (isTrustBeneficiary) beneType = "trust_trustee";
  else if (isEntity) beneType = "entity_rep";
  else if (isAuthRep) beneType = "authorized_representative";

  // Determine classification: explicit override wins; otherwise infer from inputs.
  let inferredClassification = "spouse";
  if (explicitClassification) {
    inferredClassification = explicitClassification;
  } else if (isTrustBeneficiary) {
    inferredClassification = "qualified_see_through_trust";
  } else if (isEntity) {
    inferredClassification = "non_edb_nonperson";
  } else if (relationship === "spouse") {
    inferredClassification = "spouse";
  } else if (relationship === "child" && isMinor) {
    inferredClassification = "edb_minor_child";
  } else if (isDisabled) {
    inferredClassification = "edb_disabled";
  } else if (isChronicallyIll) {
    inferredClassification = "edb_chronic_illness";
  } else {
    // Age-gap test: beneficiary not more than 10 years younger than owner
    const beneDobDate = new Date(beneficiaryDob);
    const ownerDobDate = new Date(ownerDob);
    const beneMinusTen = new Date(beneDobDate);
    beneMinusTen.setFullYear(beneMinusTen.getFullYear() - 10);
    if (beneMinusTen <= ownerDobDate) {
      inferredClassification = "edb_age_gap";
    } else {
      inferredClassification = "non_edb_person";
    }
  }

  const persona = {
    id: "custom",
    name: `Custom: ${beneficiaryName}`,
    initials: (beneficiaryName.split(" ").map((p) => p[0] || "").join("")).slice(0, 2).toUpperCase() || "??",
    age: null,
    sessionRef: `CUSTOM-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    provider: "Demo Custodian",
    laneHint: "Custom — engine determines",
    tagline: `${relationship}, ${iraType}, ${iraBalance}`,
    situation: `Custom test scenario. The triage engine will classify based on the inputs you provided.`,
    tag: "Custom test",

    personaPrompt: `## Session context (provider seed) — custom test scenario

This is a custom test session for **Demo Custodian**. The user has configured the inputs; the engine will route the case based on them.

Provider-seeded facts (already in your session state):
- Beneficiary: ${beneficiaryName}, born ${beneficiaryDob}
- ${isAuthRep ? `Actor (3D, the operator): ${actorName || "Authorized representative"} — operating on behalf of ${beneficiaryName}` : (isTrustBeneficiary ? `Actor (3D, the operator): ${actorName || "Trustee"} — operating on behalf of the trust` : `Actor: same as Subject (${beneficiaryName})`)}
- Owner: ${ownerName}, born ${ownerDob}, died ${ownerDod}
- IRA: ${iraType}, ${iraBalance}
- Beneficiary relationship: ${relationship}
- beneficiary.type: ${beneType}
- Death certificate: provider-verified

Test toggles applied to this case:
${isDisabled ? "- Beneficiary self-certifies as disabled (EDB)" : ""}
${isChronicallyIll ? "- Beneficiary self-certifies as chronically ill (EDB)" : ""}
${isTrustBeneficiary ? "- Trust beneficiary — Track 3 unified QST path applies" : ""}
${isEntity ? "- Entity beneficiary (estate / charity / corp) — non-EDB non-person path" : ""}
${enableWithdrawalFlow ? `- Withdrawal flow expected: after election/acknowledgment wrap, the user wants to set up a Section 9 ${withdrawalType.replace("_", " ")} withdrawal.` : ""}

Hint on the inferred classification (subject to engine confirmation): **${inferredClassification}**. The engine is the authority; if you're confident the inputs map to a different classification, set what you think and let the engine respond.

KBA expected answer: **1234** (any value the user types is recorded; KBA validation is theatrical in the prototype).

Operate per the Standard Session Flow in your reference material.`,

    initialState: () => ({
      fields: {
        "session.provider": "Demo Custodian",
        "session.status": "in_progress",
        "ira.type": iraType,
        "ira.balance": iraBalance,
        "owner.name": ownerName,
        "owner.dob": ownerDob,
        "owner.dod": ownerDod,
        "beneficiary.name": beneficiaryName,
        "beneficiary.dob": beneficiaryDob,
        "beneficiary.relationship": relationship,
        "beneficiary.type": beneType,
        ...(isAuthRep || isTrustBeneficiary ? { "actor.name (Operator, 3D)": actorName || (isTrustBeneficiary ? "[Trustee]" : "[Auth rep]") } : {})
      },
      gates: {
        ...(isAuthRep && !isTrustBeneficiary ? { authorized_representative: "pending" } : {}),
        ...(isTrustBeneficiary ? { trust_trustee: "pending", selfcert: "pending" } : {}),
        identity: "pending",
        death_cert: "pending",
        edb_conversation: "pending",
        triage: "pending",
        election_resolution: "pending",
        ...(enableWithdrawalFlow ? { withdrawal_request: "pending" } : {}),
        handoff_ready: "pending"
      },
      audit: [
        {
          time: nowStamp(),
          text: `Custom session seeded from Demo Custodian. Inferred classification: ${inferredClassification}.${enableWithdrawalFlow ? ` Withdrawal flow enabled (${withdrawalType}).` : ""}`
        }
      ],
      completed: false,
      endState: null,
      engine: null,
      providerAttentionAlerts: [],
      handoffPackage: null
    }),

    chips: [
      { label: "1234", when: (s) => s.gates.identity !== "passed" },
      { label: "Yes (confirm)", when: (s) => s.gates.identity === "passed" && (isDisabled || isChronicallyIll || isTrustBeneficiary) && !s.fields["selfcert.trust_status"] && !s.fields["edb.conversation_complete"] },
      { label: "What applies?", when: (s) => s.gates.identity === "passed" && s.gates.triage !== "passed" },
      { label: "Life Expectancy", when: (s) => s.gates.triage === "passed" && !s.fields["election.distribution_method"] && !s.fields["spouse.path_chosen"] },
      { label: "10-Year option", when: (s) => s.gates.triage === "passed" && !s.fields["election.distribution_method"] && !s.fields["spouse.path_chosen"] },
      { label: "Acknowledge", when: (s) => s.gates.triage === "passed" && (s.fields["engine.election_eligible"] === "not_eligible" || s.fields["engine.election_eligible"] === "determined_by_trust_beneficiaries") },
      ...(enableWithdrawalFlow ? [
        { label: `Set up ${withdrawalType.replace("_", " ")}`, when: (s) => s.gates.election_resolution === "passed" && !s.fields["withdrawal_request_decision"] },
        { label: "Skip withdrawal", when: (s) => s.gates.election_resolution === "passed" && !s.fields["withdrawal_request_decision"] }
      ] : [])
    ]
  };

  return persona;
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

const PERSONAS = {
  [ELENA.id]: ELENA,
  [MILO.id]: MILO,
  [DANE.id]: DANE,
  [MARISOL.id]: MARISOL
};

function getChipsForSession(session, persona) {
  if (!persona || !persona.chips) return [];
  return persona.chips
    .filter((chip) => {
      try {
        return chip.when(session.state);
      } catch (e) {
        return false;
      }
    })
    .map((chip) => chip.label)
    .slice(0, 5);
}

module.exports = { PERSONAS, buildCustomPersona, getChipsForSession };
