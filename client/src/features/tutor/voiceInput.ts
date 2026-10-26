import { speechLang } from "./voiceOutput";

// How the learner's speech is heard. Only the browser's SpeechRecognition for now; another
// vendor would be another function returning a ListenSession.

// When the learner's turn ends. Chrome's own end-of-speech cuts people off mid-thought, so
// recognition runs continuously and these decide the turn: after END_OF_SPEECH_MS of silence
// following speech, a visible countdown of COUNTDOWN_MS starts, and what was heard is sent when
// it reaches 0 (about 4 s after the learner stops). Speaking again cancels the countdown.
export const END_OF_SPEECH_MS = 1000;
export const COUNTDOWN_MS = 3000;
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
  // The learner has paused: the countdown to sending started (its length in ms), or was
  // cancelled because they spoke again (null).
  onCountdown: (ms: number | null) => void;
  // The learner has stopped talking (or chose Send now): their whole turn.
  onTranscript: (text: string) => void;
  onFail: (reason: ListenFailure) => void;
}

export interface ListenSession {
  // Stops listening without sending anything.
  stop(): void;
  // Sends what's been heard right away, ending the turn.
  sendNow(): void;
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
  let countdownTimer: ReturnType<typeof setTimeout> | undefined;
  // What was heard when the latest pause began, so a repeat of the same words (Chrome
  // finalizing what it already heard) doesn't count as speaking again.
  let lastWords = "";
  let recognition: Recognition | null = null;

  function heard() {
    return join(earlier, final, interim);
  }

  function words(text: string) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function cancelCountdown() {
    clearTimeout(silenceTimer);
    silenceTimer = undefined;
    if (countdownTimer === undefined) return;
    clearTimeout(countdownTimer);
    countdownTimer = undefined;
    handlers.onCountdown(null);
  }

  function startCountdown() {
    silenceTimer = undefined;
    countdownTimer = setTimeout(submit, COUNTDOWN_MS);
    handlers.onCountdown(COUNTDOWN_MS);
  }

  function finish(reason?: ListenFailure) {
    stopped = true;
    clearTimeout(silenceTimer);
    clearTimeout(countdownTimer);
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
      // New words cancel the countdown and restart the wait for a pause; the turn ends after a
      // pause and the countdown, with something said.
      if (words(text) === lastWords) return;
      lastWords = words(text);
      cancelCountdown();
      if (text) silenceTimer = setTimeout(startCountdown, END_OF_SPEECH_MS);
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
  return {
    stop: () => finish(),
    sendNow: () => {
      if (!stopped) submit();
    },
  };
}
