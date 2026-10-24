// Reads a server-sent events body (from a fetch POST, which EventSource can't make) and
// yields the `data` payload of each event. Only the `data:` field is used by our server.
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice("data:".length).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
        boundary = buffer.indexOf("\n\n");
      }
    }
  } finally {
    // Stops the download if the caller stops reading early; harmless once the body has ended.
    await reader.cancel().catch(() => {});
  }
}
