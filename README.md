# Convergent — Inherited IRA Walkthroughs

Two interactive demos of Convergent's beneficiary workflow, sharing a single repo.

| | What it is | How it runs | Public link suitable for sharing? |
|---|---|---|---|
| **v2-scripted** | Beneficiary-POV walkthrough with locked, scripted dialogue. No backend. | Static files. | **Yes** — deploys to GitHub Pages, no auth, no cost. |
| **v3-live** | Same shape, but with a live Claude agent driving the chat. Suggested-reply chips for the happy path; free-form input for stress tests. | Node server proxying the Anthropic API. | **Yes** — deploys to Render free tier. URL is open (no auth). |

Once the repo is set up, you'll have two URLs you can hand to anyone:

- **v2:** `https://YOUR-USERNAME.github.io/ira-walkthroughs/`
- **v3:** `https://convergent-v3.onrender.com/`

The recipient does NOT need an Anthropic account, Node, or any local setup. They just open the link.

---

## One-time setup

### Step 1 — Set a hard spend cap on your API key (do this first)

Before you put a key on a public host, set a monthly spend cap on it:

1. Go to **console.anthropic.com → Settings → Limits**.
2. Set a **monthly budget cap** that bounds any worst-case usage (e.g. $20/mo). Each demo run is pennies, so even a small cap covers normal sharing comfortably.

This is the safety net. The v3 URL is unauthenticated, so the spend cap is what protects you if it gets shared more widely than you intended.

### Step 2 — Push the repo to GitHub

From this directory:

```bash
gh repo create ira-walkthroughs --public --source=. --remote=origin
git add .
git commit -m "Initial commit: v2 scripted + v3 live Claude walkthrough"
git push -u origin main
```

(Or: create an empty repo via the GitHub web UI, then `git remote add origin <url>` and `git push -u origin main`.)

### Step 3 — Enable GitHub Pages for v2

1. In your repo on GitHub, go to **Settings → Pages**.
2. Under **Source**, select **GitHub Actions**.
3. The `Deploy v2 to GitHub Pages` workflow runs on every push to `main`. After the first run completes (~2 min), v2 is live at `https://YOUR-USERNAME.github.io/ira-walkthroughs/`.

### Step 4 — Deploy v3 to Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/speakingtrumpetskier-prog/ira-walkthroughs)

Click the button above. Render walks through the rest:
1. Sign in to Render (free account; first-time auth-with-GitHub takes one extra click).
2. Render reads `render.yaml`, names the service `convergent-v3`, and asks for one secret:
   - `ANTHROPIC_API_KEY` = your Anthropic key
3. Click **Apply**. Render builds and deploys (~3 min). The service URL appears at the top of the service page (e.g. `https://convergent-v3.onrender.com`).

**Render free tier note:** the service sleeps after 15 minutes of inactivity. The first request after a sleep takes ~30 seconds to wake up. Subsequent requests are instant. Tell your viewer about the cold start so they don't think it's broken.

### Step 5 — Send the URLs

Send your viewer:
- The v2 GitHub Pages URL.
- The v3 Render URL.

If you want to add authentication later, the simplest path is putting Cloudflare Access in front of the Render service, or switching back to the token-gated version.

---

## Running locally

### v2 (no API key needed)

```bash
cd v2-scripted
node server.js   # serves on http://127.0.0.1:8789
```

### v3 (live Claude, your key)

```bash
cd v3-live
cp .env.example .env
# edit .env — fill in ANTHROPIC_API_KEY
npm install
node server.js   # serves on http://127.0.0.1:8790
```

---

## Repo layout

```
.
├── v2-scripted/                Static walkthrough, scripted dialogue
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── server.js               (only used for local dev)
├── v3-live/                    Live Claude walkthrough
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── server.js               HTTP + Anthropic proxy + tool execution
│   ├── tools.js                Tool definitions + executor
│   ├── personas.js             System prompts + chip predicates
│   ├── package.json
│   └── .env.example
├── .github/workflows/pages.yml GitHub Pages deploy for v2
├── render.yaml                 Render Blueprint for v3
└── README.md                   (you are here)
```

## Caveats

- Tax rule logic in the dialogue is illustrative product copy, not legal advice. Review before any prospect-facing use.
- Pre-2020 deaths and post-deadline separate-accounting paths from the schema doc are deferred (consistent with Gen 1 cuts).
- v3 sessions are in-memory. If Render restarts the service, in-flight sessions reset. For a single-user demo this is fine.
- The v3 URL has no authentication. Your spend cap on the API key is the actual safeguard against runaway usage.
