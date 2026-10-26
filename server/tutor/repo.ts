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

// Sessions taken off screen: by the debug menu's Clear all chats, or with their deleted
// conversation. Append-only: they're the study's
// research data (answers, timings, forms), so they're kept, not deleted.
const ARCHIVE_FILE = "tutor-sessions-archive.json";

type ArchivedSession = TutorSession & { archivedAt: string };

export function listArchivedSessions(): Promise<ArchivedSession[]> {
  return readJson<ArchivedSession[]>(ARCHIVE_FILE);
}

// Every session, or only one conversation's. Archives first, then removes only what was
// archived, so nothing is lost if one step fails and a session started meanwhile stays.
export async function archiveSessions(conversationId?: string): Promise<number> {
  const sessions = await listSessions(conversationId);
  if (sessions.length === 0) return 0;
  const archivedAt = new Date().toISOString();
  await updateJson<ArchivedSession[], void>(ARCHIVE_FILE, (archived) => ({
    data: [...archived, ...sessions.map((session) => ({ ...session, archivedAt }))],
    result: undefined,
  }));
  const ids = new Set(sessions.map((session) => session.id));
  await updateJson<TutorSession[], void>(FILE, (current) => ({
    data: current.filter((session) => !ids.has(session.id)),
    result: undefined,
  }));
  return sessions.length;
}

// Per-user Tutor state, keyed by user id (the user's name, as on sessions).
const USERS_FILE = "tutor-users.json";

interface TutorUserState {
  // When the learner clicked Got it on the first-time intro dialog.
  introSeenAt?: string;
}

export async function getTutorUser(userId: string): Promise<TutorUserState> {
  return (await readJson<Record<string, TutorUserState>>(USERS_FILE))[userId] ?? {};
}

export function updateTutorUser(
  userId: string,
  update: (state: TutorUserState) => TutorUserState,
): Promise<TutorUserState> {
  return updateJson<Record<string, TutorUserState>, TutorUserState>(USERS_FILE, (users) => {
    const state = update({ ...users[userId] });
    return { data: { ...users, [userId]: state }, result: state };
  });
}

// Every user's intro shows again; other per-user state is kept.
export function resetAllIntros(): Promise<void> {
  return updateJson<Record<string, TutorUserState>, void>(USERS_FILE, (users) => ({
    data: Object.fromEntries(
      Object.entries(users).map(([userId, state]) => [userId, { ...state, introSeenAt: undefined }]),
    ),
    result: undefined,
  }));
}
