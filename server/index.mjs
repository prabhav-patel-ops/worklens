import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store } from "./store.mjs";
import { applyCommand, assert, validateWorkspace } from "../shared/domain.js";
import { collectRepository } from "../shared/github.js";
import { managedRequest, reconcile, recoverPending } from "./ai.mjs";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
function equal(a, b) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function createApp({
  env = process.env,
  store = new Store(
    env.WORKLENS_DATABASE || resolve(root, "data/worklens.db"),
    env.WORKLENS_ENCRYPTION_KEY || "",
  ),
  fetcher = fetch,
} = {}) {
  const allowedOrigin = env.WORKLENS_ORIGIN || "http://localhost:4173";
  const attempts = new Map();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const origin = req.headers.origin;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    const send = (code, data) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (url.pathname.startsWith("/api/")) {
        if (origin && origin !== allowedOrigin)
          return send(403, { error: "This website origin is not allowed." });
        if (req.method === "OPTIONS") {
          res.writeHead(204);
          return res.end();
        }
        if (!env.WORKLENS_OWNER_TOKEN || env.WORKLENS_OWNER_TOKEN.length < 24)
          return send(503, {
            error:
              "Backend setup is incomplete. Set a long owner access token.",
          });
        const auth = req.headers.authorization || "";
        if (!equal(auth, `Bearer ${env.WORKLENS_OWNER_TOKEN}`)) {
          const ip = req.socket.remoteAddress || "unknown";
          const prev = attempts.get(ip);
          const entry =
            prev && Date.now() - prev.since < 60000
              ? prev
              : { since: Date.now(), count: 0 };
          entry.count++;
          attempts.set(ip, entry);
          if (attempts.size > 10000) attempts.clear();
          return send(entry.count > 10 ? 429 : 401, {
            error: "Enter the owner access token configured on the backend.",
          });
        }
        recoverPending(store);
        if (req.method === "GET" && url.pathname === "/api/workspace")
          return send(200, {
            workspace: store.read(),
            capabilities: {
              ai: !!env.OPENAI_API_KEY,
              model: env.OPENAI_MODEL || "gpt-4.1-mini",
              privateGithub: !!env.WORKLENS_ENCRYPTION_KEY,
            },
          });
        if (req.method !== "POST")
          return send(405, { error: "Method not allowed." });
        assert(
          req.headers["content-type"]?.startsWith("application/json"),
          "Send JSON content.",
        );
        let raw = "",
          bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          assert(bytes <= 12e6, "Request is too large.");
          raw += chunk;
        }
        const d = JSON.parse(raw);
        if (url.pathname === "/api/command") {
          assert(
            !["github", "connection"].includes(d.type),
            "Use the verified GitHub connection routes.",
          );
          const s = store.transaction((s) => {
            const next = applyCommand(s, d);
            if (d.type === "disconnect") store.forget(d.data.id);
            return store.save(next);
          });
          return send(200, { workspace: s });
        }
        if (url.pathname === "/api/connection") {
          assert(
            typeof (d.token || "") === "string" &&
              (d.token || "").length < 1000,
            "Invalid GitHub credential.",
          );
          const collected = await collectRepository(
            d.repository,
            store.read().accounts,
            d.token || "",
            fetcher,
          );
          const s = store.transaction((s) => {
            let next = applyCommand(s, {
              type: "connection",
              revision: d.revision,
              data: {
                repository: d.repository,
                description: collected.description,
                private: collected.private,
              },
            });
            const c = next.connections.find(
              (c) => c.repository === d.repository.toLowerCase(),
            );
            if (d.token) store.setSecret(c.id, d.token);
            next = applyCommand(next, {
              type: "github",
              revision: next.revision,
              data: { id: c.id, ...collected },
            });
            return store.save(next);
          });
          return send(200, { workspace: s });
        }
        if (url.pathname === "/api/sync") {
          const snapshot = store.read(),
            c = snapshot.connections.find((c) => c.id === d.id);
          assert(c, "Connection no longer exists.");
          const data = await collectRepository(
            c.repository,
            snapshot.accounts,
            store.secret(c.id),
            fetcher,
          );
          const s = store.transaction((s) => {
            const live = s.connections.find((x) => x.id === c.id);
            assert(live, "Connection was removed while synchronizing.");
            for (const e of data.events)
              e.accountId =
                s.accounts.find(
                  (a) =>
                    a.github &&
                    a.github.toLowerCase() === e.author?.toLowerCase(),
                )?.id || "";
            return store.save(
              applyCommand(s, {
                type: "github",
                revision: s.revision,
                data: { id: c.id, ...data },
              }),
            );
          });
          return send(200, { workspace: s });
        }
        if (url.pathname === "/api/ai")
          return send(200, await managedRequest(store, d, env, fetcher));
        if (url.pathname === "/api/reconcile")
          return send(200, { workspace: reconcile(store, d) });
        if (url.pathname === "/api/restore") {
          validateWorkspace(d.workspace);
          assert(
            !d.workspace.events.some(
              (e) => e.status === "pending" || e.reservedTokens > 0,
            ),
            "Resolve reserved requests before restoring.",
          );
          const s = store.transaction((current) => {
            assert(
              d.revision === current.revision,
              "Workspace changed. Refresh before restoring.",
            );
            assert(
              !current.events.some((e) => e.reservedTokens > 0),
              "Resolve server reservations before restoring.",
            );
            const restored = structuredClone(d.workspace);
            restored.revision = current.revision + 1;
            store.db.exec("DELETE FROM secrets; DELETE FROM requests;");
            return store.save(restored);
          });
          return send(200, { workspace: s });
        }
        return send(404, { error: "Unknown API route." });
      }
      if (!["GET", "HEAD"].includes(req.method))
        return send(405, { error: "Method not allowed." });
      const publicRoot = resolve(root, "public"),
        sharedRoot = resolve(root, "shared");
      const shared = url.pathname.startsWith("/shared/");
      const base = shared ? sharedRoot : publicRoot;
      const path = resolve(
        base,
        decodeURIComponent(
          (shared ? url.pathname.slice(8) : url.pathname.slice(1)) ||
            "index.html",
        ),
      );
      if (!path.startsWith(base + sep))
        return send(403, { error: "Forbidden path." });
      const data = await readFile(path);
      res.writeHead(200, {
        "Content-Type": MIME[extname(path)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      const status =
        error.code === "ENOENT"
          ? 404
          : /changed|already used|already active/.test(error.message)
            ? 409
            : 400;
      send(status, {
        error: error.code === "ENOENT" ? "File not found." : error.message,
      });
    }
  });
  return { server, store };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 4173);
  app.server.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Worklens: http://localhost:${port}`),
  );
  const timer = setInterval(() => {
    try {
      recoverPending(app.store);
    } catch {}
  }, 30000);
  timer.unref();
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => {
      clearInterval(timer);
      app.server.close(() => {
        app.store.close();
        process.exit(0);
      });
    });
}
