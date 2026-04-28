/* ======================================================================
   PERSONAS — v5 deterministic
   ======================================================================
   Pure provider-seed data. No LLM prompts, no conversational scripts.
   Each persona supplies the initial session state the orchestrator
   would normally receive from the provider's API. The form-driven
   workflow takes it from there.
   ====================================================================== */

const ELENA = {
  id: "elena-hale",
  name: "Elena Hale",
  initials: "EH",
  age: 54,
  sessionRef: "EH-2025-1187",
  provider: "Northstar Custody",
  laneHint: "Track 2 (post-RBD spouse)",
  tagline: "Recently widowed. $462K traditional IRA. Spouse + post-RBD owner = Track 2 with separate treat-as-own option.",
  situation:
    "Martin passed three months ago, age 78 — past his Required Beginning Date. Elena is 54. Per v1.5 schema, Track 2 (asserted Life Expectancy), but she retains the spouse-only treat-as-own path outside the A/B framework.",
  tag: "Track 2 + spouse treat-as-own",
  kbaAnswer: "5512",
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
      { time: nowStamp(), text: "Session seeded from Northstar Custody (provider_api). Subject=Actor (Elena Hale). Death certificate provider-supplied." }
    ],
    completed: false,
    endState: null,
    engine: null,
    providerAttentionAlerts: [],
    handoffPackage: null,
    uiAcks: {},
    welcomeAcked: false
  })
};

const MILO = {
  id: "milo-everett",
  name: "Milo Everett (via parent)",
  initials: "ME",
  age: 12,
  sessionRef: "ME-2026-0331",
  provider: "Blue Prairie Trust Co.",
  laneHint: "Track 1 EDB minor child · Subject ≠ Actor",
  tagline: "12-year-old beneficiary; surviving parent operates the session.",
  situation:
    "Jasmine Everett died in March. Her son Milo (12) inherits a $524,700 traditional IRA. Pre-RBD owner; minor child of decedent. Track 1 with A/B election available; surviving father Daniel is the actor (Section 3D).",
  tag: "Subject vs Actor · Track 1 EDB minor",
  kbaAnswer: "8841",
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
      "beneficiary.name": "Milo Everett",
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
      { time: nowStamp(), text: "Session seeded from Blue Prairie Trust Co. Subject=Milo Everett (minor); Actor=Daniel Everett (surviving father). Authorized representative gate active." }
    ],
    completed: false,
    endState: null,
    engine: null,
    providerAttentionAlerts: [],
    handoffPackage: null,
    uiAcks: {},
    welcomeAcked: false
  })
};

const DANE = {
  id: "dane-trust",
  name: "Dane Family Trust (Track 3)",
  initials: "DF",
  age: null,
  sessionRef: "DF-2025-0660",
  provider: "Redwood Fiduciary",
  laneHint: "Track 3 unified QST handoff",
  tagline: "Trustee operating session. QST self-cert + responsibility disclosure.",
  situation:
    "Gloria Dane named the Dane Family Trust as her IRA beneficiary. Track 3 unified QST: trustee self-certifies, acknowledges the trustee responsibility disclosure, the inherited IRA is established in-system, and the provider determines applicable rule out-of-system.",
  tag: "Track 3 — QST handoff",
  kbaAnswer: "3392",
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
      "beneficiary.dob": "1944-01-20",
      "beneficiary.type": "trust_trustee",
      "actor.name (Operator, 3D)": "Marcus Chen",
      "actor.role": "trustee",
      "actor.relationship_to_subject": "trustee"
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
      { time: nowStamp(), text: "Session seeded from Redwood Fiduciary. Subject=null (trust beneficiary); Actor=Marcus Chen (trustee). Track 3 unified QST path." }
    ],
    completed: false,
    endState: null,
    engine: null,
    providerAttentionAlerts: [],
    handoffPackage: null,
    uiAcks: {},
    welcomeAcked: false
  })
};

const MARISOL = {
  id: "marisol-ortega",
  name: "Marisol Ortega",
  initials: "MO",
  age: 58,
  sessionRef: "MO-2026-0418",
  provider: "Lakeshore Trust Bank",
  laneHint: "Track 1 EDB age-gap · withdrawal request flow",
  tagline: "Age-gap sibling. $310K traditional, owner pre-RBD. Demonstrates Section 9 withdrawal flow.",
  situation:
    "Daniel Ortega died at 64 (pre-RBD). His sister Marisol (58) inherits a $310K traditional IRA. EDB age-gap (less than 10 years younger). Track 1 with A/B election; intended scenario exercises a one-time withdrawal afterward.",
  tag: "Track 1 EDB · withdrawal_request",
  kbaAnswer: "7821",
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
      { time: nowStamp(), text: "Session seeded from Lakeshore Trust Bank. Subject=Actor (Marisol Ortega). Death certificate provider-supplied." }
    ],
    completed: false,
    endState: null,
    engine: null,
    providerAttentionAlerts: [],
    handoffPackage: null,
    uiAcks: {},
    welcomeAcked: false
  })
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
    isTrustBeneficiary = false,
    isEntity = false,
    enableWithdrawalFlow = false
  } = spec || {};

  const isAuthRep = isMinor || actorName;
  let beneType = "individual";
  if (isTrustBeneficiary) beneType = "trust_trustee";
  else if (isEntity) beneType = "entity_rep";
  else if (isAuthRep) beneType = "authorized_representative";

  const persona = {
    id: "custom",
    name: `Custom: ${beneficiaryName}`,
    initials: (beneficiaryName.split(" ").map((p) => p[0] || "").join("")).slice(0, 2).toUpperCase() || "??",
    age: null,
    sessionRef: `CUSTOM-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    provider: "Demo Custodian",
    laneHint: "Custom — engine determines",
    tagline: `${relationship}, ${iraType}, ${iraBalance}`,
    situation: "Custom test scenario. The triage engine routes the case based on the inputs you provided.",
    tag: "Custom test",
    kbaAnswer: "1234",
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
        ...(isAuthRep && !isTrustBeneficiary ? { "actor.name (Operator, 3D)": actorName || "[Auth rep]" } : {}),
        ...(isTrustBeneficiary ? { "actor.name (Operator, 3D)": actorName || "[Trustee]", "actor.role": "trustee" } : {})
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
        { time: nowStamp(), text: `Custom session seeded from Demo Custodian. Relationship: ${relationship}.` }
      ],
      completed: false,
      endState: null,
      engine: null,
      providerAttentionAlerts: [],
      handoffPackage: null,
      uiAcks: {},
      welcomeAcked: false
    })
  };
  return persona;
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

const PERSONAS = {
  [ELENA.id]: ELENA,
  [MILO.id]: MILO,
  [DANE.id]: DANE,
  [MARISOL.id]: MARISOL
};

module.exports = { PERSONAS, buildCustomPersona };
