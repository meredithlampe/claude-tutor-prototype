import Anthropic from "@anthropic-ai/sdk";

export type ReplyResult =
  // `toolUses` is empty unless `tools` were passed and Claude called one.
  | { type: "done"; text: string; toolUses: Anthropic.ToolUseBlock[] }
  | { type: "refusal" }
  // `text` is whatever streamed before the client disconnected.
  | { type: "aborted"; text: string }
  | { type: "error" };

interface StreamReplyOptions {
  messages: Anthropic.MessageParam[];
  system?: Anthropic.MessageCreateParams["system"];
  tools?: Anthropic.MessageCreateParams["tools"];
  signal: AbortSignal;
  onText: (text: string) => void;
}

let client: Anthropic | undefined;

// Created lazily so the server can boot (and serve mock data) without an API key.
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export async function streamReply({
  messages,
  system,
  tools,
  signal,
  onText,
}: StreamReplyOptions): Promise<ReplyResult> {
  let streamedText = "";
  try {
    const stream = getClient().messages.stream(
      {
        model: "claude-opus-5-5",
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        // Only sent when given, so a plain chat turn's request is unchanged.
        ...(system ? { system } : {}),
        ...(tools?.length ? { tools } : {}),
        messages,
      },
      { signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        streamedText += event.delta.text;
        onText(event.delta.text);
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") {
      return { type: "refusal" };
    }

    const text = final.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    // A tool call ends the turn (stop_reason "tool_use"). No tool result is sent back, so
    // the turn is treated as finished: the text is the reply, and the caller handles the calls.
    const toolUses = final.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    return { type: "done", text, toolUses };
  } catch (error) {
    if (error instanceof Anthropic.APIUserAbortError) {
      return { type: "aborted", text: streamedText };
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Claude API: authentication failed. Check ANTHROPIC_API_KEY.");
    } else if (error instanceof Anthropic.PermissionDeniedError) {
      console.error(`Claude API: permission denied (403): ${error.message}`);
    } else if (error instanceof Anthropic.BadRequestError) {
      console.error(`Claude API: bad request (400): ${error.message}`);
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error("Claude API: rate limited (429).");
    } else if (error instanceof Anthropic.InternalServerError) {
      console.error(`Claude API: server error (${error.status}).`);
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.error(`Claude API: connection error: ${error.message}`);
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Claude API: error (${error.status}): ${error.message}`);
    } else {
      console.error("Claude API: unexpected error", error);
    }
    return { type: "error" };
  }
}
