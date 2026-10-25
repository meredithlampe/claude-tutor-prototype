import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatContext } from "@/features/types";
import type { FeatureEvent } from "@/types";
import { fetchTutorSession, postTutor, setWorkbookDraft } from "./api";
import { tutorContent } from "./content";
import { progressLabel } from "./progress";
import {
  ACTIVE_STATUSES,
  type AnswerInput,
  type TutorMode,
  type TutorSession,
  type TutorTab,
  type WorkbookDraft,
  type WorkbookEvent,
} from "./types";

type QueuedEvent = { event: WorkbookEvent; text?: string };

export type TutorAction =
  | "start"
  | "decline"
  | "answer"
  | "reveal"
  | "explain"
  | "parallel"
  | "advance"
  | "build"
  | "exit";

export function useTutorSession(chat: ChatContext) {
  const { conversationId } = chat;
  const [session, setSession] = useState<TutorSession | null>(null);
  // The reply the offer arrived during, before a reload gives it its stored id.
  const [liveOfferReplyId, setLiveOfferReplyId] = useState<string>();
  const [busy, setBusy] = useState<TutorAction | null>(null);
  const [failed, setFailed] = useState<TutorAction | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [tab, setTabState] = useState<TutorTab>("chat");
  const [unseen, setUnseen] = useState<Record<TutorTab, boolean>>({ chat: false, workbook: false });
  // True once the tutor has asked its first scoping question, so the choice chips can show.
  const [scopingAsked, setScopingAsked] = useState(false);
  const [justStarted, setJustStarted] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);

  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(session);
  const chatRef = useRef(chat);
  const queueRef = useRef<QueuedEvent[]>([]);
  const buildRequestedRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    sessionRef.current = session;
    chatRef.current = chat;
  });

  const active = Boolean(session && ACTIVE_STATUSES.includes(session.status));

  useEffect(() => {
    const controller = new AbortController();
    fetchTutorSession(conversationId, controller.signal)
      .then((loaded) => {
        setSession(loaded);
        if (loaded?.status === "scoping") setScopingAsked(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [conversationId]);

  // Workbook events are sent once Tutor's sendMessage is in place (after the render that made
  // the session active) and no other reply is streaming.
  useEffect(() => {
    if (!active || chat.isStreaming) return;
    const next = queueRef.current.shift();
    if (!next) return;
    chatRef.current.send(next.text ?? "", { silent: !next.text, data: { event: next.event } });
  }, [active, chat.isStreaming, queueVersion]);

  function queueEvent(event: WorkbookEvent, text?: string) {
    queueRef.current.push({ event, text });
    setQueueVersion((version) => version + 1);
  }

  function setTab(next: TutorTab) {
    setTabState(next);
    setUnseen((current) => ({ ...current, [next]: false }));
  }

  // Events and announcements that follow from a change in the workbook.
  function applySession(next: TutorSession) {
    const previous = sessionRef.current;
    sessionRef.current = next;
    setSession(next);

    const before = previous?.current;
    const after = next.current;
    if (after && after.question.id !== before?.question.id) {
      if (after.section === "step" && (before?.section !== "step" || before.stepIndex !== after.stepIndex)) {
        queueEvent({ type: "step_started", stepIndex: after.stepIndex ?? 0 });
      }
      if (after.section === "final" && before?.section !== "final") queueEvent({ type: "final_check_started" });
      if (tab === "chat") setUnseen((current) => ({ ...current, workbook: true }));
    }
    if (next.building && next.building !== previous?.building) {
      setAnnouncement(tutorContent.announcements.building);
    }
    if (next.status === "wrap_up" && previous?.status !== "wrap_up") {
      queueEvent({ type: "battery_complete" });
      if (tab === "chat") setUnseen((current) => ({ ...current, workbook: true }));
    }
  }

  async function run(action: TutorAction, request: () => Promise<TutorSession>) {
    setBusy(action);
    setFailed(null);
    try {
      const next = await request();
      applySession(next);
      return next;
    } catch {
      setFailed(action);
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  // Builds the part of the workbook the session is waiting on (the server shares one build).
  useEffect(() => {
    if (!active || !session?.building || session.generationError) return;
    const key = `${session.id}:${session.building}`;
    if (buildRequestedRef.current === key) return;
    buildRequestedRef.current = key;
    void run("build", () => postTutor(conversationId, "advance")).then((next) => {
      buildRequestedRef.current = null;
      if (next?.current) {
        setAnnouncement(tutorContent.announcements.ready(progressLabel(next)));
      }
    });
    // run and applySession only read refs and setters; the build depends on these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, session?.id, session?.building, session?.generationError, conversationId]);

  function retryBuild() {
    if (!session) return;
    buildRequestedRef.current = `${session.id}:${session.building}`;
    void run("build", () => postTutor(conversationId, "advance")).then(() => {
      buildRequestedRef.current = null;
    });
  }

  async function start(mode: TutorMode) {
    const next = await run("start", () => postTutor(conversationId, "start", { mode }));
    if (!next || !ACTIVE_STATUSES.includes(next.status)) return;
    setJustStarted(true);
    setTab("chat");
    queueEvent({ type: "session_started" });
  }

  function decline() {
    void run("decline", () => postTutor(conversationId, "decline"));
  }

  async function submit(input: AnswerInput) {
    const before = sessionRef.current?.current;
    const next = await run("answer", () => postTutor(conversationId, "answer", input));
    if (!next || !before) return;
    if (before.section !== "step") {
      setAnnouncement(tutorContent.announcements.recorded);
      return;
    }
    // Practice results are read out by moving focus to the feedback (see QuestionCard).
    const after = next.current;
    const missed = after?.question.id === input.questionId && (after.practice?.missed || after.reveal?.via === "auto_after_two_misses");
    if (missed) {
      queueEvent({ type: "wrong_answer", questionId: input.questionId });
    }
  }

  async function revealAnswer(questionId: string, via: "show_me" | "show_answer") {
    await run("reveal", () => postTutor(conversationId, "reveal", { questionId, via }));
  }

  async function explain(questionId: string) {
    const next = await run("explain", () => postTutor(conversationId, "explain", { questionId }));
    if (!next) return;
    setTab("chat");
    queueEvent({ type: "explain_my_thinking", questionId }, tutorContent.chat.explainMessage);
    // The learner explains in the chat next. Wait a frame for the Chat tab to show.
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }

  function tryParallel() {
    void run("parallel", () => postTutor(conversationId, "parallel"));
  }

  function next(fromQuestionId: string) {
    void run("advance", () => postTutor(conversationId, "advance", { fromQuestionId }));
  }

  function exit() {
    queueRef.current = [];
    void run("exit", () => postTutor(conversationId, "exit"));
  }

  // Stream events from the clone's chat route (the offer) and Tutor's chat route.
  function onEvent(event: FeatureEvent, replyId: string) {
    if (event.type === "tutor_offer") {
      setLiveOfferReplyId(replyId);
      void fetchTutorSession(conversationId).then(setSession).catch(() => {});
    } else if (event.type === "tutor_session" && event.session) {
      // Sent as each tutor reply starts. Chips hide while it streams, then answer its question.
      const next = event.session as TutorSession;
      if (next.status === "scoping") setScopingAsked(true);
      if (tab === "workbook") setUnseen((current) => ({ ...current, chat: true }));
      applySession(next);
    }
  }

  return {
    session,
    active,
    liveOfferReplyId,
    busy,
    failed,
    announcement,
    tab,
    setTab,
    unseen,
    scopingAsked,
    justStarted,
    setDraft: (draft: WorkbookDraft) => setWorkbookDraft(conversationId, draft),
    composerInputRef,
    start,
    decline,
    submit,
    revealAnswer,
    explain,
    tryParallel,
    next,
    exit,
    retryBuild,
    onEvent,
  };
}

export type TutorState = ReturnType<typeof useTutorSession>;
