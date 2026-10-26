import { readSseData } from "@/lib/sse";
import type { FeatureEvent, StreamEvent } from "@/types";
import type { SendMessageOptions } from "@/features/types";
import type { TutorSession, WorkbookDraft, WorkbookEvent } from "./types";

function base(conversationId: string) {
  return `/api/tutor/${encodeURIComponent(conversationId)}`;
}

export async function fetchTutorSession(conversationId: string, signal?: AbortSignal) {
  const response = await fetch(base(conversationId), { signal });
  if (!response.ok) throw new Error(`GET tutor session failed with ${response.status}`);
  return ((await response.json()) as { session: TutorSession | null }).session;
}

// A 409 means the request didn't fit the session's state (e.g. a double click). The server
// sends the current session with it, so the caller can resync instead of failing.
export async function postTutor(
  conversationId: string,
  action: string,
  body: object = {},
): Promise<TutorSession> {
  const response = await fetch(`${base(conversationId)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { session?: TutorSession };
  if (data.session && (response.ok || response.status === 409)) return data.session;
  throw new Error(`POST tutor ${action} failed with ${response.status}`);
}

// What the workbook shows but hasn't submitted, by conversation. Kept outside React state so
// typing an answer doesn't re-render the chat thread; it's only read when a chat turn is sent.
const workbookDrafts = new Map<string, WorkbookDraft>();

export function setWorkbookDraft(conversationId: string, draft: WorkbookDraft) {
  workbookDrafts.set(conversationId, draft);
}

// No thanks: the server records the decline and streams Claude's normal answer, which the
// offer had stood in for.
export async function* declineAndAnswer(
  conversationId: string,
  { signal }: SendMessageOptions,
): AsyncGenerator<StreamEvent | FeatureEvent> {
  const response = await fetch(`${base(conversationId)}/decline`, { method: "POST", signal });
  if (!response.ok || !response.body) throw new Error(`POST tutor decline failed with ${response.status}`);
  for await (const chunk of readSseData(response.body)) {
    yield JSON.parse(chunk) as StreamEvent | FeatureEvent;
  }
}

// The Tutor chat turn: a typed message and/or a workbook event, plus the workbook draft.
export async function* sendTutorMessage(
  conversationId: string,
  { content, silent, data, retry, signal }: SendMessageOptions,
): AsyncGenerator<StreamEvent | FeatureEvent> {
  const event = data?.event as WorkbookEvent | undefined;
  const opening = typeof data?.opening === "string" ? data.opening : undefined;
  const response = await fetch(`${base(conversationId)}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: silent ? undefined : content,
      event,
      workbook: workbookDrafts.get(conversationId),
      opening,
      retry,
    }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`POST tutor chat failed with ${response.status}`);
  for await (const chunk of readSseData(response.body)) {
    yield JSON.parse(chunk) as StreamEvent | FeatureEvent;
  }
}

// Whether this user has seen the first-time intro dialog. Unknown (a failed request) shows it.
export async function fetchIntroSeen(): Promise<boolean> {
  try {
    const response = await fetch("/api/tutor/intro");
    return response.ok ? Boolean(((await response.json()) as { seen?: boolean }).seen) : false;
  } catch {
    return false;
  }
}

export function markIntroSeen(): Promise<void> {
  return fetch("/api/tutor/intro", { method: "POST" }).then(
    () => undefined,
    () => undefined,
  );
}

// Makes the first-time intro show again (the debug menu's reset).
export async function resetIntroSeen(): Promise<void> {
  const response = await fetch("/api/tutor/intro", { method: "DELETE" });
  if (!response.ok) throw new Error(`DELETE tutor intro failed with ${response.status}`);
}

// "browser" (speechSynthesis) or the id of a server voice provider, e.g. "elevenlabs".
export type VoiceProviderId = string;

// Which voice the server has set up for the tutor. Asked once per page; "browser" on failure.
let voiceProviderRequest: Promise<VoiceProviderId> | undefined;
export function fetchVoiceProvider(): Promise<VoiceProviderId> {
  voiceProviderRequest ??= fetch("/api/tutor/voice")
    .then((response) => (response.ok ? response.json() : { provider: "browser" }))
    .then((data: { provider?: string }) => data.provider ?? "browser")
    .catch(() => "browser");
  return voiceProviderRequest;
}

// One sentence as audio from the server's voice provider.
export async function fetchSpeech(text: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/tutor/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) throw new Error(`POST tutor tts failed with ${response.status}`);
  return response.blob();
}
