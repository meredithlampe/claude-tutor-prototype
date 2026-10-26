import { speechLang } from "./voiceOutput";

// How the learner's speech is heard. Only the browser's SpeechRecognition for now; another
// vendor would be another function returning a ListenSession.

// How long the learner can pause before what they said is sent. Chrome's own end-of-speech
// cuts people off mid-thought, so recognition runs continuously and this decides the turn.
export const SILENCE_BEFORE_SUBMIT_MS = 2500;
// Recognition that ends this soon after starting, with nothing heard, several times running,
// isn't working (no audio, or the recognition service is unreachable).
const QUICK_END_MS = 1500;
const QUICK_ENDS_BEFORE_STALL = 3;

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

export function recognitionConstructor(): RecognitionConstructor | undefined {
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export type ListenFailure = "unsupported" | "denied" | "noMicrophone" | "stalled";

export interface ListenHandlers {
  onStart: () => void;
  // Everything heard so far this turn, including words not yet final.
  onHeard: (text: string) => void;
  // The learner has stopped talking: their whole turn.
  onTranscript: (text: string) => void;
  onFail: (reason: ListenFailure) => void;
}

export interface ListenSession {
  // Stops listening without sending anything.
  stop(): void;
}

function join(...parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join(" ");
}

// Listens for one turn. Chrome ends recognition on its own now and then (after silence, or
// about a minute in); while the turn lasts, a new recognizer takes over and keeps what was
// already heard.
export function listenWithBrowser(handlers: ListenHandlers): ListenSession | undefined {
  const Recognition = recognitionConstructor();
  if (!Recognition) {
    handlers.onFail("unsupported");
    return undefined;
  }
  let stopped = false;
  let started = false;
  // Text from recognizers that have ended, then the current one's final and interim text.
  let earlier = "";
  let final = "";
  let interim = "";
  let quickEnds = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let recognition: Recognition | null = null;

  function heard() {
    return join(earlier, final, interim);
  }

  function finish(reason?: ListenFailure) {
    stopped = true;
    clearTimeout(silenceTimer);
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognition = null;
    }
    if (reason) handlers.onFail(reason);
  }

  function submit() {
    const text = heard();
    finish();
    if (text) handlers.onTranscript(text);
  }

  function begin() {
    const current = new Recognition!();
    recognition = current;
    current.lang = speechLang();
    current.interimResults = true;
    current.continuous = true;
    current.maxAlternatives = 1;
    const startedAt = Date.now();
    final = "";
    interim = "";

    current.onstart = () => {
      if (started || stopped) return;
      started = true;
      handlers.onStart();
    };
    current.onresult = (event) => {
      final = "";
      interim = "";
      for (let index = 0; index < event.results.length; index++) {
        const result = event.results[index];
        if (result.isFinal) final = join(final, result[0].transcript);
        else interim = join(interim, result[0].transcript);
      }
      const text = heard();
      handlers.onHeard(text);
      // Each result restarts the countdown; the turn ends after a pause with something said.
      clearTimeout(silenceTimer);
      if (text) silenceTimer = setTimeout(submit, SILENCE_BEFORE_SUBMIT_MS);
    };
    current.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") finish("denied");
      else if (event.error === "audio-capture") finish("noMicrophone");
      // Others ("no-speech", "network", "aborted") are followed by end, handled there.
    };
    current.onend = () => {
      if (stopped || recognition !== current) return;
      // Keep what this recognizer heard, final or not; nothing more will arrive for it.
      earlier = join(earlier, final, interim);
      final = "";
      interim = "";
      const nothingHeard = !earlier;
      quickEnds = nothingHeard && Date.now() - startedAt < QUICK_END_MS ? quickEnds + 1 : 0;
      if (quickEnds >= QUICK_ENDS_BEFORE_STALL) {
        finish("stalled");
        return;
      }
      try {
        begin();
      } catch {
        finish("stalled");
      }
    };
    current.start();
  }

  try {
    begin();
  } catch {
    finish("stalled");
    return undefined;
  }
  return { stop: () => finish() };
}
