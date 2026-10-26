import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatContext } from "@/features/types";
import type { FeatureEvent } from "@/types";
import { declineAndAnswer, fetchIntroSeen, fetchTutorSession, markIntroSeen, postTutor, setWorkbookDraft } from "./api";
import { tutorContent } from "./content";
import { progressLabel } from "./progress";
import { checkVoice, type VoiceUnavailable } from "./useSpeech";
import {
  ACTIVE_STATUSES,
  type AnswerInput,
  type TutorMode,
  type TutorSession,
  type TutorTab,
  type WorkbookDraft,
  type WorkbookEvent,
} from "./types";

// `opening`: the fixed first line of the session's first tutor message (session_started only).
type QueuedEvent = { event: WorkbookEvent; text?: string; opening?: string };

// TutorLayout's lg breakpoint, from which chat and workbook sit side by side instead of as tabs.
function isSideBySide(): boolean {
  return window.matchMedia("(min-width: 64rem)").matches;
}

// Read once at session start: the line is stored with the message, so a later resize keeps it.
function openingLine(session: TutorSession): string {
  const { opening } = tutorContent;
  const textLine = isSideBySide() ? opening.text : opening.textTabs;
  return `${opening.intro(session.topicName)} ${session.mode === "voice" ? opening.voice : textLine}`;
}

// What's on screen in the workbook, for deciding when something new has arrived.
function workbookKey(session: TutorSession | null): string | undefined {
  return session?.status === "wrap_up" ? "wrap_up" : session?.current?.question.id;
}

// How long a newly revealed workbook item fades in, during which no tutor reply starts.
const REVEAL_MS = 400;

export type TutorAction =
  | "start"
  | "decline"
  | "answer"
  | "reveal"
  | "explain"
  | "parallel"
  | "advance"
  | "build"
  | "summary"
  | "consent"
  | "practice"
  | "mode"
  | "exit"
  | "resume";

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
  // The first-time intro dialog. The tutor doesn't start until it's closed.
  const [introOpen, setIntroOpen] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  // Why voice isn't running, when the learner chose it. Shown in the banner until dismissed.
  const [voiceNotice, setVoiceNotice] = useState<VoiceUnavailable | null>(null);
  // Voice was turned on by a click in this page, so the browser will let it speak.
  const [voiceArmed, setVoiceArmed] = useState(false);
  // The answer streamed after No thanks, before a reload gives it its stored id.
  const [liveDeclineReplyId, setLiveDeclineReplyId] = useState<string>();
  // The reply the paused card follows, before a reload gives it its stored id.
  const [liveExitReplyId, setLiveExitReplyId] = useState<string>();

  // One place to look at a time: the surface in focus is highlighted and the other dimmed.
  const [focus, setFocusState] = useState<TutorTab>("chat");
  const focusRef = useRef<TutorTab>("chat");
  function setFocus(surface: TutorTab) {
    focusRef.current = surface;
    setFocusState(surface);
  }
  // A new workbook item waits while the tutor's message about it streams, then appears.
  const [heldKey, setHeldKey] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const heldKeyRef = useRef<string | null>(null);
  // Whether the reply streaming now answers a workbook event (then the workbook comes back
  // into focus after it) or the learner's own message (focus stays on the chat).
  const replyKindRef = useRef<"workbook" | "chat">("chat");
  const wasTalkingRef = useRef(false);
  // In voice mode the tutor is still talking after the reply has streamed, until it has been
  // spoken. Reported by the speech hook (see tutorFeature), which is set up after this one.
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  const talking = chat.isStreaming || speaking;
  const talkingRef = useRef(talking);

  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const sessionRef = useRef(session);
  const chatRef = useRef(chat);
  const queueRef = useRef<QueuedEvent[]>([]);
  const buildRequestedRef = useRef<string | null>(null);
  const summaryRequestedRef = useRef<string | null>(null);
  // The last Tutor reply in this page (its client id), for placing the paused card.
  const lastReplyIdRef = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    sessionRef.current = session;
    chatRef.current = chat;
    speakingRef.current = speaking;
    talkingRef.current = talking;
  });

  const active = Boolean(session && ACTIVE_STATUSES.includes(session.status));

  useEffect(() => {
    const controller = new AbortController();
    fetchTutorSession(conversationId, controller.signal)
      .then(async (loaded) => {
        setSession(loaded);
        // Reloaded while the intro dialog was open: the tutor hasn't started yet, so show it again.
        const notStarted = loaded?.status === "scoping" && !loaded.scoping.goal;
        if (notStarted && !(await fetchIntroSeen()) && !controller.signal.aborted) {
          setIntroOpen(true);
          return;
        }
        if (loaded?.status === "scoping") setScopingAsked(true);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [conversationId]);

  // Moves focus between the chat and the workbook for the learner: highlights the surface,
  // shows it on narrow screens, moves keyboard focus there (unless they're typing), and
  // announces the change. `revealed` means the workbook just showed a new item, whose heading
  // the workbook focuses itself.
  function moveFocus(surface: TutorTab, revealed = false) {
    const changed = focusRef.current !== surface;
    setFocus(surface);
    setTab(surface);
    if (changed || revealed) {
      setAnnouncement(
        surface === "chat"
          ? tutorContent.announcements.focusChat
          : tutorContent.announcements.focusWorkbook(sessionRef.current ? progressLabel(sessionRef.current) : ""),
      );
    }
    // After the render that shows the surface. A timeout, not requestAnimationFrame: rAF is
    // paused in background tabs, and a late move would steal focus. Dropped if focus has
    // moved on since.
    setTimeout(() => {
      if (focusRef.current !== surface) return;
      const current = document.activeElement;
      const typing =
        (current instanceof HTMLTextAreaElement || current instanceof HTMLInputElement) &&
        current.type !== "radio" &&
        current.value.trim() !== "";
      if (typing) return;
      if (surface === "chat") composerInputRef.current?.focus({ preventScroll: true });
      else if (!revealed) {
        const target = document.querySelector<HTMLElement>("[data-tutor-return]") ?? document.getElementById("tutor-item-heading");
        target?.focus();
      }
    }, 50);
  }

  function reveal() {
    heldKeyRef.current = null;
    setHeldKey(null);
    setRevealing(true);
    setTimeout(() => setRevealing(false), REVEAL_MS);
    moveFocus("workbook", true);
  }

  // A tutor reply starting brings the chat into focus; when the tutor has finished (streamed,
  // and in voice mode spoken), a held workbook item appears (focus moves there), or focus
  // returns to the workbook after a workbook event. Defined before the queue below, so it
  // sees whether another event is about to be sent.
  useEffect(() => {
    if (!active) return;
    const started = talking && !wasTalkingRef.current;
    const finished = !talking && wasTalkingRef.current;
    wasTalkingRef.current = talking;
    if (started) moveFocus("chat");
    if (!finished || queueRef.current.length > 0) return;
    if (heldKeyRef.current) reveal();
    else if (replyKindRef.current === "workbook") moveFocus("workbook");
    replyKindRef.current = "chat";
    // moveFocus and reveal only read refs, state setters and the latest focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, talking]);

  // Workbook events are sent once Tutor's sendMessage is in place (after the render that made
  // the session active), the tutor isn't talking, and no new item is fading in.
  useEffect(() => {
    if (!active || talking || revealing) return;
    const next = queueRef.current.shift();
    if (!next) return;
    // The opening (the first scoping question) is a chat reply: the chat stays in focus, with its
    // choices, through scoping, until the first workbook item (the self-report) appears.
    const chatReply = next.event.type === "explain_my_thinking" || next.event.type === "session_started";
    replyKindRef.current = chatReply ? "chat" : "workbook";
    chatRef.current.send(next.text ?? "", { silent: !next.text, data: { event: next.event, opening: next.opening } });
  }, [active, talking, queueVersion, revealing]);

  function queueEvent(event: WorkbookEvent, text?: string, opening?: string) {
    queueRef.current.push({ event, text, opening });
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
    // Coming back from a pause isn't a new phase: resume sends its own event.
    const wasActive = Boolean(previous && ACTIVE_STATUSES.includes(previous.status));
    if (wasActive && after && after.question.id !== before?.question.id) {
      if (after.section === "step" && (before?.section !== "step" || before.stepIndex !== after.stepIndex)) {
        queueEvent({ type: "step_started", stepIndex: after.stepIndex ?? 0 });
      }
      if (after.section === "final" && before?.section !== "final") queueEvent({ type: "final_check_started" });
      if (after.section === "practice" && before?.section !== "practice") queueEvent({ type: "practice_started" });
      if (tab === "chat") setUnseen((current) => ({ ...current, workbook: true }));
    }
    if (next.building && next.building !== previous?.building) {
      setAnnouncement(tutorContent.announcements.building);
    }
    if (wasActive && next.status === "wrap_up" && previous?.status !== "wrap_up") {
      queueEvent({ type: "battery_complete" });
      if (tab === "chat") setUnseen((current) => ({ ...current, workbook: true }));
    }

    // Something new for the workbook: if the tutor is talking (or about to), it waits until
    // the tutor has finished; otherwise it appears now, with the workbook in focus.
    const key = workbookKey(next);
    if (key && key !== workbookKey(previous) && ACTIVE_STATUSES.includes(next.status)) {
      if (talkingRef.current || queueRef.current.length > 0) {
        heldKeyRef.current = key;
        setHeldKey(key);
      } else if (wasActive) {
        reveal();
      }
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

  async function start(requestedMode: TutorMode) {
    // Voice needs speech recognition and the microphone; without them, start in text and say why.
    // The offer's buttons stay disabled while the browser asks for the microphone.
    setBusy("start");
    const introSeen = fetchIntroSeen();
    const unavailable = requestedMode === "voice" ? await checkVoice() : undefined;
    const mode = unavailable ? "text" : requestedMode;
    const showIntro = !(await introSeen);
    const next = await run("start", async () => {
      const started = await postTutor(conversationId, "start", { mode, requestedMode });
      // In the same update as the session, so Tutor mode never shows without the dialog.
      if (showIntro && ACTIVE_STATUSES.includes(started.status)) setIntroOpen(true);
      return started;
    });
    if (!next || !ACTIVE_STATUSES.includes(next.status)) return;
    setVoiceNotice(unavailable ?? null);
    setTab("chat");
    if (!showIntro) beginSession(next);
  }

  // The tutor's first message, and voice on. After the intro dialog, Got it is the click that
  // lets the browser speak; the microphone was already asked for on Start with voice.
  function beginSession(started: TutorSession) {
    setVoiceArmed(started.mode === "voice");
    setJustStarted(true);
    queueEvent({ type: "session_started" }, undefined, openingLine(started));
  }

  function closeIntro() {
    if (!introOpen) return;
    setIntroOpen(false);
    void markIntroSeen();
    const current = sessionRef.current;
    if (current && ACTIVE_STATUSES.includes(current.status)) beginSession(current);
  }

  // The answer streams into the thread as a reply (no user message); the server records the
  // decline first and tells us through a tutor_session event.
  function decline() {
    chat.send("", { silent: true, sendMessage: declineAndAnswer });
  }

  async function submit(input: AnswerInput) {
    const before = sessionRef.current?.current;
    const next = await run("answer", () => postTutor(conversationId, "answer", input));
    if (!next || !before) return;
    if (!before.practice) {
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

  async function switchMode(mode: TutorMode) {
    if (mode === "voice") {
      const unavailable = await checkVoice();
      if (unavailable) {
        setVoiceNotice(unavailable);
        return;
      }
      setVoiceArmed(true);
    }
    setVoiceNotice(null);
    await run("mode", () => postTutor(conversationId, "mode", { mode }));
  }

  // Speech recognition failed part-way (e.g. the microphone was blocked): carry on in text.
  function fallbackToText(reason: VoiceUnavailable) {
    setVoiceNotice(reason);
    void run("mode", () => postTutor(conversationId, "mode", { mode: "text" }));
  }

  function submitSummary(text: string) {
    void run("summary", () => postTutor(conversationId, "summary", { text })).then((next) => {
      if (next?.wrapUp.tutorSummary) setAnnouncement(tutorContent.announcements.summaryReady);
    });
  }

  function retrySummary() {
    void run("summary", () => postTutor(conversationId, "summary"));
  }

  function setConsent(consented: boolean) {
    void run("consent", () => postTutor(conversationId, "consent", { consented }));
  }

  function morePractice() {
    void run("practice", () => postTutor(conversationId, "practice"));
  }

  // Exit from anywhere, with no confirmation. A reply in progress stops, and voice goes quiet
  // as the session leaves voice mode.
  function exit() {
    queueRef.current = [];
    if (chat.isStreaming) chat.stop();
    const replyId = lastReplyIdRef.current;
    void run("exit", () => postTutor(conversationId, "exit")).then((next) => {
      if (next && !ACTIVE_STATUSES.includes(next.status)) setLiveExitReplyId(replyId);
    });
  }

  async function resume() {
    const next = await run("resume", () => postTutor(conversationId, "resume"));
    if (!next || !ACTIVE_STATUSES.includes(next.status)) return;
    setLiveExitReplyId(undefined);
    setVoiceArmed(next.mode === "voice");
    setJustStarted(true);
    setTab("chat");
    queueEvent({ type: "session_resumed" });
  }

  // A freeform check may still be grading when the wrap-up shows its scores: check again.
  const scoresPending = session?.status === "wrap_up" && session.wrapUp.scores?.pending;
  useEffect(() => {
    if (!scoresPending) return;
    const timer = setInterval(() => {
      fetchTutorSession(conversationId)
        .then((loaded) => loaded && setSession(loaded))
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [scoresPending, conversationId]);

  // The tutor's summary is written after the learner's. If the page was reloaded part-way,
  // ask again (the server shares a summary that's still being written).
  const summaryPending =
    session?.status === "wrap_up" && session.wrapUp.learnerSummary && !session.wrapUp.tutorSummary && !session.wrapUp.summaryFailed;
  useEffect(() => {
    if (!summaryPending || !session || busy === "summary") return;
    if (summaryRequestedRef.current === session.id) return;
    summaryRequestedRef.current = session.id;
    retrySummary();
    // retrySummary only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryPending, session?.id, busy]);

  // Stream events from the clone's chat route (the offer) and Tutor's chat route.
  function onEvent(event: FeatureEvent, replyId: string) {
    if (event.type === "tutor_offer") {
      setLiveOfferReplyId(replyId);
      void fetchTutorSession(conversationId).then(setSession).catch(() => {});
    } else if (event.type === "tutor_session" && event.session) {
      if ((event.session as TutorSession).status === "declined") {
        setLiveDeclineReplyId(replyId);
        setSession(event.session as TutorSession);
        return;
      }
      lastReplyIdRef.current = replyId;
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
    focus,
    // The learner clicked or moved into a surface: it takes focus (nothing else moves).
    focusByLearner: (surface: TutorTab) => setFocus(surface),
    // Whether the tutor's voice is still speaking a reply (voice mode only).
    setSpeaking: (value: boolean) => {
      if (speakingRef.current === value) return;
      speakingRef.current = value;
      talkingRef.current = chatRef.current.isStreaming || value;
      setSpeaking(value);
    },
    holding: heldKey !== null && heldKey === workbookKey(session),
    revealing,
    liveOfferReplyId,
    busy,
    failed,
    announcement,
    tab,
    setTab,
    unseen,
    scopingAsked,
    justStarted,
    introOpen,
    closeIntro,
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
    resume,
    liveExitReplyId,
    liveDeclineReplyId,
    voiceNotice,
    dismissVoiceNotice: () => setVoiceNotice(null),
    voiceArmed,
    switchMode,
    fallbackToText,
    submitSummary,
    retrySummary,
    setConsent,
    morePractice,
    retryBuild,
    onEvent,
  };
}

export type TutorState = ReturnType<typeof useTutorSession>;
