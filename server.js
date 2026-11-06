import express from "express";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSearch } from "./lib/pipeline.js";
import { runResearch } from "./lib/research.js";
import { runMockResearch } from "./lib/mock.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const distDir = path.join(here, "dist");
const legacyDir = path.join(here, "public");
const hasDist = existsSync(path.join(distDir, "index.html"));

// Vite build output in production; the original static page remains as a
// fallback so `npm start` still works before the first build.
app.use(express.static(hasDist ? distDir : legacyDir));

// Serve front-end libs for the legacy page from node_modules.
app.get("/vendor/marked.js", (_req, res) =>
  res.sendFile(path.join(here, "node_modules/marked/lib/marked.umd.js")),
);
app.get("/vendor/purify.js", (_req, res) =>
  res.sendFile(path.join(here, "node_modules/dompurify/dist/purify.min.js")),
);

// ---------------------------------------------------------------------------
// Legacy event-per-step endpoint (kept for the original public/app.js page).
// ---------------------------------------------------------------------------
app.get("/api/search", async (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query || query.length > 500) {
    return res.status(400).json({ error: "q is required (max 500 chars)" });
  }

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const ac = new AbortController();
  res.on("close", () => ac.abort());

  const emit = (type, data) => {
    if (!res.writableEnded) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runSearch(query, emit, ac.signal);
  } catch (err) {
    if (!ac.signal.aborted) {
      console.error(err);
      emit("error", { message: String(err?.message ?? err) });
    }
  } finally {
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Research run manager
//
// One pipeline run per thread. Events are appended to a bounded log and fanned
// out to every subscriber. A browser that reconnects (Last-Event-ID) or a page
// that reloads (resume=1) replays the log instead of re-running the LLMs.
// ---------------------------------------------------------------------------
const RUN_TTL_MS = 15 * 60 * 1000;
const MAX_LOG = 10_000;
const runs = new Map();

function sseHeaders(res) {
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

function writeEvent(res, entry) {
  if (res.writableEnded) return;
  res.write(
    `id: ${entry.envelope.seq}\nevent: ${entry.type}\ndata: ${JSON.stringify(entry.envelope)}\n\n`,
  );
}

function attachRun(req, res, run, lastEventId) {
  sseHeaders(res);
  const sub = {
    send: (entry) => writeEvent(res, entry),
    end: () => {
      if (!res.writableEnded) res.end();
    },
  };

  for (const entry of run.log) {
    if (entry.envelope.seq > lastEventId) sub.send(entry);
  }

  if (run.done) {
    sub.end();
    return;
  }

  run.subscribers.add(sub);
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(": ping\n\n");
  }, 15_000);
  ping.unref?.();

  res.on("close", () => {
    clearInterval(ping);
    run.subscribers.delete(sub);
  });
}

function sendStreamError(res, { threadId, runId, code, message }) {
  sseHeaders(res);
  const envelope = {
    type: "error",
    seq: 0,
    run_id: runId ?? null,
    thread_id: threadId,
    code,
    message,
  };
  res.write(`event: error\ndata: ${JSON.stringify(envelope)}\n\n`);
  res.end();
}

function startRun({ threadId, query, scenario, res, req }) {
  const previous = runs.get(threadId);
  if (previous && !previous.done) {
    // A new question in the same thread supersedes the old stream.
    previous.controller.abort();
    previous.done = true;
    for (const subscriber of [...previous.subscribers]) subscriber.end();
    previous.subscribers.clear();
  }

  const run = {
    id: randomUUID(),
    threadId,
    query,
    seq: 0,
    log: [],
    subscribers: new Set(),
    done: false,
    controller: new AbortController(),
  };
  runs.set(threadId, run);

  const emit = (type, payload) => {
    if (run.done) return;
    run.seq += 1;
    const envelope = {
      type,
      seq: run.seq,
      run_id: run.id,
      thread_id: run.threadId,
      ...payload,
    };
    const entry = { type, envelope };
    run.log.push(entry);
    if (run.log.length > MAX_LOG) run.log.splice(0, run.log.length - MAX_LOG);
    for (const subscriber of [...run.subscribers]) subscriber.send(entry);
  };

  attachRun(req, res, run, 0);

  const runner = process.env.MOCK === "1" ? runMockResearch : runResearch;
  Promise.resolve()
    .then(() => runner(query, emit, run.controller.signal, { scenario }))
    .catch((error) => {
      if (run.controller.signal.aborted) return;
      console.error("[research] run failed:", error);
      emit("error", { message: String(error?.message ?? error) });
    })
    .finally(() => {
      if (run.done) return;
      emit("done", {});
      run.done = true;
      for (const subscriber of [...run.subscribers]) subscriber.end();
      run.subscribers.clear();
      const timer = setTimeout(() => {
        if (runs.get(threadId) === run) runs.delete(threadId);
      }, RUN_TTL_MS);
      timer.unref?.();
    });
}

app.get("/api/research", (req, res) => {
  const query = String(req.query.q ?? "").trim();
  if (!query || query.length > 500) {
    return res.status(400).json({ error: "q is required (max 500 chars)" });
  }

  const threadId = String(req.query.thread_id || randomUUID());
  const runIdParam = req.query.run_id ? String(req.query.run_id) : null;
  const headerLastId = Number.parseInt(String(req.headers["last-event-id"] ?? ""), 10);
  const queryLastId = Number.parseInt(String(req.query.last_event_id ?? ""), 10);
  const lastEventId = Math.max(
    Number.isFinite(headerLastId) ? headerLastId : 0,
    Number.isFinite(queryLastId) ? queryLastId : 0,
  );
  const wantsResume =
    req.query.resume === "1" || headerLastId > 0 || queryLastId > 0;

  if (wantsResume) {
    const run = runs.get(threadId);
    if (!run || (runIdParam && run.id !== runIdParam)) {
      sendStreamError(res, {
        threadId,
        runId: runIdParam,
        code: "session_expired",
        message: "之前的研究连接已过期，请重新发起搜索。",
      });
      return;
    }
    attachRun(req, res, run, lastEventId);
    return;
  }

  startRun({
    threadId,
    query,
    scenario: String(req.query.scenario ?? ""),
    req,
    res,
  });
});

// SPA fallback for the built React app.
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
  if (!req.accepts("html")) return next();
  const index = path.join(hasDist ? distDir : legacyDir, "index.html");
  if (!existsSync(index)) {
    return res
      .status(503)
      .send("Frontend not built yet. Run `npm run build` first (or `npm run dev`).");
  }
  res.sendFile(index);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`AI search running at http://localhost:${port}`);
  if (process.env.MOCK === "1") console.log("MOCK=1: /api/research serves a fixture stream");
});
