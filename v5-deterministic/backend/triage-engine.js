/* ======================================================================
   DEMO TRIAGE ENGINE — v1.5 schema
   ======================================================================
   This is a stub of Convergent's actual triage engine, encoded directly
   from the IRA Session State Schema v1.5. It implements the
   Beneficiary Classification Landscape, the cohort-aware RBD math,
   the spouse election deadline formula, and the age-gap qualification.
   When Convergent's real engine arrives, this file gets replaced;
   the contract (input package → output package) stays the same.
   ====================================================================== */

const PRE_2020 = new Date("2020-01-01");

/* ----------------------------------------------------------------------
   COHORT-AWARE RBD MATH (Schema Section 2B)
   ---------------------------------------------------------------------- */
function rmdAgeFromDob(dobStr) {
  const dob = new Date(dobStr);
  const cutoff_70_5 = new Date("1949-06-30");
  const cutoff_72_start = new Date("1949-07-01");
  const cutoff_72_end = new Date("1950-12-31");
  const cutoff_73_start = new Date("1951-01-01");
  const cutoff_73_end = new Date("1959-12-31");
  const cutoff_75_start = new Date("1960-01-01");

  if (dob <= cutoff_70_5) return 70.5;
  if (dob >= cutoff_72_start && dob <= cutoff_72_end) return 72;
  if (dob >= cutoff_73_start && dob <= cutoff_73_end) return 73;
  if (dob >= cutoff_75_start) return 75;
  return null;
}

function computeRmdAttainmentYear(dobStr) {
  const dob = new Date(dobStr);
  const dobYear = dob.getFullYear();
  const age = rmdAgeFromDob(dobStr);

  if (age === 70.5) {
    // Day-precise: if owner_dob month/day is on or before June 30 → age 70 year.
    // Otherwise → age 70 year + 1.
    const month = dob.getMonth() + 1;
    const day = dob.getDate();
    const age70Year = dobYear + 70;
    if (month < 7 || (month === 7 && day === 1 && false)) {
      // month <= 6, OR month is 7 and day is 1? No — schema says "on or before June 30".
      // June 30 is month=6, day=30. So <=6 means months 1-6.
      return age70Year;
    } else {
      return age70Year + 1;
    }
  }

  // Year-precise for 72, 73, 75
  return dobYear + age;
}

function computeRbdDate(dobStr) {
  const attainmentYear = computeRmdAttainmentYear(dobStr);
  // April 1 of the year following owner_rmd_attainment_year
  return new Date(`${attainmentYear + 1}-04-01`);
}

function computeRbdStatus(dobStr, dodStr) {
  const dod = new Date(dodStr);
  const rbd = computeRbdDate(dobStr);
  // Schema: ≥ → post_rbd; < → pre_rbd. Equality is post_rbd.
  return dod >= rbd ? "post_rbd" : "pre_rbd";
}

/* ----------------------------------------------------------------------
   AGE-GAP QUALIFICATION (Schema Section 4C)
   age_gap_qualifies = (beneficiary_dob - 10 years) ≤ owner_dob
   ---------------------------------------------------------------------- */
function ageGapQualifies(ownerDobStr, beneficiaryDobStr) {
  const beneDob = new Date(beneficiaryDobStr);
  const minus10 = new Date(beneDob);
  minus10.setFullYear(minus10.getFullYear() - 10);
  return minus10 <= new Date(ownerDobStr);
}

/* ----------------------------------------------------------------------
   CLASSIFICATION LANDSCAPE (Schema lines 96-126)
   Returns: { ab_election_available, election_options, asserted_rule,
              election_eligible, election_track }
   ---------------------------------------------------------------------- */
function lookupRule(iraType, beneClass, rbdStatus) {
  // For Roth, treat rbdStatus as "n_a" — Roth has no RMDs during owner's life
  const rbd = iraType === "roth" ? "n_a" : rbdStatus;

  // Spouse — applies to traditional pre-RBD, post-RBD; Roth always
  if (beneClass === "spouse") {
    if (iraType === "roth" || rbd === "pre_rbd") {
      return {
        ab_election_available: true,
        election_options: ["life_expectancy", "10_year"],
        asserted_rule: null,
        election_eligible: "eligible",
        election_track: "track_1"
      };
    }
    // Traditional, Post-RBD
    return {
      ab_election_available: false,
      election_options: [],
      asserted_rule: "life_expectancy",
      election_eligible: "not_eligible",
      election_track: "track_2"
    };
  }

  // Non-spouse EDB subclasses (age_gap, disabled, chronic_illness, minor_child)
  // All four behave identically per the table
  const edbSubclasses = ["edb_age_gap", "edb_disabled", "edb_chronic_illness", "edb_minor_child"];
  if (edbSubclasses.includes(beneClass)) {
    if (iraType === "roth" || rbd === "pre_rbd") {
      return {
        ab_election_available: true,
        election_options: ["life_expectancy", "10_year"],
        asserted_rule: null,
        election_eligible: "eligible",
        election_track: "track_1"
      };
    }
    // Traditional, Post-RBD
    return {
      ab_election_available: false,
      election_options: [],
      asserted_rule: "life_expectancy",
      election_eligible: "not_eligible",
      election_track: "track_2"
    };
  }

  // Non-EDB Person
  if (beneClass === "non_edb_person") {
    if (iraType === "roth" || rbd === "pre_rbd") {
      return {
        ab_election_available: false,
        election_options: [],
        asserted_rule: "10_year",
        election_eligible: "not_eligible",
        election_track: "track_2"
      };
    }
    // Traditional, Post-RBD: 10-year with annual RMDs
    return {
      ab_election_available: false,
      election_options: [],
      asserted_rule: "10_year_with_annual_rmd",
      election_eligible: "not_eligible",
      election_track: "track_2"
    };
  }

  // Non-EDB Non-Person (estates, charities, etc.) — Gen 1 escalates
  if (beneClass === "non_edb_nonperson") {
    if (iraType === "roth" || rbd === "pre_rbd") {
      return {
        ab_election_available: false,
        election_options: [],
        asserted_rule: "5_year",
        election_eligible: "not_eligible",
        election_track: "track_2"
      };
    }
    return {
      ab_election_available: false,
      election_options: [],
      asserted_rule: "ghost_life_expectancy",
      election_eligible: "not_eligible",
      election_track: "track_2"
    };
  }

  // Qualified See-Through Trust (Track 3)
  if (beneClass === "qualified_see_through_trust") {
    if (iraType === "roth" || rbd === "pre_rbd") {
      return {
        ab_election_available: "undetermined",
        election_options: [],
        asserted_rule: "determined_by_trust_beneficiaries",
        election_eligible: "determined_by_trust_beneficiaries",
        election_track: "track_3"
      };
    }
    // Traditional, Post-RBD: asserted LE
    return {
      ab_election_available: false,
      election_options: [],
      asserted_rule: "life_expectancy",
      election_eligible: "not_eligible",
      election_track: "track_3"
    };
  }

  return {
    error: "unknown_classification",
    message: `Unknown beneficiary_classification: ${beneClass}`
  };
}

/* ----------------------------------------------------------------------
   ELECTION DEADLINE COMPUTATIONS (Schema 4D / 6A)
   Spouse: MIN(MAX(Dec 31 of year following dod, Dec 31 of owner_rmd_attainment_year),
                Dec 31 of 10th year following dod)
   Non-spouse EDB Track 1: Dec 31 of year following dod
   ---------------------------------------------------------------------- */
function computeElectionDeadline(input, rule) {
  if (rule.election_eligible !== "eligible") return null;

  const dod = new Date(input.owner_dod);
  const yearFollowingDod = dod.getFullYear() + 1;

  if (input.beneficiary_classification === "spouse") {
    const ownerAttainmentYear = computeRmdAttainmentYear(input.owner_dob);
    const yearOfTenth = dod.getFullYear() + 10;
    // MIN(MAX(yearFollowing, ownerAttainment), tenthYear)
    const inner = Math.max(yearFollowingDod, ownerAttainmentYear);
    const outer = Math.min(inner, yearOfTenth);
    return `${outer}-12-31`;
  }

  // Non-spouse EDB
  return `${yearFollowingDod}-12-31`;
}

/* ----------------------------------------------------------------------
   DISTRIBUTION WINDOW END (helper for downstream display)
   ---------------------------------------------------------------------- */
function computeDistributionWindowEnd(input, rule) {
  const dod = new Date(input.owner_dod);
  const tenYearEnd = `${dod.getFullYear() + 10}-12-31`;
  const fiveYearEnd = `${dod.getFullYear() + 5}-12-31`;

  if (rule.asserted_rule === "10_year" || rule.asserted_rule === "10_year_with_annual_rmd") {
    return tenYearEnd;
  }
  if (rule.asserted_rule === "5_year") {
    return fiveYearEnd;
  }
  // Life expectancy paths don't have a fixed window end
  return null;
}

/* ----------------------------------------------------------------------
   MAIN ENTRY POINT
   Input package (Schema 4C):
     ira_type · owner_dob · owner_dod · beneficiary_dob · beneficiary_classification
   ---------------------------------------------------------------------- */
function triageEngine(input) {
  // Validate input
  const required = ["ira_type", "owner_dob", "owner_dod", "beneficiary_dob", "beneficiary_classification"];
  for (const f of required) {
    if (!input[f]) {
      return { ok: false, error: "missing_input", missing_field: f };
    }
  }

  // Pre-2020 deaths exit
  if (new Date(input.owner_dod) < PRE_2020) {
    return {
      ok: false,
      error: "pre_2020_death",
      message: "Pre-SECURE Act rules apply; out of Gen 1 scope. Route to provider operations."
    };
  }

  // RBD computation
  const owner_rmd_attainment_year = computeRmdAttainmentYear(input.owner_dob);
  const owner_rbd_date = computeRbdDate(input.owner_dob).toISOString().slice(0, 10);
  const owner_rbd_status = input.ira_type === "roth"
    ? "n_a"
    : computeRbdStatus(input.owner_dob, input.owner_dod);

  // Age-gap qualification (informational; consumed upstream by classification logic)
  const age_gap_qualifies = ageGapQualifies(input.owner_dob, input.beneficiary_dob);

  // Classification landscape lookup
  const rule = lookupRule(input.ira_type, input.beneficiary_classification, owner_rbd_status);
  if (rule.error) {
    return { ok: false, ...rule };
  }

  // Deadlines
  const election_deadline = computeElectionDeadline(input, rule);
  const distribution_window_end = computeDistributionWindowEnd(input, rule);

  // Annual RMD required during 10-year window (post-RBD non-EDB)
  const annual_rmd_required =
    rule.asserted_rule === "10_year_with_annual_rmd" ||
    rule.asserted_rule === "ghost_life_expectancy" ||
    rule.asserted_rule === "life_expectancy";

  return {
    ok: true,
    input_package: input,
    output_package: {
      // Engine-authority Section 4D fields
      applicable_rule_set: rule.asserted_rule || "elective",
      election_eligible: rule.election_eligible,
      election_options: rule.election_options,
      election_track: rule.election_track,
      election_deadline,
      annual_rmd_required,
      distribution_window_end,
      asserted_rule: rule.asserted_rule,
      ab_election_available: rule.ab_election_available,
      // Computed RBD fields
      owner_rmd_attainment_year,
      owner_rbd_date,
      owner_rbd_status,
      // Computed qualifier fields
      age_gap_qualifies
    }
  };
}

module.exports = { triageEngine, computeRmdAttainmentYear, computeRbdDate, computeRbdStatus, ageGapQualifies };
