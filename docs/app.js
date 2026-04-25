/* ======================================================================
   CONVERGENT INHERITED IRA TRANSITION — SCRIPTED WALKTHROUGH
   ====================================================================== */

const root = document.getElementById("root");

/* ----------------------------------------------------------------------
   PERSONAS
   ---------------------------------------------------------------------- */
const personas = {
  "elena-hale": {
    id: "elena-hale",
    name: "Elena Hale",
    initials: "EH",
    age: 54,
    sessionRef: "EH-2025-1187",
    provider: "Northstar Custody",
    lane: "Lane 1 — Spouse",
    tagline: "Recently widowed. $462,000 traditional IRA.",
    situation:
      "Martin passed three months ago. The account is at a smaller specialty custodian. Elena is 54 — too young to roll into her own IRA without exposing herself to early-withdrawal penalties on near-term distributions.",
    tag: "Under-59½ spouse decision"
  },
  "milo-everett": {
    id: "milo-everett",
    name: "Milo Everett",
    initials: "ME",
    age: 12,
    sessionRef: "ME-2026-0331",
    provider: "Blue Prairie Trust Co.",
    lane: "Lane 4 — Minor child EDB",
    tagline: "12-year-old minor. Guardian: surviving father.",
    situation:
      "Jasmine Everett died in March. The account ($524,700) goes to her son Milo — a minor. The session can't disclose anything until guardian status is verified. Once cleared, Milo enters the minor-child two-phase rule.",
    tag: "Guardian gate · phased rule"
  },
  "dane-trust": {
    id: "dane-trust",
    name: "Dane Family Trust",
    initials: "DF",
    age: null,
    sessionRef: "DF-2025-0660",
    provider: "Redwood Fiduciary",
    lane: "Lane 5 — Entity / trust",
    tagline: "Trust beneficiary. Trustee on the line.",
    situation:
      "Gloria Dane named the Dane Family Trust as her IRA beneficiary. The trust may qualify for see-through treatment, but final classification needs human review. The system runs the threshold check, captures docs, and escalates with a clean handoff.",
    tag: "Graceful ops escalation"
  }
};

/* ----------------------------------------------------------------------
   GATES — one shared template applied per session
   ---------------------------------------------------------------------- */
const GATE_DEFS = [
  { id: "identity", label: "Identity verified" },
  { id: "death_cert", label: "Death certificate" },
  { id: "guardian", label: "Guardian authority", optional: true },
  { id: "edb_conversation", label: "EDB conversation" },
  { id: "triage", label: "Triage classification" },
  { id: "election_resolution", label: "Election resolution" },
  { id: "handoff_ready", label: "Handoff ready" }
];

/* ----------------------------------------------------------------------
   SCRIPTS — list of steps. Each step has a type and optional effects.
   Step types:
     agent      — message from the orchestrator/agent. Auto-continues unless
                  awaitContinue: true (then a "Continue" button appears).
     user       — narrate a beneficiary statement (bubble on the right).
                  Auto-continues.
     choice     — present buttons; each option carries its own effects + next.
     upload     — present a document upload mock; click to confirm.
     esign      — present an e-sign summary; click to sign.
     wait       — typing indicator for ms; auto-continues.
     end        — end the simulation and show outro card.

   Effects (applied when step renders / option chosen):
     audit:  string or array of strings — appended to audit log
     gates:  array of gate ids — flipped to passed
     flag:   array of gate ids — flipped to flagged (warning state)
     set:    object of dot-paths to values — merged into state.fields
   ---------------------------------------------------------------------- */
const scripts = {
  /* ---------------------------------------------------------------- ELENA */
  "elena-hale": [
    {
      type: "agent",
      text:
        "Elena — first, we're sorry for your loss.\n\nNorthstar Custody connected us so you don't have to start from scratch. We already have most of what we need about Martin's account.\n\nLet's start with a quick identity check, then we'll walk through your options together.",
      effects: {
        audit: "Session seeded from Northstar Custody (provider_api).",
        set: {
          "session.status": "in_progress",
          "session.provider": "Northstar Custody",
          "ira.type": "traditional",
          "ira.balance": "$462,000"
        }
      }
    },
    {
      type: "choice",
      prompt: "Confirm the last 4 of your Social Security number:",
      options: [
        {
          label: "5512",
          effects: {
            audit: "Identity verified via KBA (3 of 3 challenges passed).",
            gates: ["identity", "death_cert"],
            set: {
              "verification.identity": "verified · KBA",
              "verification.death_cert": "verified (provider-supplied)"
            }
          }
        }
      ]
    },
    {
      type: "agent",
      text:
        "Verified. We're good on identity.\n\nNorthstar already has Martin's death certificate on file too — nothing needed from you there."
    },
    {
      type: "agent",
      text:
        "Because you're Martin's surviving spouse, you have the broadest set of options of any beneficiary type.\n\nThere's one decision that matters a lot for someone in your situation. Want to walk through it with me?",
      effects: {
        audit: "Triage engine called. Classification: Spouse (Lane 1). Spouse own-IRA rule set applicable.",
        gates: ["edb_conversation", "triage"],
        set: {
          "classification.lane": "Lane 1 — Spouse",
          "classification.rule_set": "spouse_own_ira"
        }
      },
      awaitContinue: true,
      continueLabel: "Yes, walk me through it"
    },
    {
      type: "agent",
      text:
        "You have two main paths.\n\n**Treat it as your own IRA.** It folds into your retirement and it's yours. Same rules as any other IRA you own — required distributions start at age 73, you control the investments, you name your own beneficiaries.\n\n**Keep it as an inherited IRA.** It stays separate, with different distribution rules.",
      awaitContinue: true,
      continueLabel: "Got it — what's the catch?"
    },
    {
      type: "agent",
      text:
        "The thing that matters for you specifically: you're 54.\n\nIf you treat it as your own IRA and need to take money out before age 59½, you'll pay a 10% early withdrawal penalty on top of normal income tax.\n\nIf you keep it as an inherited IRA, you can take distributions without that penalty — at any age.",
      awaitContinue: true,
      continueLabel: "What do most spouses my age do?"
    },
    {
      type: "agent",
      text:
        "Two-step strategy is common: keep it as an inherited IRA now, then convert to your own IRA when you turn 59½.\n\nThat way you have access to the money without penalty between now and then, and full IRA flexibility after. We'll set a reminder for your 59½ birthday so you can decide then. You don't have to commit to converting now."
    },
    {
      type: "choice",
      prompt: "How would you like to proceed?",
      options: [
        {
          label: "Keep it as an inherited IRA",
          effects: {
            audit: "Election: Inherited IRA. Two-step strategy. Conversion reminder scheduled for 2030-07-26.",
            set: {
              "election.method": "Inherited IRA",
              "election.rationale": "Under 59½ — penalty exposure avoided",
              "schedule.reminder_59_5": "2030-07-26"
            }
          },
          next: "yod"
        },
        {
          label: "Treat it as my own IRA",
          effects: {
            audit: "Election: Treat as own IRA. Under-59½ penalty disclosure presented and acknowledged.",
            set: {
              "election.method": "Treat as own IRA",
              "election.rationale": "Penalty risk acknowledged"
            }
          },
          next: "yod"
        },
        {
          label: "I'd like to talk to someone first",
          effects: {
            audit: "Election deferred at beneficiary request. Session suspended pending advisor consultation.",
            set: {
              "election.method": "Deferred — beneficiary requested advisor",
              "session.status": "suspended"
            }
          },
          next: "deferred"
        }
      ]
    },
    {
      id: "yod",
      type: "agent",
      text:
        "One more thing. Martin was 78. The IRS required him to take a distribution from this account this year — what's called a year-of-death RMD. Did Martin take that distribution before he passed?"
    },
    {
      type: "choice",
      options: [
        {
          label: "I think so, but I'm not sure",
          effects: {
            audit: "YOD RMD flagged for verification. Northstar to check account history and reconcile.",
            flag: [],
            set: { "flags.yod_rmd": "Pending Northstar verification" }
          }
        },
        {
          label: "Yes, he took it",
          effects: {
            audit: "YOD RMD confirmed satisfied by owner.",
            set: { "flags.yod_rmd": "Satisfied" }
          }
        },
        {
          label: "No, he didn't",
          effects: {
            audit: "YOD RMD shortfall — Northstar will process from account before completing setup.",
            set: { "flags.yod_rmd": "Shortfall — Northstar to process" }
          }
        }
      ]
    },
    {
      type: "agent",
      text:
        "Got it. Northstar will check Martin's account history. If a year-of-death distribution is still owed, they'll process it from the account before completing setup — automatic, you don't need to do anything separately.\n\nLast step: a quick e-signature on your election."
    },
    {
      type: "esign",
      title: "Beneficiary Election — Inherited IRA",
      bullets: [
        "You are electing to keep Martin's IRA as an inherited IRA in your name.",
        "Annual required minimum distributions will be calculated using the single life expectancy table.",
        "You retain the right to roll this account into your own IRA on or after your 59½ birthday (July 26, 2030).",
        "A reminder will be sent in advance of that date so you can decide at the right time."
      ],
      envelope: "DocuSign envelope env_a91f23b8",
      effects: {
        audit: "Election form e-signed via DocuSign envelope env_a91f23b8.",
        gates: ["election_resolution"],
        set: { "esign.election": "Signed (env_a91f23b8)" }
      }
    },
    {
      type: "agent",
      text:
        "All set, Elena.\n\n• Northstar will retitle the account: \"Martin Hale, deceased 11/8/2025, IRA F/B/O Elena Hale.\"\n• Annual distribution reminders will go out each November.\n• Your 59½ conversion reminder fires on July 26, 2030.\n• A confirmation package is on its way to elena.hale@example.com.\n\nIf you have questions later, the same chat link will reopen this conversation.",
      effects: {
        audit: "Confirmation package sent to elena.hale@example.com. Handoff package transmitted to Northstar Custody.",
        gates: ["handoff_ready"],
        set: { "session.status": "completed" }
      }
    },
    { type: "end", outcome: "Inherited IRA established · election captured · handoff transmitted" },

    // Branch: deferred
    {
      id: "deferred",
      type: "agent",
      text:
        "Of course. We'll pause here. The decision can stay open while you talk things through.\n\nNo deadline pressure today — under SECURE Act rules, your election deadline isn't until December 31 of the year after Martin's death. We'll send a reminder a couple of months before, and the same chat link will pick up where we left off.",
      effects: {
        audit: "Session suspended at beneficiary request. Re-entry token issued (30-day expiry).",
        set: { "schedule.reentry_token": "Issued · 30-day expiry" },
        gates: ["election_resolution", "handoff_ready"]
      }
    },
    { type: "end", outcome: "Election deferred · session suspended · re-entry available" }
  ],

  /* ---------------------------------------------------------------- MILO */
  "milo-everett": [
    {
      type: "agent",
      text:
        "Hello — you've reached Convergent on behalf of Milo Everett, the minor child of Jasmine Everett.\n\nFirst, we're sorry for your loss. Before we share any account details, we need to verify that you have legal authority to act on Milo's behalf.",
      effects: {
        audit: "Session seeded from Blue Prairie Trust Co. (ops_initiated). Beneficiary type: minor child — guardian gate active.",
        set: {
          "session.status": "in_progress",
          "session.provider": "Blue Prairie Trust Co.",
          "beneficiary.type": "minor (age 12)",
          "ira.type": "traditional",
          "ira.balance": "$524,700"
        }
      }
    },
    {
      type: "choice",
      prompt: "What's your relationship to Milo?",
      options: [
        {
          label: "Surviving parent",
          effects: {
            audit: "Guardian relationship: surviving parent. Documentation requirements: birth certificate, government ID.",
            set: { "guardian.relationship": "Surviving parent" }
          }
        },
        {
          label: "Court-appointed guardian",
          effects: {
            audit: "Guardian relationship: court-appointed. Documentation: letters of guardianship + ID.",
            set: { "guardian.relationship": "Court-appointed" }
          },
          next: "courtGuardian"
        },
        {
          label: "Other",
          effects: {
            audit: "Guardian status unclear. Hard escalation to provider operations — session cannot proceed self-service.",
            flag: ["guardian"],
            set: {
              "guardian.relationship": "Unverified — escalated",
              "session.status": "escalated"
            }
          },
          next: "guardianEscalate"
        }
      ]
    },
    {
      type: "agent",
      text:
        "Got it. In most states, a surviving parent has automatic legal authority for a minor's inherited IRA — no court order needed.\n\nWe'll need two things: a copy of Milo's birth certificate showing you as parent, and your government-issued ID."
    },
    {
      type: "upload",
      title: "Upload guardian documentation",
      files: ["Milo_Everett_birth_certificate.pdf", "Government_ID_front_back.pdf"],
      effects: {
        audit: "Guardian documents received: birth certificate, government ID. Pending review.",
        set: { "guardian.docs": "Received — pending review" }
      }
    },
    { type: "wait", ms: 1400, message: "Reviewing guardian documents…" },
    {
      type: "agent",
      text:
        "Verified. You're confirmed as Milo's legal guardian for purposes of this account.\n\nNow I can share what's happening with the account and walk through how distributions work for someone in Milo's situation.",
      effects: {
        audit: "Guardian status verified by ops review. Identity gate cleared.",
        gates: ["identity", "guardian", "death_cert"],
        set: {
          "verification.identity": "verified · KBA + guardian docs",
          "verification.death_cert": "verified (provider-supplied)",
          "guardian.docs": "Verified"
        }
      }
    },
    {
      type: "agent",
      text:
        "Because Milo is the minor child of Jasmine, he qualifies as an Eligible Designated Beneficiary — an EDB.\n\nThat triggers a special two-phase rule that's unique to minor children of the account owner. I'll walk through both phases.",
      effects: {
        audit: "Classification: EDB minor child (Lane 4). Two-phase distribution rule applicable.",
        gates: ["edb_conversation", "triage"],
        set: {
          "classification.lane": "Lane 4 — Minor child EDB",
          "classification.rule_set": "life_expectancy_until_21_then_10_year"
        }
      },
      awaitContinue: true,
      continueLabel: "Walk me through it"
    },
    {
      type: "agent",
      text:
        "**Phase 1 — until Milo turns 21.**\n\nMilo takes a small annual distribution based on his life expectancy. The IRS sets the rate using a published table. Starting at $524,700, his first-year distribution comes out to about $7,500.\n\nThese distributions can be reinvested or saved for him — they're his money, and you'd manage them as guardian until he reaches majority.",
      awaitContinue: true,
      continueLabel: "And after 21?"
    },
    {
      type: "agent",
      text:
        "**Phase 2 — at age 21, the 10-year clock starts.**\n\nWhen Milo turns 21, he takes over the account in his own name. From that point, the entire remaining balance must be distributed by his 31st birthday.\n\nWe'll calendar that transition automatically. On August 19, 2034, the system will switch Milo from Phase 1 to Phase 2 and update his distribution schedule.",
      effects: {
        audit: "Age-of-majority transition calendared: 2034-08-19.",
        set: {
          "schedule.first_distribution": "2026-12-31 · ~$7,500",
          "schedule.age_21_transition": "2034-08-19",
          "schedule.full_liquidation_by": "2044-08-19"
        }
      }
    },
    {
      type: "choice",
      prompt: "Ready to acknowledge the schedule on Milo's behalf?",
      options: [
        {
          label: "Yes — proceed to e-sign",
          effects: {}
        },
        {
          label: "I'd like a copy of the schedule first",
          effects: {
            audit: "Distribution schedule PDF generated and emailed at guardian's request.",
            set: { "schedule.pdf_sent": "Sent to guardian email" }
          }
        }
      ]
    },
    {
      type: "esign",
      title: "Guardian Acknowledgment — Minor Child EDB Schedule",
      bullets: [
        "Confirms you have legal authority to act on Milo's behalf for this account.",
        "Acknowledges the Phase 1 life-expectancy distribution schedule beginning 12/31/2026.",
        "Acknowledges the Phase 2 transition that begins automatically on Milo's 21st birthday (8/19/2034).",
        "Acknowledges the 10-year liquidation deadline of 8/19/2044."
      ],
      envelope: "DocuSign envelope env_d4c819e2",
      effects: {
        audit: "Guardian acknowledgment e-signed via DocuSign envelope env_d4c819e2.",
        gates: ["election_resolution"],
        set: { "esign.guardian_ack": "Signed (env_d4c819e2)" }
      }
    },
    {
      type: "agent",
      text:
        "All set.\n\n• Blue Prairie will retitle the account: \"Jasmine Everett, deceased 3/2/2026, IRA F/B/O Milo Everett (minor).\"\n• Milo's first distribution is scheduled for December 31, 2026.\n• You'll receive quarterly status updates and an annual distribution confirmation each year.\n• When Milo turns 21, the system will reach out to him directly to walk through Phase 2.\n\nA full confirmation package is on its way to your email.",
      effects: {
        audit: "Confirmation package sent. Handoff package transmitted to Blue Prairie Trust Co.",
        gates: ["handoff_ready"],
        set: { "session.status": "completed" }
      }
    },
    { type: "end", outcome: "Inherited IRA (minor) established · two-phase schedule calendared · handoff transmitted" },

    // Branches
    {
      id: "courtGuardian",
      type: "agent",
      text:
        "Got it. We'll need two things: a court-issued letters of guardianship document naming you, and your government-issued ID.\n\nIf the appointment is with conditions or limited scope, please upload the full order so our review team can confirm it covers financial accounts."
    },
    {
      type: "upload",
      title: "Upload guardian documentation",
      files: ["Letters_of_Guardianship.pdf", "Government_ID_front_back.pdf"],
      effects: {
        audit: "Court-appointed guardian documents received. Pending legal review.",
        set: { "guardian.docs": "Received — pending legal review" }
      }
    },
    { type: "wait", ms: 1800, message: "Routing to legal review team…" },
    {
      type: "agent",
      text:
        "Thanks. Court-appointed guardianship documents need a manual legal review before we can disclose account details. Blue Prairie's operations team will reach out within 1–2 business days.\n\nA case reference has been generated. You can return to this same link any time after review completes.",
      effects: {
        audit: "Session suspended pending legal review of guardianship order. Case routed to Blue Prairie ops.",
        flag: ["guardian"],
        gates: ["handoff_ready"],
        set: {
          "session.status": "suspended — legal review",
          "case.reference": "ME-2026-0331-OPS"
        }
      }
    },
    { type: "end", outcome: "Court-appointed guardianship · routed for legal review · session suspended" },

    {
      id: "guardianEscalate",
      type: "agent",
      text:
        "Understood. For minors, we can't disclose account details or proceed without a confirmed legal guardian. This case will be routed to Blue Prairie's operations team for personalized handling.\n\nA case reference has been generated. Someone will reach out within 1–2 business days to discuss the situation.",
      effects: {
        audit: "Hard escalation — guardian status unconfirmed. No disclosures made. Routed to Blue Prairie ops.",
        gates: ["handoff_ready"],
        set: { "case.reference": "ME-2026-0331-OPS" }
      }
    },
    { type: "end", outcome: "Guardian unverified · hard escalation · no disclosures · ops handoff" }
  ],

  /* ---------------------------------------------------------------- DANE TRUST */
  "dane-trust": [
    {
      type: "agent",
      text:
        "Hello — you've reached Convergent on behalf of the Dane Family Trust, the named beneficiary of Gloria Dane's IRA at Redwood Fiduciary.\n\nTrust beneficiaries are handled differently from individuals. Before any classification or disclosures, I need to ask you a few qualification questions.",
      effects: {
        audit: "Session seeded from Redwood Fiduciary (provider_api). Beneficiary type: trust — qualification path active.",
        set: {
          "session.status": "in_progress",
          "session.provider": "Redwood Fiduciary",
          "beneficiary.type": "Trust",
          "beneficiary.trust_name": "Dane Family Trust",
          "ira.type": "traditional",
          "ira.balance": "$883,250"
        }
      }
    },
    {
      type: "choice",
      prompt: "Was the trust valid under state law as of Gloria's date of death?",
      options: [
        {
          label: "Yes",
          effects: {
            audit: "See-through trust check 1/4 — state law validity: confirmed.",
            set: { "trust.q1_state_law": "Confirmed" }
          }
        }
      ]
    },
    {
      type: "choice",
      prompt: "Was the trust irrevocable at Gloria's date of death — or does it become irrevocable by its terms at her death?",
      options: [
        {
          label: "Yes",
          effects: {
            audit: "See-through trust check 2/4 — irrevocability: confirmed.",
            set: { "trust.q2_irrevocability": "Confirmed" }
          }
        }
      ]
    },
    {
      type: "choice",
      prompt: "Are the trust's beneficiaries individually identifiable from the trust document itself?",
      options: [
        {
          label: "Yes",
          effects: {
            audit: "See-through trust check 3/4 — identifiable beneficiaries: confirmed.",
            set: { "trust.q3_identifiable_benes": "Confirmed" }
          }
        }
      ]
    },
    {
      type: "agent",
      text:
        "Last qualification step: the IRS requires the custodian to receive a copy of the trust agreement (or a trust certification) by **October 31 of the year following the owner's death** — that's October 31, 2026 for this account.\n\nThe sooner the better. Can you upload it now?"
    },
    {
      type: "upload",
      title: "Upload trust documentation",
      files: ["Dane_Family_Trust_Agreement.pdf", "Trustee_Certification.pdf"],
      effects: {
        audit: "See-through trust check 4/4 — trust documentation received before October 31 deadline.",
        set: {
          "trust.q4_docs_by_oct_31": "Received 2026-04-24",
          "verification.identity": "Trustee · KBA-equivalent",
          "verification.death_cert": "verified (provider-supplied)"
        },
        gates: ["identity", "death_cert"]
      }
    },
    { type: "wait", ms: 1400, message: "Running threshold qualification check…" },
    {
      type: "agent",
      text:
        "Thanks. The trust passes the four-prong threshold qualification.\n\nBut here's where I stop. The final classification — **whether** the trust gets see-through treatment, and **which** rule set applies (life expectancy, 10-year, 5-year) — depends on details I'm not the right tool for: conduit vs. accumulation structure, who the trust beneficiaries are, the oldest of them, whether any are non-individuals.\n\nThese decisions need a trust specialist, not a workflow agent.",
      effects: {
        audit: "Threshold qualification: PASS. Final classification withheld pending legal review.",
        gates: ["edb_conversation"],
        flag: ["triage"],
        set: {
          "classification.lane": "Lane 5 — Trust (escalation)",
          "classification.rule_set": "Pending legal review"
        }
      },
      awaitContinue: true,
      continueLabel: "What happens next?"
    },
    {
      type: "agent",
      text:
        "I'm packaging everything we've captured today — the four qualification answers, the trust documents you uploaded, Gloria's account context, the audit trail of this session — and routing it to Redwood Fiduciary's trust review team.\n\nA specialist will reach out within two business days. They'll handle the final classification and any election decisions in coordination with you. The October 31 deadline is preserved by today's upload.\n\nThe same link will reopen this case if you need to add anything in the meantime."
    },
    {
      type: "esign",
      title: "Trust Authorization — Information Release & Handoff",
      bullets: [
        "Authorizes Convergent to release the captured session record to Redwood Fiduciary's trust review team.",
        "Confirms trust documentation provided as of 4/24/2026 — preserves the IRS October 31 deadline.",
        "Acknowledges that final classification and election are subject to specialist review."
      ],
      envelope: "DocuSign envelope env_t77a2c9b",
      effects: {
        audit: "Trust authorization e-signed via DocuSign envelope env_t77a2c9b.",
        set: { "esign.trust_auth": "Signed (env_t77a2c9b)" }
      }
    },
    {
      type: "agent",
      text:
        "Done.\n\n• Case reference: DF-2025-0660-OPS\n• Routed to: Redwood Fiduciary trust review team\n• SLA: 2 business days for first contact\n• October 31 deadline: preserved (documents received today)\n\nA confirmation has been sent to the trustee email on file.",
      effects: {
        audit: "Handoff package generated and transmitted to Redwood Fiduciary. Outstanding item: final classification.",
        gates: ["election_resolution", "handoff_ready"],
        set: {
          "session.status": "escalated · awaiting specialist",
          "case.reference": "DF-2025-0660-OPS"
        }
      }
    },
    { type: "end", outcome: "Trust qualification captured · documents preserved · clean handoff to specialist team" }
  ]
};

/* ----------------------------------------------------------------------
   STATE
   ---------------------------------------------------------------------- */
const state = {
  scene: "intro",          // intro | picker | sim | outro
  personaId: null,
  scriptIndex: 0,
  thread: [],              // {role: 'agent'|'user'|'system', text}
  fields: {},              // session state fields, from effects.set
  audit: [],               // {time, text}
  gates: {},               // gateId -> 'pending' | 'passed' | 'flagged'
  pendingChoice: null,     // {prompt, options} when at a choice
  pendingUpload: null,
  pendingEsign: null,
  pendingContinue: null,   // {label} when agent step has awaitContinue
  freshFields: new Set(),
  outroOutcome: null,
  typing: false
};

function resetSession(personaId) {
  state.scene = "sim";
  state.personaId = personaId;
  state.scriptIndex = 0;
  state.thread = [];
  state.fields = {};
  state.audit = [];
  state.gates = {};
  GATE_DEFS.forEach((g) => (state.gates[g.id] = "pending"));
  // optional gates that don't apply for this persona stay invisible
  if (personaId !== "milo-everett") delete state.gates.guardian;
  state.pendingChoice = null;
  state.pendingUpload = null;
  state.pendingEsign = null;
  state.pendingContinue = null;
  state.freshFields = new Set();
  state.outroOutcome = null;
  state.typing = false;
}

/* ----------------------------------------------------------------------
   EFFECTS
   ---------------------------------------------------------------------- */
function applyEffects(effects) {
  if (!effects) return;

  if (effects.audit) {
    const items = Array.isArray(effects.audit) ? effects.audit : [effects.audit];
    items.forEach((text) =>
      state.audit.unshift({ text, time: nowStamp() })
    );
  }

  if (effects.gates) {
    effects.gates.forEach((id) => {
      if (state.gates.hasOwnProperty(id)) state.gates[id] = "passed";
    });
  }

  if (effects.flag) {
    effects.flag.forEach((id) => {
      if (state.gates.hasOwnProperty(id)) state.gates[id] = "flagged";
    });
  }

  if (effects.set) {
    state.freshFields = new Set();
    for (const [path, value] of Object.entries(effects.set)) {
      state.fields[path] = value;
      state.freshFields.add(path);
    }
    // clear "fresh" highlight after a short delay
    setTimeout(() => {
      state.freshFields = new Set();
      renderState();
    }, 1600);
  }
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

/* ----------------------------------------------------------------------
   SCRIPT RUNNER
   ---------------------------------------------------------------------- */
function findStepIndexById(script, id) {
  return script.findIndex((s) => s.id === id);
}

async function runStep() {
  if (state.scene !== "sim") return;
  const script = scripts[state.personaId];
  if (!script || state.scriptIndex < 0 || state.scriptIndex >= script.length) return;

  const step = script[state.scriptIndex];

  if (step.type === "agent") {
    state.typing = true;
    render();
    await wait(700);
    state.typing = false;
    state.thread.push({ role: "agent", text: step.text });
    applyEffects(step.effects);

    if (step.awaitContinue) {
      state.pendingContinue = { label: step.continueLabel || "Continue" };
      render();
    } else {
      state.scriptIndex += 1;
      render();
      await wait(500);
      runStep();
    }
    return;
  }

  if (step.type === "user") {
    state.thread.push({ role: "user", text: step.text });
    applyEffects(step.effects);
    state.scriptIndex += 1;
    render();
    await wait(400);
    runStep();
    return;
  }

  if (step.type === "choice") {
    state.pendingChoice = step;
    render();
    return;
  }

  if (step.type === "upload") {
    state.pendingUpload = step;
    render();
    return;
  }

  if (step.type === "esign") {
    state.pendingEsign = step;
    render();
    return;
  }

  if (step.type === "wait") {
    state.thread.push({ role: "system", text: step.message || "..." });
    render();
    await wait(step.ms || 1200);
    // remove the system message
    state.thread = state.thread.filter((m) => m.text !== (step.message || "..."));
    state.scriptIndex += 1;
    runStep();
    return;
  }

  if (step.type === "end") {
    state.outroOutcome = step.outcome;
    render();
    return;
  }
}

function pickContinue() {
  state.pendingContinue = null;
  state.scriptIndex += 1;
  render();
  runStep();
}

function pickChoice(optionIndex) {
  const step = state.pendingChoice;
  if (!step) return;
  const opt = step.options[optionIndex];
  state.thread.push({ role: "user", text: opt.label });
  applyEffects(opt.effects);
  state.pendingChoice = null;

  // jump or advance
  if (opt.next) {
    const script = scripts[state.personaId];
    const idx = findStepIndexById(script, opt.next);
    if (idx >= 0) state.scriptIndex = idx;
    else state.scriptIndex += 1;
  } else {
    state.scriptIndex += 1;
  }
  render();
  setTimeout(runStep, 350);
}

function confirmUpload() {
  const step = state.pendingUpload;
  if (!step) return;
  const fileLabel = step.files && step.files.length === 1 ? step.files[0] : `${step.files.length} files`;
  state.thread.push({
    role: "user",
    text: `📎 Uploaded: ${step.files.join(", ")}`
  });
  applyEffects(step.effects);
  state.pendingUpload = null;
  state.scriptIndex += 1;
  render();
  setTimeout(runStep, 400);
}

function confirmEsign() {
  const step = state.pendingEsign;
  if (!step) return;
  state.thread.push({
    role: "user",
    text: `✍ Signed — ${step.title}`
  });
  applyEffects(step.effects);
  state.pendingEsign = null;
  state.scriptIndex += 1;
  render();
  setTimeout(runStep, 400);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ----------------------------------------------------------------------
   ICON
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

/* ----------------------------------------------------------------------
   SCENE: INTRO
   ---------------------------------------------------------------------- */
function renderIntro() {
  root.innerHTML = `
    <section class="intro-scene">
      <header class="intro-header">
        ${brandLockup()}
        <div class="intro-meta">
          Inherited IRA Transition<br>
          Walkthrough · Confidential
        </div>
      </header>

      <div class="intro-hero">
        <h1>What it feels like<br>when the workflow runs.</h1>
        <p class="lede">
          The Inherited IRA Transition product is an agentic workflow that walks a beneficiary
          from "the account owner just died" through to "election captured, handoff transmitted."
          This walkthrough simulates what the beneficiary experiences — and shows what the
          orchestrator captures behind the glass at the same time.
        </p>
      </div>

      <div class="intro-grid">
        <div>
          <h3>What you'll see</h3>
          <p>
            Pick a beneficiary persona. You'll watch the orchestrator have a real conversation
            with them — verifying identity, walking through their distribution options, and
            capturing an e-signed election.
          </p>
          <p>
            On the right side of the screen, the system state grows in real time:
            gates flip from gray to green, fields populate, the audit log streams in.
            That panel is what your operations team would see — the calm, defensible record
            the system produces as a byproduct of the conversation.
          </p>
        </div>
        <div>
          <h3>The six phases</h3>
          <ol class="phase-list">
            <li><div><strong>Provider seed.</strong> Account, owner, and beneficiary context arrive from the custodian.</div></li>
            <li><div><strong>Intake & verification.</strong> Identity check, death certificate, data gaps closed.</div></li>
            <li><div><strong>Triage & classification.</strong> Beneficiary routed into one of five rule lanes.</div></li>
            <li><div><strong>Election.</strong> Lane-specific options presented; decision captured and e-signed.</div></li>
            <li><div><strong>Documents.</strong> Lane- and election-driven document checklist.</div></li>
            <li><div><strong>Handoff.</strong> Structured package transmitted to the provider as system of record.</div></li>
          </ol>
        </div>
      </div>

      <div class="intro-footer">
        <button class="btn btn-primary" data-action="go-picker">Walk through a beneficiary →</button>
      </div>
    </section>
  `;
}

/* ----------------------------------------------------------------------
   SCENE: PICKER
   ---------------------------------------------------------------------- */
function renderPicker() {
  const personaList = Object.values(personas);
  root.innerHTML = `
    <section class="picker-scene">
      <header class="picker-header">
        <div>
          <h2>Pick a beneficiary</h2>
          <p>Three real cases the workflow handles. Each shows a different lane and a different kind of complexity.</p>
        </div>
        ${brandLockup()}
      </header>

      <div class="persona-grid">
        ${personaList
          .map(
            (p) => `
              <button class="persona-card" data-action="pick" data-persona="${p.id}">
                <div style="display:flex; gap:14px; align-items:center;">
                  <div class="persona-avatar">${p.initials}</div>
                  <div>
                    <h3 class="persona-name">${p.name}${p.age ? ", " + p.age : ""}</h3>
                    <div class="persona-tagline">${p.tagline}</div>
                  </div>
                </div>
                <p class="persona-situation">${p.situation}</p>
                <span class="persona-tag">${p.tag}</span>
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

/* ----------------------------------------------------------------------
   SCENE: SIMULATION
   ---------------------------------------------------------------------- */
function renderSim() {
  const persona = personas[state.personaId];
  const script = scripts[state.personaId];
  const total = script.filter((s) => s.type !== "end").length;
  const progress = Math.min(state.scriptIndex, total);
  const percent = Math.round((progress / total) * 100);

  root.innerHTML = `
    <section class="sim-scene">
      <header class="sim-header">
        <div class="sim-header-left">
          <div class="persona-avatar">${persona.initials}</div>
          <div>
            <h2>${persona.name}</h2>
            <div class="subline">${persona.sessionRef} · ${persona.provider} · ${persona.lane}</div>
          </div>
        </div>
        <div class="sim-progress">
          <div class="sim-progress-label">Walkthrough progress</div>
          <div class="sim-progress-bar"><div class="sim-progress-bar-fill" style="width: ${percent}%"></div></div>
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
            <div class="orch-meta-title">Orchestrator state · audit log · handoff package</div>
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
  const typing = state.typing ? `<div class="typing-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>` : "";
  el.innerHTML = bubbles + typing;
  el.scrollTop = el.scrollHeight;
}

function messageBubble(m) {
  if (m.role === "system") return `<div class="chat-bubble system">${m.text}</div>`;
  return `<div class="chat-bubble ${m.role}">${formatMessage(m.text)}</div>`;
}

function formatMessage(text) {
  // bold **x** -> <strong>x</strong>; preserve newlines via white-space:pre-wrap
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderActions() {
  const el = document.getElementById("chatActions");
  if (!el) return;
  if (state.outroOutcome) {
    el.innerHTML = "";
    return;
  }
  if (state.pendingChoice) {
    const step = state.pendingChoice;
    el.innerHTML = `
      ${step.prompt ? `<div class="chat-prompt">${step.prompt}</div>` : ""}
      <div class="choice-row">
        ${step.options.map((opt, i) => `<button class="choice-btn" data-action="choice" data-i="${i}">${opt.label}</button>`).join("")}
      </div>
    `;
    return;
  }
  if (state.pendingUpload) {
    const step = state.pendingUpload;
    el.innerHTML = `
      <div class="upload-mock">
        <div class="chat-prompt">${step.title}</div>
        <div class="upload-files">
          ${step.files.map((f) => `<div class="upload-file">${f}</div>`).join("")}
        </div>
        <div class="continue-row">
          <button class="btn btn-primary" data-action="upload-confirm">Submit documents</button>
        </div>
      </div>
    `;
    return;
  }
  if (state.pendingEsign) {
    const step = state.pendingEsign;
    el.innerHTML = `
      <div class="esign-mock">
        <div class="chat-prompt">${step.title}</div>
        <div class="esign-summary">
          <ul>${step.bullets.map((b) => `<li>${b}</li>`).join("")}</ul>
        </div>
        <div class="esign-doc">${step.envelope}</div>
        <div class="continue-row">
          <button class="btn btn-primary" data-action="esign-confirm">Sign electronically</button>
        </div>
      </div>
    `;
    return;
  }
  if (state.pendingContinue) {
    el.innerHTML = `
      <div class="continue-row">
        <button class="btn btn-primary" data-action="continue">${state.pendingContinue.label}</button>
      </div>
    `;
    return;
  }
  el.innerHTML = "";
}

function renderGates() {
  const el = document.getElementById("gateList");
  if (!el) return;
  const visibleGates = GATE_DEFS.filter((g) => state.gates.hasOwnProperty(g.id));
  el.innerHTML = visibleGates
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
          <span class="state-key">${k}</span>
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
          <div class="audit-time">${e.time}</div>
          <div>${escapeHtml(e.text)}</div>
        </div>
      `
    )
    .join("");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* ----------------------------------------------------------------------
   OUTRO OVERLAY
   ---------------------------------------------------------------------- */
function renderOutroOverlay() {
  const persona = personas[state.personaId];
  const summaryRows = [
    ["Persona", persona.name],
    ["Provider", persona.provider],
    ["Lane", persona.lane],
    ["End state", state.outroOutcome],
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
          documents, e-signatures, and the full audit log — is bundled into a structured handoff
          package and transmitted to ${persona.provider}. The provider remains the record of authority;
          Convergent retains only a fallback copy.
        </p>
        <div class="outro-summary">
          ${summaryRows
            .map(
              ([k, v]) => `
                <div class="outro-summary-row">
                  <span class="outro-summary-key">${k}</span>
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
    state.personaId = null;
    state.outroOutcome = null;
    state.pendingChoice = null;
    state.pendingUpload = null;
    state.pendingEsign = null;
    state.pendingContinue = null;
    render();
    return;
  }

  if (action === "go-picker") {
    state.scene = "picker";
    state.personaId = null;
    state.outroOutcome = null;
    state.pendingChoice = null;
    state.pendingUpload = null;
    state.pendingEsign = null;
    state.pendingContinue = null;
    render();
    return;
  }

  if (action === "pick") {
    const id = target.dataset.persona;
    resetSession(id);
    render();
    setTimeout(runStep, 400);
    return;
  }

  if (action === "continue") {
    pickContinue();
    return;
  }

  if (action === "choice") {
    const i = Number(target.dataset.i);
    pickChoice(i);
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
render();
