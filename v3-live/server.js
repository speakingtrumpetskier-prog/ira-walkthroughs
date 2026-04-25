const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const Anthropic = require("@anthropic-ai/sdk").default;
const { TOOL_DEFS, executeTool } = require("./tools");
const { PERSONAS, getChipsForSession } = require("./personas");

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

const PORT = Number(process.env.PORT || 8790);
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-opus-4-7";
const EFFORT = process.env.EFFORT || "low";

const KEY_AVAILABLE = Boolean(API_KEY && API_KEY.startsWith("sk-ant"));

const client = KEY_AVAILABLE ? new Anthropic({ apiKey: API_KEY }) : null;

/* ----------------------------------------------------------------------
   IN-MEMORY SESSION STORE
   ---------------------------------------------------------------------- */
const sessions = new Map();

function createSession(personaId) {
  const persona = PERSONAS[personaId];
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);
  const sessionId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    id: sessionId,
    personaId,
    messages: [],
    state: persona.initialState(),
    pendingUI: null,
    createdAt: new Date().toISOString()
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  return sessions.get(sessionId);
}

/* ----------------------------------------------------------------------
   AGENT LOOP
   ---------------------------------------------------------------------- */
async function runAgentTurn(session, userMessage) {
  const persona = PERSONAS[session.personaId];

  // Append the user's message to history
  session.messages.push({ role: "user", content: userMessage });

  const events = [];
  let assistantText = "";
  let halted = false;

  // Tool execution loop, capped to prevent runaways
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      output_config: { effort: EFFORT },
      system: persona.systemPrompt,
      tools: TOOL_DEFS,
      messages: session.messages
    });

    // Append the full assistant turn (text + any tool_use blocks) to history
    session.messages.push({ role: "assistant", content: response.content });

    // Accumulate text for the client
    for (const block of response.content) {
      if (block.type === "text" && block.text) {
        if (assistantText) assistantText += "\n\n";
        assistantText += block.text;
      }
    }

    // If end_turn, we're done
    if (response.stop_reason === "end_turn") break;

    // If pause_turn, re-send and let the server resume
    if (response.stop_reason === "pause_turn") continue;

    // If tool_use, execute the tools
    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter((b) => b.type === "tool_use");
      const toolResults = [];

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

      // If a UI tool fired (esign / upload), pause the agent loop
      if (halted) break;

      continue;
    }

    // Other stop reasons — bail
    break;
  }

  return {
    text: assistantText,
    events,
    state: session.state,
    pendingUI: session.pendingUI,
    chips: getChipsForSession(session),
    completed: session.state.completed,
    endState: session.state.endState
  };
}

/* ----------------------------------------------------------------------
   HTTP HANDLERS
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
    if (err) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
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
      effort: EFFORT
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
      lane: p.lane,
      tagline: p.tagline,
      situation: p.situation,
      tag: p.tag
    }));
    sendJson(res, 200, { personas: list });
    return;
  }

  if (pathname === "/api/start" && req.method === "POST") {
    if (!KEY_AVAILABLE) {
      sendJson(res, 500, {
        error:
          "Live mode requires ANTHROPIC_API_KEY in .env. Restart the server with the key set."
      });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const personaId = body.personaId;
      const session = createSession(personaId);
      // Trigger initial agent greeting
      const result = await runAgentTurn(session, "[BEGIN SESSION]");
      sendJson(res, 200, {
        sessionId: session.id,
        personaId: session.personaId,
        ...result
      });
    } catch (e) {
      console.error("/api/start error:", e);
      sendJson(res, 500, { error: e.message || "Failed to start session" });
    }
    return;
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    if (!KEY_AVAILABLE) {
      sendJson(res, 500, { error: "ANTHROPIC_API_KEY not set" });
      return;
    }
    try {
      const body = await readJsonBody(req);
      const session = getSession(body.sessionId);
      if (!session) {
        sendJson(res, 404, { error: "Session not found" });
        return;
      }
      // Clear any pending UI when a new user message comes in
      session.pendingUI = null;
      const result = await runAgentTurn(session, body.message || "");
      sendJson(res, 200, {
        sessionId: session.id,
        ...result
      });
    } catch (e) {
      console.error("/api/chat error:", e);
      sendJson(res, 500, { error: e.message || "Chat failed" });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `127.0.0.1:${PORT}`}`);
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

// Bind to 0.0.0.0 in production (Render sets HOST=0.0.0.0 in render.yaml);
// stay on 127.0.0.1 locally so we don't accidentally expose dev servers on LAN.
const HOST = process.env.HOST || "127.0.0.1";

server.listen(PORT, HOST, () => {
  console.log(`Convergent walkthrough (v3 — live Claude) on http://${HOST}:${PORT}`);
  console.log(`  Model:        ${MODEL}`);
  console.log(`  Effort:       ${EFFORT}`);
  console.log(`  API key:      ${KEY_AVAILABLE ? "set" : "MISSING — set ANTHROPIC_API_KEY"}`);
});
