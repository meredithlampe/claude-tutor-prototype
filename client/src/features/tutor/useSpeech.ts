import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FeatureEvent, StreamEvent } from "@/types";
import { fetchVoiceProvider } from "./api";
import { listenWithBrowser, recognitionConstructor, type ListenSession } from "./voiceInput";
import { createBrowserOutput, createServerOutput, VoiceOutputFailed, type VoiceOutput } from "./voiceOutput";

// Voice mode: the tutor's chat replies are read aloud sentence by sentence, through the
// browser's speechSynthesis or the server's voice provider (see voiceOutput.ts), and the
// learner's reply is heard with the browser's SpeechRecognition (see voiceInput.ts) once the
// tutor has finished. The workbook is never read aloud, and workbook answers are never taken
// by voice.

export type VoiceUnavailable = "unsupported" | "denied" | "noMicrophone";

// Whether voice can run in this browser, asking for the microphone. Call it from a click, so
// the permission prompt belongs to the learner's choice of voice.
export async function checkVoice(): Promise<VoiceUnavailable | undefined> {
  if (!recognitionConstructor() || !("speechSynthesis" in window) || !navigator.mediaDevices?.getUserMedia) {
    return "unsupported";
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return undefined;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    return name === "NotFoundError" || name === "OverconstrainedError" ? "noMicrophone" : "denied";
  }
}

// Markdown to plain sentences, so symbols aren't read out. The tutor is asked to write for
// speech in voice mode; this catches what slips through.
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|~~)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

// The end of the last complete sentence or line in streamed text, or -1.
function lastBreak(text: string): number {
  let end = -1;
  for (const match of text.matchAll(/[.!?…](?=\s)|\n/g)) end = match.index + match[0].length;
  return end;
}

export interface Speaker {
  // Text as it streams. Whole sentences are spoken as soon as they arrive.
  push: (text: string) => void;
  // The reply is complete: speak whatever is left.
  finish: () => void;
  cancel: () => void;
}

// Passes a reply's stream events through, speaking its text. A reply that ends any other way
// than "done" (Stop, an error, leaving the page) stops the speech.
export async function* speakStream(
  events: AsyncIterable<StreamEvent | FeatureEvent>,
  speaker: Speaker,
): AsyncGenerator<StreamEvent | FeatureEvent> {
  let finished = false;
  try {
    for await (const event of events) {
      if (event.type === "text" && typeof event.text === "string") speaker.push(event.text);
      if (event.type === "done") {
        speaker.finish();
        finished = true;
      }
      yield event;
    }
  } finally {
    if (!finished) speaker.cancel();
  }
}

export type VoiceStatus =
  | "off"
  | "needsActivation"
  | "speaking"
  | "waiting"
  | "listening"
  | "muted"
  | "stalled"
  | "ready";

type UseSpeechOptions = {
  // Tutor mode is on screen in voice mode.
  enabled: boolean;
  // Voice was turned on by a click in this page (start, switch or resume). After a reload the
  // browser won't speak until the learner clicks, so voice waits for activate().
  armed: boolean;
  // A reply is streaming, so it isn't the learner's turn.
  replyStreaming: boolean;
  // What the learner said, once they have paused and the countdown has run (see voiceInput.ts),
  // or they chose Send now.
  onTranscript: (text: string) => void;
  onUnavailable: (reason: VoiceUnavailable) => void;
  // Called as soon as the tutor starts or stops speaking, in the same update as the reply's
  // stream ending, so the session never sees a moment where the tutor seems to be done.
  onSpeakingChange?: (speaking: boolean) => void;
};

// A short pause before listening, so a turn that's about to continue (a queued reply, the
// next sentence) doesn't flash the browser's microphone indicator on and off.
const LISTEN_DELAY_MS = 300;

export function useSpeech({ enabled, armed, replyStreaming, onTranscript, onUnavailable, onSpeakingChange }: UseSpeechOptions) {
  const [speaking, setSpeakingState] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  // The countdown to sending what was heard, while it runs: when it started and its length.
  const [countdown, setCountdown] = useState<{ startedAt: number; ms: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [activated, setActivated] = useState(false);
  const live = enabled && (armed || activated);

  const liveRef = useRef(live);
  const callbacksRef = useRef({ onTranscript, onUnavailable, onSpeakingChange });
  useLayoutEffect(() => {
    liveRef.current = live;
    callbacksRef.current = { onTranscript, onUnavailable, onSpeakingChange };
  });

  const bufferRef = useRef("");
  const pendingRef = useRef(0);
  // Bumped on cancel, so sentences that finish after it are ignored.
  const generationRef = useRef(0);
  const listenRef = useRef<ListenSession | null>(null);
  // Exactly one voice speaks: the server's when it has one, otherwise the browser's. Until the
  // server has said which, sentences wait (in order) rather than start in the browser's voice.
  // A failed server sentence switches to the browser for the rest of the page.
  const outputsRef = useRef<{ browser: VoiceOutput; server: VoiceOutput } | null>(null);
  const voiceRef = useRef<"unknown" | "browser" | "server">("unknown");
  const waitingRef = useRef<string[]>([]);

  const controls = useMemo(() => {
    function setSpeaking(value: boolean) {
      setSpeakingState(value);
      callbacksRef.current.onSpeakingChange?.(value);
    }

    function outputs() {
      outputsRef.current ??= { browser: createBrowserOutput(), server: createServerOutput() };
      return outputsRef.current;
    }

    function speakNow(text: string) {
      const spoken = speakableText(text);
      if (!spoken) return;
      pendingRef.current += 1;
      setSpeaking(true);
      if (voiceRef.current === "unknown") waitingRef.current.push(spoken);
      else play(spoken);
    }

    // Once the provider is known, the waiting sentences go out in order.
    function voiceKnown(provider: string) {
      if (voiceRef.current !== "unknown") return;
      voiceRef.current = provider === "browser" ? "browser" : "server";
      const waiting = waitingRef.current;
      waitingRef.current = [];
      waiting.forEach(play);
    }

    function play(spoken: string) {
      const generation = generationRef.current;
      const done = () => {
        if (generation !== generationRef.current) return;
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) setSpeaking(false);
      };
      const { browser, server } = outputs();
      if (voiceRef.current !== "server") {
        void browser.say(spoken).then(done);
        return;
      }
      // A failure rejects this sentence and every one queued after it, in order, with no
      // server audio left playing; each then goes to the browser's voice. Nothing is repeated:
      // a failed sentence wasn't heard.
      server.say(spoken).then(done, (error: unknown) => {
        if (generation !== generationRef.current) return;
        if (error instanceof VoiceOutputFailed) voiceRef.current = "browser";
        void browser.say(spoken).then(done);
      });
    }

    function cancelSpeech() {
      generationRef.current += 1;
      bufferRef.current = "";
      pendingRef.current = 0;
      waitingRef.current = [];
      outputsRef.current?.browser.cancel();
      outputsRef.current?.server.cancel();
      // speechSynthesis can hold speech from before a hot reload or another instance.
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeaking(false);
    }

    // Stops listening without sending what was heard.
    function stopListening() {
      const session = listenRef.current;
      listenRef.current = null;
      session?.stop();
      setListening(false);
      setInterim("");
      setCountdown(null);
    }

    // Send now: what's been heard goes at once, without waiting for the countdown.
    function sendNow() {
      listenRef.current?.sendNow();
    }

    function unavailable(reason: VoiceUnavailable) {
      stopListening();
      cancelSpeech();
      callbacksRef.current.onUnavailable(reason);
    }

    function startListening() {
      // Callbacks only count while this session is the current one.
      const handle: { session?: ListenSession } = {};
      const own = () => listenRef.current !== null && listenRef.current === handle.session;
      handle.session = listenWithBrowser({
        onStart: () => {
          if (own()) setListening(true);
        },
        onHeard: (text) => {
          if (own()) setInterim(text);
        },
        onCountdown: (ms) => {
          if (own()) setCountdown(ms === null ? null : { startedAt: Date.now(), ms });
        },
        onTranscript: (text) => {
          if (!own()) return;
          listenRef.current = null;
          setListening(false);
          setInterim("");
          setCountdown(null);
          callbacksRef.current.onTranscript(text);
        },
        onFail: (reason) => {
          if (listenRef.current !== null && listenRef.current !== handle.session) return;
          listenRef.current = null;
          setListening(false);
          setInterim("");
          setCountdown(null);
          if (reason === "stalled") {
            setStalled(true);
            setMuted(true);
          } else {
            unavailable(reason);
          }
        },
      });
      listenRef.current = handle.session ?? null;
    }

    const speaker: Speaker = {
      push(text) {
        if (!liveRef.current) return;
        bufferRef.current += text;
        const end = lastBreak(bufferRef.current);
        if (end > 0) {
          speakNow(bufferRef.current.slice(0, end));
          bufferRef.current = bufferRef.current.slice(end);
        }
      },
      finish() {
        if (liveRef.current && bufferRef.current) speakNow(bufferRef.current);
        bufferRef.current = "";
      },
      cancel: cancelSpeech,
    };

    return { speaker, cancelSpeech, startListening, stopListening, sendNow, voiceKnown };
  }, []);

  // Asked on mount, before voice is on, so the first sentence rarely has to wait.
  useEffect(() => {
    void fetchVoiceProvider().then(controls.voiceKnown);
  }, [controls]);

  // It's the learner's turn: the tutor has finished speaking and nothing is streaming.
  const shouldListen = live && !muted && !speaking && !replyStreaming;
  useEffect(() => {
    if (!shouldListen) {
      controls.stopListening();
      return;
    }
    if (listening || listenRef.current) return;
    const timer = setTimeout(controls.startListening, LISTEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [shouldListen, listening, controls]);

  // Voice off (Exit, switching to text, a fallback) or leaving the page: go quiet.
  useEffect(() => {
    if (live) return;
    controls.cancelSpeech();
    controls.stopListening();
  }, [live, controls]);
  useEffect(() => {
    const stop = () => {
      controls.cancelSpeech();
      controls.stopListening();
    };
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      // Leaving the chat: a reply can keep streaming after this unmounts, so its text must not
      // be spoken. (The layout effect above sets this again if the hook mounts again.)
      liveRef.current = false;
      stop();
    };
  }, [controls]);

  let status: VoiceStatus;
  if (!enabled) status = "off";
  else if (!live) status = "needsActivation";
  else if (speaking) status = "speaking";
  else if (replyStreaming) status = "waiting";
  else if (muted) status = stalled ? "stalled" : "muted";
  else if (listening) status = "listening";
  else status = "ready";

  return {
    status,
    interim,
    // Only while listening: muting, stopping or the tutor replying ends it.
    countdown: status === "listening" ? countdown : null,
    sendNow: controls.sendNow,
    muted,
    speaker: controls.speaker,
    toggleMute() {
      setStalled(false);
      setMuted((current) => !current);
    },
    stopSpeaking: controls.cancelSpeech,
    activate: () => setActivated(true),
  };
}

export type SpeechState = ReturnType<typeof useSpeech>;
