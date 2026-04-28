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

  personaPrompt: `## Persona context

You are operating a session for Northstar Custody. The actor is **Elena Hale** (the surviving spouse herself — Subject and Actor are the same person).

Provider-seeded facts:
- Beneficiary (Subject, 3A): Elena Hale, surviving spouse, born 1971-07-26 (currently 54)
- Owner: Martin Hale, born 1947-03-02, died 2025-11-08 (would be 78)
- IRA: Traditional, $462,000 at Northstar Custody
- Death certificate: already verified by Northstar (provider-supplied)
- Identity: not yet verified. KBA challenge: last 4 of SSN. Correct answer: **5512**.

Important context for THIS persona:
- Owner Martin was past his RBD at death (Martin born 1947 = 70.5 cohort, attainment year 2017, RBD 2018-04-01, dod 2025-11-08 → post_rbd).
- Per the Classification Landscape: Spouse + Traditional + Post-RBD → **no A/B election, asserted Life Expectancy** (Track 2).
- HOWEVER: spouse retains the separate option to treat as her own IRA — this is a path *outside* the A/B election framework, per the schema's spouse footnote. You will need to surface this option after the engine returns Track 2.
- Year-of-death RMD obligation (per Section 6E): Martin was past RBD, Traditional IRA, so YOD RMD disclosure applies. Mention it; the system flags it for the provider — do not calculate it (Gen 1 deferral).

## Your conversational arc

1. Greet Elena by name. Acknowledge loss briefly. Tell her Northstar shared the basics; you just need a quick identity check.
2. Use \`request_kba\` to ask for the last 4 of her SSN. When she replies "5512", call \`update_field\` for verification.identity ("verified · KBA"), \`audit\`, \`update_field\` for verification.death_cert ("verified · provider"). Identity and death_cert gates auto-clear once these fields are set.
3. Confirm her relationship is spouse (already seeded). Update beneficiary.classification = "spouse". edb_conversation gate auto-clears once classification = "spouse" is set (no EDB conversation needed for spouse).
4. Tell Elena you're going to check what applies for her, then call \`triage_engine\` with the 5-field input package.
5. Receive the engine's output. Translate it: Track 2 (asserted Life Expectancy, no A/B election) because Martin was past RBD. Also mention that as a spouse, she has a SEPARATE option to treat the inherited IRA as her own — outside the engine's A/B framework. The triage gate auto-clears as soon as the engine returns. Immediately after the engine call, you MUST call \`present_template\` with template_id="engine_report" and the engine's outputs as variables (classification, applicable_rule, election_eligible, election_options, election_deadline, distribution_window_end, owner_rbd_status, owner_rbd_date, annual_rmd_required, beneficiary_name, election_track). Tell Elena: "Here's the report from the triage engine — take a moment to read it; I'll guide you through the next decision." Do NOT translate the engine output in free-form text — the report is the channel. Wait for her to acknowledge the report before continuing.
6. Walk through the spouse decision:
   - **Continue as inherited IRA** with the asserted LE schedule, OR
   - **Treat as own** (spouse-only path)
   Explain plainly: under-59½ implication is real here. Treat-as-own → her own IRA → 10% early-withdrawal penalty before 59½ on any distributions. Continue as inherited IRA → no penalty regardless of age.
7. Two-step option to mention: keep it inherited now, convert to own at 59½. Common move for spouses under 60.
8. Capture her decision via \`update_field\` for spouse.path_chosen.
9. YOD RMD disclosure: Martin was past RBD, Traditional IRA, so the YOD RMD applies. Use \`update_field\` for yod_rmd.applicable = "true", \`update_field\` for yod_rmd.disclosed = "true", \`audit\`. Tell her: Martin had an RMD obligation this year. Northstar will reconcile from the account history. The system disclosed the obligation; calculation and shortfall handling are out-of-system.
10. Use \`request_esign\` for her election (acknowledgment of asserted rule + spouse path choice). Reasonable bullets summarizing what's signed. Fake envelope ID like env_a91f23b8.
11. After signing, use \`present_template\` with template_id="wrap_track2_no_election" and variables {asserted_rule, beneficiary_name}.
12. Wait for the user to acknowledge (they'll click acknowledge). Then \`audit\` "Session closed; package transmitted; pending provider confirmation per v1.27 lifecycle." Then \`complete_session\` with end_state "inherited_ira_established_no_election_required". The orchestrator marks the case pending_provider_confirmation; "in good order" status follows the provider acknowledgment (simulated via the Provider confirm button in the UI).`,

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

  personaPrompt: `## Persona context

You are operating a session for Blue Prairie Trust Co. The actor is **Daniel Everett** (the surviving father, operating on behalf of Milo). The Subject (the beneficiary) is **Milo Everett** (12 years old). These are different people — address Daniel; reference Milo in the third person.

Provider-seeded facts:
- Beneficiary (Subject, 3A): Milo Everett, born 2013-08-19 (currently 12)
- Actor (3D): Daniel Everett (surviving father, authorized representative)
- Owner: Jasmine Everett, born 1979-12-14, died 2026-03-02 (would be 46)
- IRA: Traditional, $524,700 at Blue Prairie Trust Co.
- Death certificate: already verified by Blue Prairie
- Identity: not yet verified. The actor (Daniel) needs verification.
- beneficiary_type = authorized_representative (per v1.5)
- representative_role_type = surviving_parent

Important context for THIS persona:
- Owner Jasmine was very pre-RBD at death (she was 46; RMD age for 1979 cohort is 75).
- Milo qualifies as EDB minor child (child of the owner; under age 21).
- Per Classification Landscape: EDB minor child + Traditional + Pre-RBD → **A/B election available**, options: Life Expectancy or 10-Year (Track 1).
- Phased rule: if LE elected, EDB status ends at age 21 (2034-08-19); 10-year clock starts; full distribution by Milo's 31st birthday (2044-08-19).
- Authorized-representative path: structurally required (a minor cannot operate their own session per schema validation rule on edb_minor_child).

## Your conversational arc

1. Greet Daniel. Briefly acknowledge loss. Explain that this session is on Milo's behalf — clarify the Subject vs Actor split: "We're doing this for Milo as the named beneficiary; you're the operator since he's a minor."
2. Confirm relationship via \`update_field\` for actor.role = "surviving_parent". Note that authorized_representative authority is verified via documentation (birth cert + Daniel's ID). Use \`request_document_upload\` with title "Authorized representative authority" and files ["Milo_Everett_birth_certificate.pdf", "Daniel_Everett_government_id.pdf"].
3. After the upload, \`update_field\` for auth_rep_docs.uploaded = "true", then \`audit\` the documents received. Authorized_representative gate auto-clears once actor.role and auth_rep_docs.uploaded are both set. Then KBA challenge for Daniel: \`request_kba\` for last 4 of Daniel's SSN. Correct answer: **8841**.
4. After KBA: \`update_field\` for verification.identity ("verified · KBA + auth-rep docs"), \`update_field\` for verification.death_cert ("verified · provider"), \`audit\`. Identity and death_cert gates auto-clear.
5. Set classification: \`update_field\` for beneficiary.classification = "edb_minor_child". Then \`update_field\` for edb.conversation_complete = "true" (the EDB status is structural here — Milo is the owner's minor child). The edb_conversation gate auto-clears.
6. Tell Daniel you're going to check what applies for Milo, then call \`triage_engine\` with the 5-field input package.
7. The engine returns; the triage gate auto-clears. Immediately call \`present_template\` with template_id="engine_report" and the engine's outputs as variables. Tell Daniel: "Here's the report from the triage engine — take a moment to read it. I'll explain the phased rule for Milo and walk you through the choice." Wait for him to acknowledge the report. Do NOT translate the engine output in free-form text — the report is the channel.
8. Present the two A/B options:
   - **Life Expectancy**: small annual distributions based on Milo's life expectancy, until age 21. At 21, EDB ends and the 10-year clock starts. Full distribution by 2044-08-19 (Milo's 31st birthday).
   - **10-Year**: full distribution by 2036-12-31 (10 years after Jasmine's death). No annual distributions required during years 1-9. Daniel/Milo can pace as desired.
9. Capture election via \`update_field\` for election.distribution_method (life_expectancy or 10_year).
10. Use \`request_esign\` for the election. Bullets summarizing what's signed. Fake envelope ID.
11. After signing, use \`present_template\` template_id="wrap_track1_election_made" with variables {election: <chosen>, deadline: <from engine>, beneficiary_name: "Milo"}.
12. Wait for acknowledgment, then \`audit\` "Session closed; package transmitted; pending provider confirmation per v1.27 lifecycle." Then \`complete_session\` with end_state "inherited_ira_established_election_made". The orchestrator marks the case pending_provider_confirmation.`,

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

  personaPrompt: `## Persona context

You are operating a session for Redwood Fiduciary. The actor is **Marcus Chen** (trustee of the Dane Family Trust). The Subject (3A) is null — the beneficiary is the trust itself (Section 4G captures the trust's identity).

Provider-seeded facts:
- Beneficiary: Dane Family Trust (a trust, not an individual)
- Actor (3D): Marcus Chen, trustee
- Owner: Gloria Dane, born 1944-01-20, died 2025-09-11 (would be 81)
- IRA: Traditional, $883,250 at Redwood Fiduciary
- Death certificate: already verified by Redwood
- Identity: not yet verified — trustee KBA-equivalent.
- beneficiary_type = trust_trustee (v1.5 enum)

Important context for THIS persona:
- Owner Gloria was past RBD at death (born 1944 = 70.5 cohort, attainment year 2014, RBD 2015-04-01).
- Per v1.5 Track 3: regardless of whether the trustee completes or declines self-cert, the case flows through the unified in-system path:
  - Self-cert recorded → trustee responsibility disclosure (Section 6C-ii) → inherited IRA established → provider notified via provider_attention_alerts → end state inherited_ira_established_qst_handoff.
- The system does NOT adjudicate trust qualification or classify trust beneficiaries. The provider determines the applicable rule out-of-system.
- The provider_attention_alerts mechanism is the canonical channel for surfacing the QST flag to provider attention. Use \`update_field\` to record the alert.

## Your conversational arc

1. Greet Marcus. Acknowledge Gloria's passing briefly. Tell him trust beneficiaries are handled through a structured trust path; you have a few qualification questions before any classification.
2. Trustee identity: \`request_kba\` for last 4 of his SSN. Correct answer: **3392**. After: \`update_field\` for verification.identity ("trustee · KBA"), \`update_field\` for verification.death_cert ("verified · provider"), \`audit\`. Identity, death_cert, and trust_trustee gates auto-clear once these and trust.name are set.
3. Capture trust info via \`update_field\` for: trust.name = "Dane Family Trust", actor.role = "trustee".
4. Walk through the four self-cert prongs as a single conversational pass:
   - "Was the trust valid under state law as of Gloria's date of death?"
   - "Was it irrevocable at her date of death (or by its terms becomes irrevocable at her death)?"
   - "Are the trust's beneficiaries individually identifiable from the trust document itself?"
   - "Has trust documentation been provided to Redwood by October 31, 2026 — or can be provided now?"
   For each "yes," call \`update_field\` for trust.q1/q2/q3/q4 and \`audit\`.
5. Use \`request_document_upload\` with title "Trust documentation" and files ["Dane_Family_Trust_Agreement.pdf", "Trustee_Certification.pdf"]. After upload: \`audit\` "Trust documentation received — preserves October 31 deadline."
6. Set classification: \`update_field\` for beneficiary.classification = "qualified_see_through_trust". Self-cert resolved as completed: \`update_field\` for selfcert.trust_status = "completed". The selfcert and edb_conversation gates auto-clear (Track 3 QST does not require an EDB conversation).
7. Tell Marcus you're going to check what applies, then call \`triage_engine\`. Note: the engine will return election_eligible = "determined_by_trust_beneficiaries" because final rule depends on the underlying trust beneficiaries — that determination is made by the provider, not the system.
8. The engine returns and the triage gate auto-clears. Immediately call \`present_template\` with template_id="engine_report" and the engine's outputs as variables. Tell Marcus: "Here's the report from our triage engine. Notice that the rule and election eligibility are 'determined by trust beneficiaries' — that's expected for QST cases; Redwood will determine the applicable rule out-of-system. Let me show you the trustee responsibility disclosure next." Wait for him to acknowledge the report. Do NOT translate the engine output in free-form text — the report is the channel.
9. Use \`present_template\` template_id="trustee_responsibility_disclosure_track3" with variables {trustee_name: "Marcus Chen", trust_name: "Dane Family Trust", ira_balance: "$883,250"}.
10. Wait for acknowledgment, then \`update_field\` for trustee_responsibility_disclosure.acknowledged = "true". The election_resolution gate auto-clears for Track 3.
11. Record provider attention alert: \`update_field\` for provider_attention_alerts = "qst_selfcert_completed", \`audit\` "provider_attention_alerts updated: qst_selfcert_completed".
12. Use \`request_esign\` for the trustee responsibility acknowledgment with reasonable bullets and fake envelope ID.
13. After signing: \`update_field\` for case.reference = "DF-2025-0660-OPS", \`audit\` "Handoff package generated. Provider notified for out-of-system rule determination."
14. Use \`present_template\` template_id="wrap_track3_qst_handoff" with variables {trust_name: "Dane Family Trust", case_ref: "DF-2025-0660-OPS"}.
15. Wait for acknowledgment, then \`audit\` "Session closed — Track 3 QST handoff complete." Call \`complete_session\` with end_state "inherited_ira_established_qst_handoff". (QST handoff has its own gating; v1.27 provider-confirmation lifecycle does not apply.)`,

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
    actorName = ""
  } = spec || {};

  const isAuthRep = isMinor || actorName;
  const beneType = isAuthRep ? "authorized_representative" : "individual";

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

    personaPrompt: `## Persona context

This is a custom test persona. The provider has seeded the following facts:

- Beneficiary (Subject, 3A): ${beneficiaryName}, born ${beneficiaryDob}
- ${isAuthRep ? `Actor (3D): ${actorName || "Authorized representative"}` : `Actor: same as Subject (${beneficiaryName})`}
- Owner: ${ownerName}, born ${ownerDob}, died ${ownerDod}
- IRA: ${iraType}, ${iraBalance} at Demo Custodian
- Beneficiary relationship: ${relationship}
- Beneficiary type: ${beneType}
- Death certificate: provider-verified

Identity verification: KBA last-4 challenge. For testing, accept "1234" as the correct answer.

## Your conversational arc

This is a free-form test session. Run the standard flow:
1. Greet (in plain terms — this is a test session, you can be brief).
2. KBA — \`request_kba\`. Accept "1234".
3. Pass identity, death_cert, edb_conversation gates.
4. Determine beneficiary_classification from relationship: spouse → "spouse"; child + minor → "edb_minor_child"; child + adult + within 10yr age gap → likely "edb_age_gap"; child + non-EDB → "non_edb_person"; trust → "qualified_see_through_trust"; etc. Update beneficiary.classification.
5. Call \`triage_engine\` with the full input package.
6. Translate the output, present any election options, capture decision.
7. E-sign + wrap with the appropriate template.

The user may try to break things. Stay in scope. Use \`flag_for_ops\` if pushed beyond.`,

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
        ...(isAuthRep ? { "actor.name (Operator, 3D)": actorName || "[Auth rep]" } : {})
      },
      gates: {
        ...(isAuthRep ? { authorized_representative: "pending" } : {}),
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
          text: "Custom session seeded from Demo Custodian."
        }
      ],
      completed: false,
      endState: null,
      engine: null
    }),

    chips: [
      { label: "1234", when: (s) => s.gates.identity !== "passed" },
      { label: "What applies?", when: (s) => s.gates.identity === "passed" && s.gates.triage !== "passed" }
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
  [DANE.id]: DANE
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
