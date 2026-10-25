import type Anthropic from "@anthropic-ai/sdk";
import type { ChatFeature, ChatTurn } from "../features";
import { titleFromMessage } from "../repo/conversations";
import { OFFER_TOOL_NAME, detectionInstruction } from "./prompts";
import { createSession, listSessions } from "./repo";
import { tutorRouter } from "./routes";
import { isActive } from "./session";
import { topics } from "./topics";
import type { Topic } from "./types";

// "tutor", "tutoring", "tutored"... anywhere in the message.
export function hasTutorKeyword(message: string): boolean {
  return /\btutor/i.test(message);
}

const offerTool: Anthropic.Tool = {
  name: OFFER_TOOL_NAME,
  description:
    "Offer to switch this conversation into Tutor mode. Call it after your full answer, when the user is trying to learn an academic subject or asks for tutoring.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "reason", "topicId"],
    properties: {
      subject: { type: "string", description: "The subject the user is learning, in a few words." },
      reason: { type: "string", description: "One sentence on why Tutor mode fits." },
      topicId: {
        anyOf: [{ type: "string", enum: topics.map((topic) => topic.id) }, { type: "null" }],
        description: "The matching library topic, or null.",
      },
    },
  },
};

type Eligibility = "no" | "detect" | "keyword_only";

// Detection runs on normal turns when no session is on screen. Once a conversation has had an
// offer (declined, ignored, or a session since), only a message containing "tutor" re-offers.
async function eligibility(turn: ChatTurn): Promise<Eligibility> {
  const sessions = await listSessions(turn.conversation.id);
  if (isActive(sessions.at(-1))) return "no";
  if (sessions.length === 0) return "detect";
  return hasTutorKeyword(turn.message) ? "keyword_only" : "no";
}

// For the keyword trigger when Claude didn't call the tool: match a library topic from the
// conversation's recent user messages.
function matchTopic(turn: ChatTurn): Topic | undefined {
  const text = turn.conversation.messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content)
    .join(" ")
    .toLowerCase();
  return topics.find((topic) => topic.detection.keywords.some((keyword) => text.includes(keyword)));
}

interface OfferInput {
  subject?: unknown;
  reason?: unknown;
  topicId?: unknown;
}

export const tutorFeature: ChatFeature = {
  id: "tutor",
  router: tutorRouter,

  async callOptions(turn) {
    const allowed = await eligibility(turn);
    if (allowed === "no") return undefined;
    return {
      system: detectionInstruction(topics, allowed === "keyword_only"),
      tools: [offerTool],
    };
  },

  async onReplyDone(reply, turn, emit) {
    const keyword = hasTutorKeyword(turn.message);
    const toolUse = reply.toolUses[0];
    // "tutor" always offers, even if Claude didn't call the tool.
    if (!toolUse && !keyword) return;
    if ((await eligibility(turn)) === "no" || !reply.message) return;

    const input = (toolUse?.input ?? {}) as OfferInput;
    const topic =
      topics.find((candidate) => candidate.id === input.topicId) ?? (toolUse ? undefined : matchTopic(turn));
    const subject =
      typeof input.subject === "string" && input.subject.trim()
        ? input.subject.trim()
        : (topic?.title ?? titleFromMessage(turn.message));

    const session = await createSession({
      conversationId: turn.conversation.id,
      userId: "",
      subject,
      topicId: topic?.id,
      reason: typeof input.reason === "string" ? input.reason : "",
      trigger: keyword ? "keyword" : "detected",
      offerMessageId: reply.message.id,
      mode: "text",
      previousSettings: { responseStyle: "default", voice: false },
      status: "offered",
      scoping: {},
      position: 0,
      answers: [],
      stepProgress: [],
      shownAt: {},
      generation: {},
    });
    emit({ type: "tutor_offer", sessionId: session.id, messageId: reply.message.id });
  },
};
