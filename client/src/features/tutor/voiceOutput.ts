import { fetchSpeech } from "./api";

// How the tutor's sentences are played. The browser output is speechSynthesis; the server
// output plays audio from the server's voice provider (see server/tutor/voice/). Both play
// sentences in the order they're given.
export interface VoiceOutput {
  // Resolves when the sentence has been played (or skipped). Rejects with VoiceOutputFailed
  // when this output can't play it, so the caller can use another.
  say(text: string): Promise<void>;
  // Stops what's playing now and drops everything queued, at once.
  cancel(): void;
}

export class VoiceOutputFailed extends Error {}

export function speechLang(): string {
  return document.documentElement.lang || navigator.language || "en-US";
}

export function createBrowserOutput(): VoiceOutput {
  // Chrome can drop an utterance's end event if nothing holds on to it.
  const utterances = new Set<SpeechSynthesisUtterance>();
  return {
    say(text) {
      return new Promise((resolve) => {
        if (!("speechSynthesis" in window)) return resolve();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = speechLang();
        const done = () => {
          utterances.delete(utterance);
          resolve();
        };
        utterance.onend = done;
        utterance.onerror = done;
        utterances.add(utterance);
        window.speechSynthesis.speak(utterance);
      });
    },
    cancel() {
      utterances.clear();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
  };
}

type Queued = {
  text: string;
  controller: AbortController;
  audio?: Promise<Blob>;
  resolve: () => void;
  reject: (error: Error) => void;
};

// Fetches a sentence's audio when it reaches the front of the queue or is next after it, so
// the next sentence is ready by the time the current one ends.
const PREFETCH = 2;

export function createServerOutput(): VoiceOutput {
  let queue: Queued[] = [];
  let playing: { item: Queued; element: HTMLAudioElement; url: string } | null = null;

  function prefetch() {
    for (const item of queue.slice(0, PREFETCH)) {
      item.audio ??= fetchSpeech(item.text, item.controller.signal);
      // Handled where it's awaited; this only stops an unhandled rejection after a cancel.
      item.audio.catch(() => {});
    }
  }

  // Can't play: stop any audio, and hand this sentence and everything after it back, in
  // order, to the caller.
  function fail() {
    if (playing) {
      playing.element.onended = null;
      playing.element.onerror = null;
      playing.element.pause();
      URL.revokeObjectURL(playing.url);
      playing = null;
    }
    const failed = queue;
    queue = [];
    for (const item of failed) {
      item.controller.abort();
      item.reject(new VoiceOutputFailed());
    }
  }

  async function playNext() {
    if (playing || queue.length === 0) return;
    const item = queue[0];
    prefetch();
    let blob: Blob;
    try {
      blob = await item.audio!;
    } catch {
      if (queue[0] === item) fail();
      return;
    }
    if (queue[0] !== item || playing) return;
    const url = URL.createObjectURL(blob);
    const element = new Audio(url);
    playing = { item, element, url };
    const finish = (ok: boolean) => {
      if (playing?.item !== item) return;
      URL.revokeObjectURL(url);
      playing = null;
      if (!ok) return fail();
      queue.shift();
      item.resolve();
      void playNext();
    };
    element.onended = () => finish(true);
    element.onerror = () => finish(false);
    // Blocked autoplay or an unplayable file: fall back too.
    element.play().catch(() => finish(false));
  }

  return {
    say(text) {
      return new Promise((resolve, reject) => {
        queue.push({ text, controller: new AbortController(), resolve, reject });
        prefetch();
        void playNext();
      });
    },
    cancel() {
      if (playing) {
        playing.element.onended = null;
        playing.element.onerror = null;
        playing.element.pause();
        URL.revokeObjectURL(playing.url);
        playing = null;
      }
      const dropped = queue;
      queue = [];
      for (const item of dropped) {
        item.controller.abort();
        item.resolve();
      }
    },
  };
}
