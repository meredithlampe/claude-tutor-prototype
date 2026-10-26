import { VoiceProviderError, type VoiceProvider } from "./types";

// ElevenLabs streaming text-to-speech:
// POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream, authenticated with the
// xi-api-key header. Flash v2.5 is ElevenLabs' lowest-latency model.
// Env: ELEVENLABS_API_KEY (required), ELEVENLABS_VOICE_ID (optional).
const API_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const MODEL_ID = "eleven_flash_v2_5";
const OUTPUT_FORMAT = "mp3_44100_64";
// "George", the voice in ElevenLabs' API examples.
const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export const elevenLabs: VoiceProvider = {
  id: "elevenlabs",
  async synthesize(text, signal) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new VoiceProviderError("ELEVENLABS_API_KEY isn't set", 503);
    const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const url = `${API_URL}/${encodeURIComponent(voiceId)}/stream?output_format=${OUTPUT_FORMAT}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
      signal,
    });
    if (!response.ok || !response.body) {
      // The status only: the body can echo request details.
      throw new VoiceProviderError(`ElevenLabs responded ${response.status}`, 502);
    }
    return { contentType: response.headers.get("content-type") ?? "audio/mpeg", body: response.body };
  },
};
