import type { Artifact } from "../types";
import { readJson } from "./jsonFile";

export async function listArtifacts(): Promise<Artifact[]> {
  const artifacts = await readJson<Artifact[]>("artifacts.json");
  return artifacts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
