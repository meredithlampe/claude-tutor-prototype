import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FeatureEvent, StreamEvent } from "@/types";

// Voice mode with the browser's Web Speech API only: speechSynthesis reads the tutor's chat
// replies aloud, and SpeechRecognition listens for the learner's reply once it has finished.
// The workbook is never read aloud, and workbook answers are never taken by voice.

// SpeechRecognition isn't in TypeScript's DOM types yet (only its events are). Chrome and
// Safari ship it as webkitSpeechRecognition.
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function speechLang(): string {
  return document.documentElement.lang || navigator.language || "en-US";
}

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
  // What the learner said, once recognition has a final result.
  onTranscript: (text: string) => void;
  onUnavailable: (reason: VoiceUnavailable) => void;
};

// A short pause before listening, so a turn that's about to continue (a queued reply, the
// next sentence) doesn't flash the browser's microphone indicator on and off.
const LISTEN_DELAY_MS = 300;
// Recognition that ends this soon after starting, several times running, isn't working (no
// audio, or the recognition service is unreachable).
const QUICK_END_MS = 1500;
const QUICK_ENDS_BEFORE_STALL = 3;

export function useSpeech({ enabled, armed, replyStreaming, onTranscript, onUnavailable }: UseSpeechOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [activated, setActivated] = useState(false);
  const live = enabled && (armed || activated);

  const liveRef = useRef(live);
  const callbacksRef = useRef({ onTranscript, onUnavailable });
  useLayoutEffect(() => {
    liveRef.current = live;
    callbacksRef.current = { onTranscript, onUnavailable };
  });

  const bufferRef = useRef("");
  const pendingRef = useRef(0);
  // Chrome can drop an utterance's end event if nothing holds on to it.
  const utterancesRef = useRef(new Set<SpeechSynthesisUtterance>());
  // Bumped on cancel, so end events from cancelled utterances are ignored.
  const generationRef = useRef(0);
  const recognitionRef = useRef<Recognition | null>(null);
  const quickEndsRef = useRef(0);

  const controls = useMemo(() => {
    function speakNow(text: string) {
      const spoken = speakableText(text);
      if (!spoken || !("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(spoken);
      utterance.lang = speechLang();
      const generation = generationRef.current;
      const done = () => {
        utterancesRef.current.delete(utterance);
        if (generation !== generationRef.current) return;
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current === 0) setSpeaking(false);
      };
      utterance.onend = done;
      utterance.onerror = done;
      utterancesRef.current.add(utterance);
      pendingRef.current += 1;
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    }

    function cancelSpeech() {
      generationRef.current += 1;
      bufferRef.current = "";
      pendingRef.current = 0;
      utterancesRef.current.clear();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeaking(false);
    }

    // Stops listening without sending what was heard.
    function stopListening() {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (!recognition) return;
      recognition.onstart = null;
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.abort();
      setListening(false);
      setInterim("");
    }

    function unavailable(reason: VoiceUnavailable) {
      stopListening();
      cancelSpeech();
      callbacksRef.current.onUnavailable(reason);
    }

    function startListening() {
      const Recognition = recognitionConstructor();
      if (!Recognition) {
        unavailable("unsupported");
        return;
      }
      const recognition = new Recognition();
      recognition.lang = speechLang();
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      const startedAt = Date.now();
      let finalText = "";

      // A start event can arrive after this recognition was stopped; only the current one counts.
      recognition.onstart = () => {
        if (recognitionRef.current === recognition) setListening(true);
      };
      recognition.onresult = (event) => {
        let interimText = "";
        finalText = "";
        for (let index = 0; index < event.results.length; index++) {
          const result = event.results[index];
          if (result.isFinal) finalText += result[0].transcript;
          else interimText += result[0].transcript;
        }
        setInterim(`${finalText}${interimText}`.trim());
      };
      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") unavailable("denied");
        else if (event.error === "audio-capture") unavailable("noMicrophone");
      };
      // Ending with nothing heard is normal (Chrome stops after a few seconds of silence); the
      // listening effect starts again while it's still the learner's turn.
      recognition.onend = () => {
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        setListening(false);
        setInterim("");
        const text = finalText.trim();
        if (text) {
          quickEndsRef.current = 0;
          callbacksRef.current.onTranscript(text);
          return;
        }
        quickEndsRef.current = Date.now() - startedAt < QUICK_END_MS ? quickEndsRef.current + 1 : 0;
        if (quickEndsRef.current >= QUICK_ENDS_BEFORE_STALL) {
          quickEndsRef.current = 0;
          setStalled(true);
          setMuted(true);
        }
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
      }
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

    return { speaker, cancelSpeech, startListening, stopListening };
  }, []);

  // It's the learner's turn: the tutor has finished speaking and nothing is streaming.
  const shouldListen = live && !muted && !speaking && !replyStreaming;
  useEffect(() => {
    if (!shouldListen) {
      controls.stopListening();
      return;
    }
    if (listening || recognitionRef.current) return;
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
