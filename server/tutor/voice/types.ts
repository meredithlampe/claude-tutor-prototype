// The provider interface, apart from index.ts so providers can import it without a cycle.

export interface VoiceProvider {
  id: string;
  // Audio for one sentence, streamed as it's generated. Throws VoiceProviderError when the
  // provider isn't set up or the vendor refuses.
  synthesize(text: string, signal: AbortSignal): Promise<{ contentType: string; body: ReadableStream<Uint8Array> }>;
}

export class VoiceProviderError extends Error {
  // The HTTP status to answer the client with.
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
