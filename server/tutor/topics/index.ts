import { readFileSync } from "node:fs";
import type { Topic } from "../types";

// The active topics, one JSON file each in this folder. To add a topic, add its file and a
// line here; to switch topics for a test, change this list.
const activeTopicFiles = ["stats.base_rates.json", "social.bystander.json"];

function loadTopic(fileName: string): Topic {
  const raw = readFileSync(new URL(fileName, import.meta.url), "utf8");
  return JSON.parse(raw) as Topic;
}

export const topics: Topic[] = activeTopicFiles.map(loadTopic);

export function getTopic(id: string | undefined): Topic | undefined {
  return id ? topics.find((topic) => topic.id === id) : undefined;
}
