import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// HTTP Basic auth for the deployed prototype. Any username; only the password is checked.
// Comparing fixed-length digests keeps the check constant-time whatever the input's length.
export function requireSitePassword(password: string): RequestHandler {
  const expected = digest(password);
  return (req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? "").split(" ");
    if (scheme?.toLowerCase() === "basic" && encoded) {
      const credentials = Buffer.from(encoded, "base64").toString("utf8");
      const given = credentials.slice(credentials.indexOf(":") + 1);
      if (timingSafeEqual(digest(given), expected)) {
        next();
        return;
      }
    }
    res.set("WWW-Authenticate", 'Basic realm="Prototype", charset="UTF-8"');
    res.status(401).send("Password required");
  };
}
