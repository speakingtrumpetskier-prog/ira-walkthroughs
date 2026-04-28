const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const Anthropic = require("@anthropic-ai/sdk").default;
const { TOOL_DEFS, GATE_DEFS, executeTool } = require("./tools");
const { PERSONAS, buildCustomPersona, getChipsForSession } = require("./personas");

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

const PORT = Number(process.env.PORT || 8792);
const HOST = process.env.HOST || "127.0.0.1";
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-opus-4-7";
const EFFORT = process.env.EFFORT || "low";
const KEY_AVAILABLE = Boolean(API_KEY && API_KEY.startsWith("sk-ant"));

const client = KEY_AVAILABLE ? new Anthropic({ apiKey: API_KEY }) : null;

/* ----------------------------------------------------------------------
   REFERENCE DOCS — cached prefix for the agent
   ---------------------------------------------------------------------- */
const AGENT_CONTEXT = fs.readFileSync(path.join(__dirname, "docs", "agent-context.md"), "utf8");
const CHATBOT_CONTEXT = fs.readFileSync(path.join(__dirname, "docs", "chatbot-context.md"), "utf8");

/* ----------------------------------------------------------------------
   IN-MEMORY SESSION STORES (one per surface)
   ---------------------------------------------------------------------- */
const agentSessions = new Map();
const chatbotSessions = new Map();

function newSessionId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ----------------------------------------------------------------------
   AGENT TURN
   ---------------------------------------------------------------------- */
async function runAgentTurn(session, userMessage) {
  const persona = session.persona;

  // Append user message
  session.messages.push({ role: "user", content: userMessage });

  const events = [];
  let assistantText = "";

  // Build cached system prompt (large stable prefix, then per-persona)
  const systemBlocks = [
    {
      type: "text",
      text: AGENT_CONTEXT
    },
    {
      type: "text",
      text: persona.personaPrompt,
      cache_control: { type: "ephemeral" }
    }
  ];

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: EFFORT },
      system: systemBlocks,
      tools: TOOL_DEFS,
      messages: session.messages
    });

    session.messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        if (assistantText) assistantText += "\n\n";
        assistantText += block.text;
      }
    }

    if (response.stop_reason === "end_turn") break;
    if (response.stop_reason === "pause_turn") continue;

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      const toolResults = [];
      let halted = false;

      for (const toolUse of toolUses) {
        const exec = executeTool(session, toolUse.name, toolUse.input || {});
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: exec.result
        });
        events.push(...exec.events);
        if (exec.halt) halted = true;
      }

      session.messages.push({ role: "user", content: toolResults });

      if (halted) break;
      continue;
    }

    break;
  }

  return {
    text: assistantText,
    events,
    state: session.state,
    pendingUI: session.pendingUI,
    chips: getChipsForSession(session, persona),
    completed: session.state.completed,
    endState: session.state.endState
  };
}

/* ----------------------------------------------------------------------
   CHATBOT TURN — separate Claude session, no tools, no state
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
   HTTP
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

async function handleApi(req, res, pathname) {
  if (pathname === "/api/health") {
    sendJson(res, 200, {
      ok: true,
      keyAvailable: KEY_AVAILABLE,
      model: MODEL,
      effort: EFFORT,
      keyLength: API_KEY ? API_KEY.length : 0,
      nodeVersion: process.version
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
    // Add a "custom" placeholder
    list.push({
      id: "custom",
      name: "Make your own",
      initials: "+",
      age: null,
      sessionRef: "CUSTOM",
      provider: "Demo Custodian",
      laneHint: "You build the inputs · engine routes",
      tagline: "Build a custom test scenario.",
      situation: "Specify the inputs (relationship, ages, IRA type, owner DOD) and the engine will route it. Use this to stress-test the agent's behavior on edge cases.",
      tag: "Custom test"
    });
    sendJson(res, 200, { personas: list });
    return;
  }

  if (pathname === "/api/agent/start" && req.method === "POST") {
    if (!KEY_AVAILABLE) {
      sendJson(res, 500, { error: "ANTHROPIC_API_KEY not set" });
      return;
    }
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

      const sessionId = newSessionId("agent");
      const session = {
        id: sessionId,
        personaId,
        persona,
        messages: [],
        state: persona.initialState(),
        pendingUI: null,
        createdAt: new Date().toISOString()
      };
      agentSessions.set(sessionId, session);

      const result = await runAgentTurn(session, "[BEGIN SESSION]");
      sendJson(res, 200, {
        sessionId,
        personaId: session.personaId,
        persona: {
          id: persona.id,
          name: persona.name,
          initials: persona.initials,
          provider: persona.provider,
          sessionRef: persona.sessionRef,
          laneHint: persona.laneHint
        },
        ...result
      });
    } catch (e) {
      console.error("/api/agent/start error:", e);
      console.error("  cause:", e.cause);
      console.error("  status:", e.status);
      sendJson(res, 500, {
        error: e.message || "Failed to start session",
        name: e.name,
        cause: e.cause ? String(e.cause) : null
      });
    }
    return;
  }

  if (pathname === "/api/agent/chat" && req.method === "POST") {
    if (!KEY_AVAILABLE) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY not set" });
    try {
      const body = await readJsonBody(req);
      const session = agentSessions.get(body.sessionId);
      if (!session) return sendJson(res, 404, { error: "Session not found" });
      session.pendingUI = null;
      const result = await runAgentTurn(session, body.message || "");
      sendJson(res, 200, { sessionId: session.id, ...result });
    } catch (e) {
      console.error("/api/agent/chat error:", e);
      sendJson(res, 500, { error: e.message || "Chat failed" });
    }
    return;
  }

  if (pathname === "/api/chatbot/start" && req.method === "POST") {
    if (!KEY_AVAILABLE) return sendJson(res, 500, { error: "ANTHROPIC_API_KEY not set" });
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
  console.log(`Convergent v4-engine on http://${HOST}:${PORT}`);
  console.log(`  Model:        ${MODEL}`);
  console.log(`  Effort:       ${EFFORT}`);
  console.log(`  API key:      ${KEY_AVAILABLE ? "set" : "MISSING"}`);
});
