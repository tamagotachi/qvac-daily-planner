// Daily Planner - list your tasks, and an AI on YOUR machine (QVAC) suggests a smart order and time estimates.
// The page then fits them around your appointments on a timeline. Open http://localhost:3079 after starting.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// The QVAC worker can be slow to start on some computers. Wait up to 3 minutes for it.
process.env.QVAC_RPC_INIT_TIMEOUT_MS ??= "180000";
const { loadModel, completion, LLAMA_3_2_1B_INST_Q4_0 } = await import("@qvac/sdk");

const PORT = 3079;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Step 1: load the AI model (downloads the first time, then it's cached) ----
let modelId = null;
const status = { ready: false, message: "Starting...", percent: null, error: null };
async function startModel() {
  try {
    status.message = "Loading the AI model (first run downloads it)...";
    modelId = await loadModel({
      modelSrc: LLAMA_3_2_1B_INST_Q4_0,
      modelType: "llm",
      onProgress: (p) => { const v = typeof p === "number" ? p : p?.percentage; if (typeof v === "number") status.percent = Math.round(v); },
    });
    status.ready = true; status.message = "AI day planner ready";
    console.log("Model loaded. Open http://localhost:" + PORT);
  } catch (err) { status.error = String(err?.message || err); console.error("Could not load model:", err); }
}

// One AI job at a time
let chain = Promise.resolve();
const enqueue = (job) => { const p = chain.then(job); chain = p.catch(() => {}); return p; };

function readBody(req, limit = 10000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > limit) { reject(new Error("Too big")); req.destroy(); } });
    req.on("end", () => resolve(data)); req.on("error", reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const clean = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);

// QVAC "structured output": the tasks in a suggested order, each with minutes and a short reason.
const SCHEMA = { type: "object", properties: { plan: { type: "array", items: { type: "object", properties: { task: { type: "string" }, minutes: { type: "integer" }, why: { type: "string" } }, required: ["task", "minutes", "why"], additionalProperties: false } } }, required: ["plan"], additionalProperties: false };
const SYSTEM_PROMPT = `You are a productivity coach who orders a to-do list for one day. Reply with JSON only.
Return EVERY task exactly as written (copy the task text), in the best order: important and hard tasks when energy is high (usually earlier),
similar small tasks grouped together, easy tasks later. minutes: a realistic estimate (keep the user's estimate if they gave one).
why: a very short reason for its position (maximum 8 words). Do not add or remove tasks.`;

// ---- Step 2: the web server ----
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(path.join(__dirname, "public", "index.html")));
    }
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, status);
    if (req.method === "POST" && req.url === "/api/order") {
      if (!status.ready) return json(res, 503, { error: "The AI day planner is not ready yet." });
      const tasks = (JSON.parse(await readBody(req, 20000)).tasks || []).map((t) => ({ text: clean(t.text, 120), minutes: parseInt(t.minutes, 10) || 0, important: !!t.important })).filter((t) => t.text).slice(0, 25);
      if (!tasks.length) return json(res, 400, { error: "Add some tasks first." });
      const list = tasks.map((t) => "- " + t.text + (t.minutes ? ` (${t.minutes} min)` : "") + (t.important ? " [important]" : "")).join("\n");
      const r = await enqueue(async () => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            // This is the QVAC call that runs the AI on-device
            const run = completion({ modelId, stream: true, history: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: "Tasks:\n" + list }], responseFormat: { type: "json_schema", json_schema: { name: "DayPlan", schema: SCHEMA } } });
            let out = "";
            for await (const event of run.events) if (event.type === "contentDelta") out += event.text;
            // Match every AI task back to one of the user's tasks, so nothing is invented or lost
            const left = [...tasks], plan = [];
            for (const p of JSON.parse(out).plan || []) {
              const k = left.findIndex((t) => t.text.toLowerCase() === clean(p.task, 120).toLowerCase()) >= 0 ? left.findIndex((t) => t.text.toLowerCase() === clean(p.task, 120).toLowerCase())
                : left.findIndex((t) => clean(p.task, 120).toLowerCase().includes(t.text.toLowerCase().slice(0, 12)) || t.text.toLowerCase().includes(clean(p.task, 120).toLowerCase().slice(0, 12)));
              if (k < 0) continue;
              const t = left.splice(k, 1)[0];
              plan.push({ task: t.text, minutes: t.minutes || Math.max(5, Math.min(240, Math.round(Number(p.minutes) || 30))), why: clean(p.why, 80), important: t.important });
            }
            left.forEach((t) => plan.push({ task: t.text, minutes: t.minutes || 30, why: "", important: t.important }));   // anything the AI skipped goes at the end
            if (plan.length) return plan;
          } catch (err) { console.error("Order attempt failed:", err.message); }
        }
        return null;
      });
      return r ? json(res, 200, r) : json(res, 502, { error: "The AI couldn't order the tasks. Try again." });
    }
    res.writeHead(404); res.end("Not found");
  } catch (err) { console.error(err); json(res, 500, { error: String(err?.message || err) }); }
});

// "127.0.0.1" means only YOUR computer can reach this app
server.listen(PORT, "127.0.0.1", () => console.log("Server running at http://localhost:" + PORT));
startModel();
