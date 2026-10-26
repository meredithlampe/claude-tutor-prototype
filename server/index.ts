import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { features, resetFeatures } from "./features";
import { listArtifacts } from "./repo/artifacts";
import { resetConversations } from "./repo/conversations";
import { seedDataDir } from "./repo/jsonFile";
import { getUser } from "./repo/user";
import { conversationsRouter } from "./routes/conversations";
import { requireSitePassword } from "./sitePassword";

const app = express();
const port = Number(process.env.PORT) || 3001;
const clientDist = fileURLToPath(new URL("../client/dist/", import.meta.url));

const seeded = await seedDataDir();
if (seeded.length) console.log(`Seeded ${process.env.DATA_DIR}: ${seeded.join(", ")}`);

// Before the password, so the host's health check gets through.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

if (process.env.SITE_PASSWORD) app.use(requireSitePassword(process.env.SITE_PASSWORD));

app.use(express.json());

app.use("/api/conversations", conversationsRouter);

for (const feature of features) {
  if (feature.router) app.use(`/api/${feature.id}`, feature.router);
}

app.get("/api/artifacts", async (_req, res) => {
  res.json(await listArtifacts());
});

app.get("/api/user", async (_req, res) => {
  res.json(await getUser());
});

// Between test participants: conversations go back to the sample chats, and each feature
// clears its own state.
app.post("/api/reset", async (_req, res) => {
  try {
    await resetConversations();
    await resetFeatures();
    res.json({ ok: true });
  } catch (error) {
    console.error("Reset failed", error);
    res.status(500).json({ error: "Reset failed" });
  }
});

// The built client, with every other non-API GET falling back to index.html for client routes.
if (existsSync(clientDist) || process.env.NODE_ENV === "production") {
  app.use(express.static(clientDist));
  app.get("/{*path}", (req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile("index.html", { root: clientDist });
  });
}

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Server listening on http://localhost:${port}`);
  if (process.env.SITE_PASSWORD) console.log("Site password is on");
});
