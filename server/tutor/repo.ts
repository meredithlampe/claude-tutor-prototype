import { randomUUID } from "node:crypto";
import { readJson, updateJson } from "../repo/jsonFile";
import type { TutorSession } from "./types";

const FILE = "tutor-sessions.json";

export async function listSessions(conversationId?: string): Promise<TutorSession[]> {
  const sessions = await readJson<TutorSession[]>(FILE);
  return conversationId
    ? sessions.filter((session) => session.conversationId === conversationId)
    : sessions;
}

// The conversation's most recent session, which is the one the UI shows.
export async function getLatestSession(conversationId: string): Promise<TutorSession | undefined> {
  return (await listSessions(conversationId)).at(-1);
}

export function createSession(
  fields: Omit<TutorSession, "id" | "createdAt" | "updatedAt">,
): Promise<TutorSession> {
  const now = new Date().toISOString();
  const session: TutorSession = { ...fields, id: randomUUID(), createdAt: now, updatedAt: now };
  return updateJson<TutorSession[], TutorSession>(FILE, (sessions) => ({
    data: [...sessions, session],
    result: session,
  }));
}

// Read-modify-write inside the file's write queue, so concurrent updates (a background grade
// and a learner's click) can't overwrite each other. `update` may throw to abort.
export function updateSession(
  sessionId: string,
  update: (session: TutorSession) => TutorSession,
): Promise<TutorSession> {
  return updateJson<TutorSession[], TutorSession>(FILE, (sessions) => {
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) throw new Error(`Tutor session ${sessionId} not found`);
    const updated = { ...update(structuredClone(sessions[index])), updatedAt: new Date().toISOString() };
    const data = [...sessions];
    data[index] = updated;
    return { data, result: updated };
  });
}
