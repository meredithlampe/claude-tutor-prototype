import { elevenLabs } from "./elevenlabs";
import type { VoiceProvider } from "./types";

export { VoiceProviderError, type VoiceProvider } from "./types";

// The tutor's voice. "browser" means the client speaks with the browser's own speechSynthesis
// and the server does nothing. A server provider turns a sentence into audio the client plays.
// To add a vendor, write a provider like elevenlabs.ts and list it below. To remove one, delete
// its file and its line here (or set TUTOR_VOICE_PROVIDER=browser).

const providers: Record<string, VoiceProvider> = {
  [elevenLabs.id]: elevenLabs,
};

// Read on each request, so the provider can change with the env file and a restart only.
export function voiceProvider(): VoiceProvider | undefined {
  const id = process.env.TUTOR_VOICE_PROVIDER ?? "browser";
  return providers[id];
}

// What the client is told: which voice to use. Nothing about keys.
export function voiceProviderId(): string {
  return voiceProvider()?.id ?? "browser";
}
