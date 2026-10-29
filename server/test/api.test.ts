// Smoke tests for the server's HTTP API. Starts the real server on a free port with a fresh
// temp DATA_DIR, so it seeds its own data and never writes to server/data. No route here calls
// Claude or ElevenLabs, and the child gets no API keys, so a slip would fail rather than bill.

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { Conversation, ConversationSummary, User } from "../types";

const serverDir = fileURLToPath(new URL("..", import.meta.url));
const clientDist = fileURLToPath(new URL("../../client/dist/index.html", import.meta.url));
const PASSWORD = "smoke-test-password";
const STARTUP_TIMEOUT_MS = 20_000;

let child: ChildProcess | undefined;
let dataDir: string | undefined;
let baseUrl = "";
let serverOutput = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("No port assigned"));
      });
    });
  });
}

function basicAuth(password: string, username = "tester"): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function api(urlPath: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) headers.set("Authorization", basicAuth(PASSWORD));
  if (init.body) headers.set("Content-Type", "application/json");
  return fetch(`${baseUrl}${urlPath}`, { ...init, headers });
}

// The shape is asserted by each test; this only names it for the type checker.
function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) throw new Error(`Server exited early:\n${serverOutput}`);
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server didn't become healthy in ${STARTUP_TIMEOUT_MS}ms:\n${serverOutput}`);
}

async function stopServer(): Promise<void> {
  if (child && child.exitCode === null) {
    const exited = new Promise((resolve) => child?.once("exit", resolve));
    child.kill("SIGTERM");
    await exited;
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true });
}

before(async () => {
  try {
    dataDir = await mkdtemp(path.join(tmpdir(), "tutor-smoke-"));
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;

    // An allowlist, not a copy of process.env, so no API key, PORT, DATA_DIR or
    // TUTOR_VOICE_PROVIDER from the shell (or a sourced .env) reaches the server.
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      PORT: String(port),
      DATA_DIR: dataDir,
      SITE_PASSWORD: PASSWORD,
    };

    // Same as `tsx index.ts` (the `start` script, which doesn't load .env), as one process
    // so killing it leaves nothing behind.
    child = spawn(process.execPath, ["--import", "tsx", "index.ts"], { cwd: serverDir, env });
    child.stdout?.on("data", (chunk) => (serverOutput += chunk));
    child.stderr?.on("data", (chunk) => (serverOutput += chunk));

    await waitForHealth();
  } catch (error) {
    await stopServer();
    throw error;
  }
});

after(stopServer);

test("GET /api/health is open and reports ok", async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("API routes need the site password", async () => {
  const none = await fetch(`${baseUrl}/api/user`);
  assert.equal(none.status, 401);
  assert.match(none.headers.get("www-authenticate") ?? "", /^Basic /);

  const wrong = await api("/api/user", { headers: { Authorization: basicAuth("wrong") } });
  assert.equal(wrong.status, 401);

  const right = await api("/api/user", { headers: { Authorization: basicAuth(PASSWORD, "anyone") } });
  assert.equal(right.status, 200);
});

test("GET /api/user returns the user", async () => {
  const res = await api("/api/user");
  assert.equal(res.status, 200);
  const user = await json<User>(res);
  assert.equal(typeof user.name, "string");
  assert.equal(typeof user.plan, "string");
});

test("GET /api/conversations lists the seeded chats", async () => {
  const res = await api("/api/conversations");
  assert.equal(res.status, 200);
  const list = await json<ConversationSummary[]>(res);
  assert.ok(Array.isArray(list) && list.length > 0);
  for (const key of ["id", "title", "createdAt", "updatedAt"]) assert.ok(key in list[0], `missing ${key}`);
  assert.ok(!("messages" in list[0]), "the list shouldn't include messages");
});

test("conversations can be created, fetched and deleted", async () => {
  const empty = await api("/api/conversations", { method: "POST", body: JSON.stringify({ content: " " }) });
  assert.equal(empty.status, 400);

  const created = await api("/api/conversations", {
    method: "POST",
    body: JSON.stringify({ content: "Smoke test chat" }),
  });
  assert.equal(created.status, 201);
  const { id } = await json<Conversation>(created);
  assert.equal(typeof id, "string");

  const fetched = await api(`/api/conversations/${id}`);
  assert.equal(fetched.status, 200);
  const conversation = await json<Conversation>(fetched);
  assert.equal(conversation.id, id);
  assert.ok(Array.isArray(conversation.messages));

  const deleted = await api(`/api/conversations/${id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);

  assert.equal((await api(`/api/conversations/${id}`)).status, 404);
  assert.equal((await api(`/api/conversations/${id}`, { method: "DELETE" })).status, 404);
});

test("GET /api/tutor/voice falls back to the browser voice without a provider", async () => {
  const res = await api("/api/tutor/voice");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { provider: "browser" });
});

test("GET /api/tutor/:conversationId has no session for a plain chat", async () => {
  const [first] = await json<ConversationSummary[]>(await api("/api/conversations"));
  const res = await api(`/api/tutor/${first.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { session: null });
});

test("Tutor actions without a session are refused", async () => {
  const res = await api("/api/tutor/no-such-chat/exit", { method: "POST" });
  assert.equal(res.status, 409);
});

test("the Tutor intro can be marked seen and reset", async () => {
  const marked = await api("/api/tutor/intro", { method: "POST" });
  assert.equal(marked.status, 200);
  assert.deepEqual(await (await api("/api/tutor/intro")).json(), { seen: true });

  const cleared = await api("/api/tutor/intro", { method: "DELETE" });
  assert.equal(cleared.status, 200);
  assert.deepEqual(await (await api("/api/tutor/intro")).json(), { seen: false });
});

test("POST /api/reset puts the chats back to the seed", async () => {
  const seeded = await json<ConversationSummary[]>(await api("/api/conversations"));
  await api("/api/conversations", { method: "POST", body: JSON.stringify({ content: "Gone after reset" }) });

  const res = await api("/api/reset", { method: "POST" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });

  const afterReset = await json<ConversationSummary[]>(await api("/api/conversations"));
  assert.deepEqual(
    afterReset.map((c) => c.id),
    seeded.map((c) => c.id),
  );
});

test("GET / serves the built client", { skip: !existsSync(clientDist) && "client/dist not built" }, async () => {
  const res = await api("/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await res.text(), /<div id="root">/);
});
