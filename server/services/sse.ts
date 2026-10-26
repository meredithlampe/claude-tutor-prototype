import type { Response } from "express";

// Proxies (e.g. Render's) can close a connection that sends nothing for a while, which a long
// Claude call or Tutor build can do. A comment line keeps it open; the client ignores it.
const KEEP_ALIVE_MS = 15_000;

// Starts a server-sent events response: headers go out now, nothing buffers, and a keep-alive
// comment is sent until the response closes.
export function openEventStream(res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const timer = setInterval(() => {
    if (!res.writableEnded) res.write(": keep-alive\n\n");
  }, KEEP_ALIVE_MS);
  res.on("close", () => clearInterval(timer));
}
