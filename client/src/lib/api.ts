import type { Artifact, ConversationSummary, User } from "@/types";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

export function fetchConversations(signal?: AbortSignal) {
  return getJson<ConversationSummary[]>("/api/conversations", signal);
}

export function fetchArtifacts(signal?: AbortSignal) {
  return getJson<Artifact[]>("/api/artifacts", signal);
}

export function fetchUser(signal?: AbortSignal) {
  return getJson<User>("/api/user", signal);
}
