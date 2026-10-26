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
  // Answers a turn itself, without calling Claude, by emitting its own events. Return true when
  // it did; the clone then stores no reply and ends the turn. The first feature to claim wins.
  handleTurn?: (turn: ChatTurn, emit: (event: FeatureEvent) => void) => Promise<boolean>;
  // Adds instructions and tools to a normal chat turn. Return undefined to add nothing.
  callOptions?: (turn: ChatTurn) => Promise<FeatureCallOptions | undefined>;
  // Return true to withhold Claude's text for this turn (e.g. the feature replaces it with its
  // own UI). The clone then doesn't store it, and sends "discard" so the client clears it.
  withholdReply?: (reply: { text: string; toolUses: Anthropic.ToolUseBlock[] }, turn: ChatTurn) => boolean;
  // Called once per finished turn, after the reply is stored, whether or not Claude called
  // one of this feature's tools. Events emitted here reach the client before "done".
  onReplyDone?: (reply: FeatureReply, turn: ChatTurn, emit: (event: FeatureEvent) => void) => Promise<void>;
  // Called after the clone's reset puts conversations back to the sample chats (between test
  // participants). The feature clears its own per-chat state, keeping any research data.
  onReset?: () => Promise<void>;
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

// A failing feature is logged and skipped, so normal chat carries on.
export async function handleTurnByFeature(turn: ChatTurn, emit: (event: FeatureEvent) => void): Promise<boolean> {
  for (const feature of features) {
    if (!feature.handleTurn) continue;
    try {
      if (await feature.handleTurn(turn, emit)) return true;
    } catch (error) {
      console.error(`Feature "${feature.id}": handleTurn failed`, error);
    }
  }
  return false;
}

export function shouldWithholdReply(
  text: string,
  toolUses: Anthropic.ToolUseBlock[],
  toolOwners: Map<string, ChatFeature>,
  turn: ChatTurn,
): boolean {
  return features.some((feature) => {
    if (!feature.withholdReply) return false;
    const ownToolUses = toolUses.filter((toolUse) => toolOwners.get(toolUse.name) === feature);
    try {
      return feature.withholdReply({ text, toolUses: ownToolUses }, turn);
    } catch (error) {
      console.error(`Feature "${feature.id}": withholdReply failed`, error);
      return false;
    }
  });
}

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

// Unlike the other hooks, a failure here fails the reset, so a half-cleared state is reported.
export async function resetFeatures(): Promise<void> {
  for (const feature of features) {
    if (!feature.onReset) continue;
    try {
      await feature.onReset();
    } catch (error) {
      console.error(`Feature "${feature.id}": onReset failed`, error);
      throw error;
    }
  }
}
