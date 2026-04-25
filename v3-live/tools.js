/* Tool definitions for the orchestrator. Claude calls these; server executes
   them by mutating the session state and emitting events the client renders. */

const GATE_IDS = [
  "identity",
  "death_cert",
  "guardian",
  "edb_conversation",
  "triage",
  "election_resolution",
  "handoff_ready"
];

const TOOL_DEFS = [
  {
    name: "update_field",
    description:
      "Update a session-state field shown in the orchestrator panel. Path uses dot notation (e.g. 'verification.identity', 'classification.lane', 'election.method'). Value is a short human-readable string. Use this whenever you've established a new fact about the session that should appear on the record.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Dot-notation key, e.g. 'verification.identity' or 'election.method'" },
        value: { type: "string", description: "Human-readable value to display" }
      },
      required: ["path", "value"]
    }
  },
  {
    name: "pass_gate",
    description:
      "Mark a workflow gate as passed (turns the dot green in the orchestrator panel). Call this as soon as the corresponding requirement has been met in the conversation. Available gates: identity, death_cert, guardian (only for minor-child sessions), edb_conversation, triage, election_resolution, handoff_ready.",
    input_schema: {
      type: "object",
      properties: {
        gate_id: {
          type: "string",
          enum: GATE_IDS,
          description: "Which gate just passed"
        }
      },
      required: ["gate_id"]
    }
  },
  {
    name: "flag_gate",
    description:
      "Mark a gate as flagged (warning state) when something blocks normal progress and the case needs human attention.",
    input_schema: {
      type: "object",
      properties: {
        gate_id: { type: "string", enum: GATE_IDS },
        reason: { type: "string", description: "Brief explanation of why this is flagged" }
      },
      required: ["gate_id", "reason"]
    }
  },
  {
    name: "audit",
    description:
      "Append an entry to the audit log. The audit log is the system of record. Each entry should be a brief, professional, past-tense sentence describing what just happened — e.g. 'Identity verified via KBA (3 of 3 challenges passed).' or 'Election: Inherited IRA. 59½ conversion reminder scheduled for 2030-07-26.' Call this for every consequential event.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The audit entry text" }
      },
      required: ["text"]
    }
  },
  {
    name: "request_document_upload",
    description:
      "Show the beneficiary an in-chat document upload prompt. Use when documents are needed (death certificate, birth certificate, trust agreement, letters of guardianship, etc.). Pass realistic-looking pre-filled file names. The session pauses until the user submits.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Header text (e.g. 'Upload guardian documentation')" },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Pre-filled file names like ['Birth_Certificate.pdf', 'Government_ID.pdf']"
        }
      },
      required: ["title", "files"]
    }
  },
  {
    name: "request_esign",
    description:
      "Show the beneficiary an in-chat e-signature prompt. Use for elections, acknowledgments, and other signed records. The session pauses until the user signs. Generate a realistic-looking DocuSign envelope ID like 'env_a91f23b8'.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Document title (e.g. 'Beneficiary Election — Inherited IRA')" },
        bullets: {
          type: "array",
          items: { type: "string" },
          description: "Summary bullet points the beneficiary should review before signing"
        },
        envelope: { type: "string", description: "DocuSign envelope ID, e.g. 'env_a91f23b8'" }
      },
      required: ["title", "bullets", "envelope"]
    }
  },
  {
    name: "complete_session",
    description:
      "Finalize the session. Call this only AFTER the wrap-up message has been delivered to the beneficiary, all required gates are addressed, and the handoff is ready. Marks session_status complete and shows the outro card.",
    input_schema: {
      type: "object",
      properties: {
        end_state: {
          type: "string",
          description: "One-line summary of the session outcome (e.g. 'Inherited IRA established · election captured · handoff transmitted')"
        }
      },
      required: ["end_state"]
    }
  }
];

/* Apply one tool call to a session. Returns:
   {
     result: string passed back to Claude as tool_result content,
     events: [list of UI events to send to the client],
     halt: true if the agent loop should pause for user UI interaction (upload/esign)
   }
*/
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
        return { result: `Gate '${gate_id}' not visible in this session.`, events, halt: false };
      }
      session.state.gates[gate_id] = "passed";
      events.push({ type: "gate_pass", gate_id });
      return { result: `Gate '${gate_id}' passed.`, events, halt: false };
    }

    case "flag_gate": {
      const { gate_id, reason } = input;
      if (!session.state.gates.hasOwnProperty(gate_id)) {
        return { result: `Gate '${gate_id}' not visible in this session.`, events, halt: false };
      }
      session.state.gates[gate_id] = "flagged";
      events.push({ type: "gate_flag", gate_id, reason });
      return { result: `Gate '${gate_id}' flagged: ${reason}`, events, halt: false };
    }

    case "audit": {
      const { text } = input;
      const entry = { time: nowStamp(), text };
      session.state.audit.unshift(entry);
      events.push({ type: "audit_add", text, time: entry.time });
      return { result: "Logged.", events, halt: false };
    }

    case "request_document_upload": {
      const { title, files } = input;
      session.pendingUI = { type: "upload", title, files };
      events.push({ type: "request_upload", title, files });
      return {
        result:
          "The document upload prompt is now displayed to the beneficiary. STOP RESPONDING. Wait for them to submit before saying anything else this turn.",
        events,
        halt: true
      };
    }

    case "request_esign": {
      const { title, bullets, envelope } = input;
      session.pendingUI = { type: "esign", title, bullets, envelope };
      events.push({ type: "request_esign", title, bullets, envelope });
      return {
        result:
          "The e-signature prompt is now displayed to the beneficiary. STOP RESPONDING. Wait for them to sign before saying anything else this turn.",
        events,
        halt: true
      };
    }

    case "complete_session": {
      const { end_state } = input;
      session.state.completed = true;
      session.state.endState = end_state;
      events.push({ type: "session_complete", end_state });
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

module.exports = { TOOL_DEFS, executeTool, GATE_IDS };
