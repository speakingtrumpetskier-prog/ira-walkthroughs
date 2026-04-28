/* ======================================================================
   v5 DETERMINISTIC — server.js
   ======================================================================
   Form-driven workflow. The conversational agent is gone; the help
   chatbot remains as the only LLM piece, invokable from any step as
   inline help. Same orchestrator as v4 (tools.js); same triage engine
   and state-withholding table.
   ====================================================================== */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const Anthropic = require("@anthropic-ai/sdk").default;
const {
  GATE_DEFS,
  CANONICAL_FIELDS,
  evaluateGates,
  computePhase,
  markProviderConfirmed,
  applyConfirmationTimeoutFallback,
  generateHandoffPackage
} = require("./tools");
const { PERSONAS, buildCustomPersona } = require("./personas");
const { getCurrentStep, handleSubmit } = require("./steps");

/* ----------------------------------------------------------------------
   ENV
   ---------------------------------------------------------------------- */
function loadDotenv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotenv();

const PORT = Number(process.env.PORT || 8793);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-opus-4-7";
const EFFORT = process.env.EFFORT || "low";
const KEY_AVAILABLE = Boolean(API_KEY && API_KEY.startsWith("sk-ant"));

const client = KEY_AVAILABLE ? new Anthropic({ apiKey: API_KEY }) : null;

/* ----------------------------------------------------------------------
   CHATBOT REFERENCE
   ---------------------------------------------------------------------- */
const CHATBOT_CONTEXT = fs.readFileSync(path.join(__dirname, "docs", "chatbot-context.md"), "utf8");

/* ----------------------------------------------------------------------
   IN-MEMORY SESSION STORES
   ---------------------------------------------------------------------- */
const sessions = new Map();
const chatbotSessions = new Map();

function newSessionId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ----------------------------------------------------------------------
   CHATBOT TURN
   ---------------------------------------------------------------------- */
async function runChatbotTurn(session, userMessage) {
  session.messages.push({ role: "user", content: userMessage });
  const systemBlocks = [
    {
      type: "text",
      text: CHATBOT_CONTEXT,
      cache_control: { type: "ephemeral" }
    }
  ];
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: EFFORT },
    system: systemBlocks,
    messages: session.messages
  });
  let text = "";
  for (const block of response.content) {
    if (block.type === "text" && block.text) {
      if (text) text += "\n\n";
      text += block.text;
    }
  }
  session.messages.push({ role: "assistant", content: response.content });
  return { text };
}

/* ----------------------------------------------------------------------
   HTTP HELPERS
   ---------------------------------------------------------------------- */
const STATIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/styles.css": { file: "styles.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "application/javascript; charset=utf-8" }
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, absPath, contentType) {
  fs.readFile(absPath, (err, buf) => {
    if (err) return sendJson(res, 404, { error: "File not found" });
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(buf);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

/* ----------------------------------------------------------------------
   SESSION-RESPONSE HELPER
   ---------------------------------------------------------------------- */
function sessionResponse(session, extra = {}) {
  const step = getCurrentStep(session);
  return {
    sessionId: session.id,
    step,
    state: {
      fields: session.state.fields,
      gates: session.state.gates,
      audit: session.state.audit,
      completed: session.state.completed,
      endState: session.state.endState,
      engine: session.state.engine,
      providerAttentionAlerts: session.state.providerAttentionAlerts || []
    },
    phase: computePhase(session),
    establishmentStatus: session.state.fields["inherited_ira_establishment_status"] || null,
    ...extra
  };
}

/* ----------------------------------------------------------------------
   API HANDLERS
   ---------------------------------------------------------------------- */
async function handleApi(req, res, pathname) {
  if (pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      keyAvailable: KEY_AVAILABLE,
      model: MODEL,
      effort: EFFORT,
      keyLength: API_KEY ? API_KEY.length : 0,
      nodeVersion: process.version,
      mode: "v5-deterministic"
    });
    return;
  }

  if (pathname === "/api/personas" && req.method === "GET") {
    const list = Object.values(PERSONAS).map((p) => ({
      id: p.id,
      name: p.name,
      initials: p.initials,
      age: p.age,
      sessionRef: p.sessionRef,
      provider: p.provider,
      laneHint: p.laneHint,
      tagline: p.tagline,
      situation: p.situation,
      tag: p.tag
    }));
    list.push({
      id: "custom",
      name: "Make your own",
      initials: "+",
      age: null,
      sessionRef: "CUSTOM",
      provider: "Demo Custodian",
      laneHint: "You build the inputs · engine routes",
      tagline: "Build a custom test scenario.",
      situation: "Specify the inputs (relationship, ages, IRA type, owner DOD) and the engine will route it.",
      tag: "Custom test"
    });
    sendJson(res, 200, { personas: list });
    return;
  }

  if (pathname === "/api/session/start" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const personaId = body.personaId;
      let persona;
      if (personaId === "custom") {
        persona = buildCustomPersona(body.customSpec || {});
      } else {
        persona = PERSONAS[personaId];
      }
      if (!persona) throw new Error(`Unknown persona: ${personaId}`);

      const sessionId = newSessionId("v5");
      const session = {
        id: sessionId,
        personaId,
        persona,
        state: persona.initialState(),
        createdAt: new Date().toISOString()
      };
      sessions.set(sessionId, session);
      // Run gate evaluation once on start in case any gates can clear from seeded data
      evaluateGates(session);
      sendJson(res, 200, sessionResponse(session, {
        persona: {
          id: persona.id,
          name: persona.name,
          initials: persona.initials,
          provider: persona.provider,
          sessionRef: persona.sessionRef,
          laneHint: persona.laneHint
        }
      }));
    } catch (e) {
      console.error("/api/session/start error:", e);
      sendJson(res, 500, { error: e.message || "Failed to start session" });
    }
    return;
  }

  if (pathname === "/api/session/submit" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const session = sessions.get(body.sessionId);
      if (!session) return sendJson(res, 404, { error: "Session not found" });
      const { events, error } = handleSubmit(session, body.formData || {});
      if (error) return sendJson(res, 400, { error, sessionId: session.id });
      sendJson(res, 200, sessionResponse(session, { events }));
    } catch (e) {
      console.error("/api/session/submit error:", e);
      sendJson(res, 500, { error: e.message || "Submit failed" });
    }
    return;
  }

  if (pathname === "/api/session/state" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const sessionId = url.searchParams.get("sessionId");
    const session = sessions.get(sessionId);
    if (!session) return sendJson(res, 404, { error: "Session not found" });
    sendJson(res, 200, sessionResponse(session));
    return;
  }

  if (pathname === "/api/session/handoff-package" && req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const sessionId = url.searchParams.get("sessionId");
    const session = sessions.get(sessionId);
    if (!session) return sendJson(res, 404, { error: "Session not found" });
    if (!session.state.handoffPackage) return sendJson(res, 404, { error: "No handoff package generated yet (session not completed)." });
    sendJson(res, 200, { handoffPackage: session.state.handoffPackage });
    return;
  }

  if (pathname === "/api/session/provider-confirm" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const session = sessions.get(body.sessionId);
      if (!session) return sendJson(res, 404, { error: "Session not found" });
      const { ok, reason, events } = markProviderConfirmed(session);
      if (!ok) return sendJson(res, 400, { error: reason });
      sendJson(res, 200, sessionResponse(session, { events }));
    } catch (e) {
      console.error("/api/session/provider-confirm error:", e);
      sendJson(res, 500, { error: e.message || "Provider confirm failed" });
    }
    return;
  }

  if (pathname === "/api/session/simulate-timeout" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const session = sessions.get(body.sessionId);
      if (!session) return sendJson(res, 404, { error: "Session not found" });
      const { ok, reason, events } = applyConfirmationTimeoutFallback(session);
      if (!ok) return sendJson(res, 400, { error: reason });
      sendJson(res, 200, sessionResponse(session, { events }));
    } catch (e) {
      console.error("/api/session/simulate-timeout error:", e);
      sendJson(res, 500, { error: e.message || "Timeout simulation failed" });
    }
    return;
  }

  /* ----- Chatbot endpoints (the only LLM in v5) ----- */
  if (pathname === "/api/chatbot/start" && req.method === "POST") {
    if (!KEY_AVAILABLE) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY not set — chatbot unavailable. Form workflow is deterministic and works without the key." });
    const sessionId = newSessionId("chatbot");
    chatbotSessions.set(sessionId, { id: sessionId, messages: [] });
    sendJson(res, 200, { sessionId });
    return;
  }

  if (pathname === "/api/chatbot/chat" && req.method === "POST") {
    if (!KEY_AVAILABLE) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY not set" });
    try {
      const body = await readJsonBody(req);
      let session = chatbotSessions.get(body.sessionId);
      if (!session) {
        const sid = newSessionId("chatbot");
        session = { id: sid, messages: [] };
        chatbotSessions.set(sid, session);
      }
      const result = await runChatbotTurn(session, body.message || "");
      sendJson(res, 200, { sessionId: session.id, ...result });
    } catch (e) {
      console.error("/api/chatbot/chat error:", e);
      sendJson(res, 500, { error: e.message || "Chatbot failed" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname);
    return;
  }

  const staticEntry = STATIC_FILES[pathname];
  if (staticEntry) {
    sendFile(res, path.join(__dirname, staticEntry.file), staticEntry.type);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`Convergent v5-deterministic on http://${HOST}:${PORT}`);
  console.log(`  Model:        ${MODEL}`);
  console.log(`  Effort:       ${EFFORT}`);
  console.log(`  API key:      ${KEY_AVAILABLE ? "set (chatbot enabled)" : "MISSING (chatbot disabled, form workflow still works)"}`);
});
