/* ======================================================================
   STATE WITHHOLDING TABLE — Schema Section 9E
   ======================================================================
   In production this is provider config (state_withholding_table); the
   provider maintains the canonical rules for each US state and updates
   when state revenue rules change. For the prototype we encode a small,
   plausible subset of states with their inherited-IRA-withholding
   characteristics. The orchestrator computes applicability, mandatory
   status, and default rate from this table; the agent does not opine.

   Disclaimer: this table is illustrative product copy for prototype
   demonstration, NOT legal or tax advice. Real Convergent integration
   uses the provider's authoritative table.
   ====================================================================== */

const STATE_WITHHOLDING_TABLE = {
  // Mandatory withholding when federal withholding applies
  // (Withholding tied to federal election; opt-out generally not allowed.)
  CA: { applicable: true, mandatory_when_federal: true, default_rate: 0.10, label: "California", note: "10% of federal withholding amount when federal applies." },
  GA: { applicable: true, mandatory_when_federal: true, default_rate: 0.0575, label: "Georgia", note: "Default rate tied to federal election." },
  IA: { applicable: true, mandatory_when_federal: true, default_rate: 0.05, label: "Iowa", note: "Mandatory when federal withholding applies." },
  KS: { applicable: true, mandatory_when_federal: true, default_rate: 0.05, label: "Kansas", note: "Mandatory when federal withholding applies." },
  ME: { applicable: true, mandatory_when_federal: true, default_rate: 0.05, label: "Maine", note: "Mandatory when federal withholding applies." },
  MA: { applicable: true, mandatory_when_federal: true, default_rate: 0.05, label: "Massachusetts", note: "Mandatory when federal withholding applies." },
  NC: { applicable: true, mandatory_when_federal: true, default_rate: 0.04, label: "North Carolina", note: "Mandatory when federal withholding applies." },
  OK: { applicable: true, mandatory_when_federal: true, default_rate: 0.05, label: "Oklahoma", note: "Mandatory when federal withholding applies." },
  OR: { applicable: true, mandatory_when_federal: true, default_rate: 0.08, label: "Oregon", note: "Mandatory when federal withholding applies." },
  VT: { applicable: true, mandatory_when_federal: true, default_rate: 0.024, label: "Vermont", note: "Mandatory when federal withholding applies." },
  VA: { applicable: true, mandatory_when_federal: true, default_rate: 0.04, label: "Virginia", note: "Mandatory when federal withholding applies." },
  // Voluntary state withholding (election-driven, not mandatory)
  AZ: { applicable: true, mandatory_when_federal: false, default_rate: 0.024, label: "Arizona", note: "Voluntary; elect or waive." },
  CO: { applicable: true, mandatory_when_federal: false, default_rate: 0.044, label: "Colorado", note: "Voluntary; elect or waive." },
  CT: { applicable: true, mandatory_when_federal: false, default_rate: 0.0699, label: "Connecticut", note: "Voluntary; elect or waive." },
  IL: { applicable: true, mandatory_when_federal: false, default_rate: 0.0495, label: "Illinois", note: "Voluntary; elect or waive." },
  IN: { applicable: true, mandatory_when_federal: false, default_rate: 0.0315, label: "Indiana", note: "Voluntary; elect or waive." },
  MD: { applicable: true, mandatory_when_federal: false, default_rate: 0.0775, label: "Maryland", note: "Voluntary; elect or waive." },
  MI: { applicable: true, mandatory_when_federal: false, default_rate: 0.0425, label: "Michigan", note: "Voluntary; elect or waive." },
  MN: { applicable: true, mandatory_when_federal: false, default_rate: 0.0685, label: "Minnesota", note: "Voluntary; elect or waive." },
  MO: { applicable: true, mandatory_when_federal: false, default_rate: 0.0495, label: "Missouri", note: "Voluntary; elect or waive." },
  NJ: { applicable: true, mandatory_when_federal: false, default_rate: 0.0637, label: "New Jersey", note: "Voluntary; elect or waive." },
  NY: { applicable: true, mandatory_when_federal: false, default_rate: 0.0685, label: "New York", note: "Voluntary; elect or waive." },
  OH: { applicable: true, mandatory_when_federal: false, default_rate: 0.0399, label: "Ohio", note: "Voluntary; elect or waive." },
  PA: { applicable: true, mandatory_when_federal: false, default_rate: 0.0307, label: "Pennsylvania", note: "Voluntary; elect or waive." },
  WI: { applicable: true, mandatory_when_federal: false, default_rate: 0.0525, label: "Wisconsin", note: "Voluntary; elect or waive." },
  // No state income tax — withholding not applicable
  AK: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Alaska", note: "No state income tax." },
  FL: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Florida", note: "No state income tax." },
  NV: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Nevada", note: "No state income tax." },
  NH: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "New Hampshire", note: "No state income tax on wages or retirement." },
  SD: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "South Dakota", note: "No state income tax." },
  TN: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Tennessee", note: "No state income tax." },
  TX: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Texas", note: "No state income tax." },
  WA: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Washington", note: "No state income tax on retirement." },
  WY: { applicable: false, mandatory_when_federal: false, default_rate: 0, label: "Wyoming", note: "No state income tax." }
};

const TABLE_VERSION = "prototype-2026.04";

/* ----------------------------------------------------------------------
   computeStateWithholding(state, federal_election)
   Returns: {
     applicable: boolean,        // does state have IRA withholding rules?
     mandatory: boolean,         // is withholding mandatory in this case?
     default_rate: number,       // decimal (e.g., 0.10 for 10%)
     default_rate_pct: string,   // "10.0%" for display
     state_label: string,        // "California"
     state_note: string,         // human-readable explanation
     known_state: boolean        // is this state in our table?
   }
   ---------------------------------------------------------------------- */
function computeStateWithholding(state, federal_election) {
  if (!state) {
    return {
      applicable: false,
      mandatory: false,
      default_rate: 0,
      default_rate_pct: "—",
      state_label: "(no state on file)",
      state_note: "Beneficiary state has not been collected. State withholding cannot be determined.",
      known_state: false
    };
  }
  const code = String(state).trim().toUpperCase();
  const entry = STATE_WITHHOLDING_TABLE[code];
  if (!entry) {
    return {
      applicable: false,
      mandatory: false,
      default_rate: 0,
      default_rate_pct: "—",
      state_label: code,
      state_note: `State ${code} is not in the prototype's withholding table. In production this would be looked up from the provider's authoritative table.`,
      known_state: false
    };
  }
  const fedApplies = federal_election && federal_election !== "waived";
  const mandatory = entry.applicable && entry.mandatory_when_federal && fedApplies;
  return {
    applicable: entry.applicable,
    mandatory,
    default_rate: entry.default_rate,
    default_rate_pct: `${(entry.default_rate * 100).toFixed(entry.default_rate * 100 % 1 === 0 ? 1 : 2)}%`,
    state_label: entry.label,
    state_note: entry.note,
    known_state: true
  };
}

module.exports = { STATE_WITHHOLDING_TABLE, TABLE_VERSION, computeStateWithholding };
