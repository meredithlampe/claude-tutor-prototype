import express from "express";
import { listArtifacts } from "./repo/artifacts";
import { getUser } from "./repo/user";
import { conversationsRouter } from "./routes/conversations";

const app = express();
const port = Number(process.env.PORT) || 3001;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/conversations", conversationsRouter);

app.get("/api/artifacts", async (_req, res) => {
  res.json(await listArtifacts());
});

app.get("/api/user", async (_req, res) => {
  res.json(await getUser());
});

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Server listening on http://localhost:${port}`);
});
