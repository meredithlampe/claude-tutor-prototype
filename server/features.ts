import type Anthropic from "@anthropic-ai/sdk";
import type { Router } from "express";
import { tutorFeature } from "./tutor/hooks";
import type { Conversation, StoredMessage } from "./types";

// An SSE event a feature sends alongside the clone's own (text, done, refusal, error).
// Its `type` must not reuse one of those.
export type FeatureEvent = { type: string } & Record<string, unknown>;

// A normal chat turn, after the user's message has been stored.
export interface ChatTurn {
  conversation: Conversation;
  message: string;
}

export interface FeatureCallOptions {
  system?: string;
  tools?: Anthropic.Tool[];
}

export interface ChatFeature {
  id: string;
  // Mounted at /api/<id>.
  router?: Router;
  // Adds instructions and tools to a normal chat turn. Return undefined to add nothing.
  callOptions?: (turn: ChatTurn) => Promise<FeatureCallOptions | undefined>;
  // Called once per finished turn, after the reply is stored, whether or not Claude called
  // one of this feature's tools. Events emitted here reach the client before "done".
  onReplyDone?: (reply: FeatureReply, turn: ChatTurn, emit: (event: FeatureEvent) => void) => Promise<void>;
}

export interface FeatureReply {
  // The stored assistant message. Undefined when Claude wrote no text.
  message?: StoredMessage;
  // Calls to tools this feature added. Empty when there were none.
  toolUses: Anthropic.ToolUseBlock[];
}

// TUTOR_ENABLED=false turns Tutor off without a code change. Its registration line checks this.
export const tutorEnabled = process.env.TUTOR_ENABLED !== "false";

// The enabled features. Removing a feature's line here turns it off.
export const features: ChatFeature[] = [...(tutorEnabled ? [tutorFeature] : [])];

export interface TurnOptions {
  system?: string;
  tools?: Anthropic.Tool[];
  // Which feature added each tool, by tool name.
  toolOwners: Map<string, ChatFeature>;
}

// A failing feature is logged and skipped so it can't break normal chat.
export async function collectCallOptions(turn: ChatTurn): Promise<TurnOptions> {
  const system: string[] = [];
  const tools: Anthropic.Tool[] = [];
  const toolOwners = new Map<string, ChatFeature>();

  for (const feature of features) {
    if (!feature.callOptions) continue;
    try {
      const options = await feature.callOptions(turn);
      if (options?.system) system.push(options.system);
      for (const tool of options?.tools ?? []) {
        tools.push(tool);
        toolOwners.set(tool.name, feature);
      }
    } catch (error) {
      console.error(`Feature "${feature.id}": callOptions failed`, error);
    }
  }

  return {
    system: system.length ? system.join("\n\n") : undefined,
    tools: tools.length ? tools : undefined,
    toolOwners,
  };
}

export async function notifyReplyDone(
  message: StoredMessage | undefined,
  toolUses: Anthropic.ToolUseBlock[],
  toolOwners: Map<string, ChatFeature>,
  turn: ChatTurn,
  emit: (event: FeatureEvent) => void,
): Promise<void> {
  for (const feature of features) {
    if (!feature.onReplyDone) continue;
    const ownToolUses = toolUses.filter((toolUse) => toolOwners.get(toolUse.name) === feature);
    try {
      await feature.onReplyDone({ message, toolUses: ownToolUses }, turn, emit);
    } catch (error) {
      console.error(`Feature "${feature.id}": onReplyDone failed`, error);
    }
  }
}
