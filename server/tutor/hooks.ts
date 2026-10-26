import type Anthropic from "@anthropic-ai/sdk";
import type { ChatFeature, ChatTurn } from "../features";
import { titleFromMessage } from "../repo/conversations";
import { matchSubject } from "./battery";
import { OFFER_TOOL_NAME, detectionInstruction } from "./prompts";
import { archiveSessions, createSession, listSessions, resetAllIntros } from "./repo";
import { tutorRouter } from "./routes";
import { isActive } from "./session";
import { topics } from "./topics";
import type { Topic, TutorSession } from "./types";

// "tutor", "tutoring", "tutored"... anywhere in the message.
export function hasTutorKeyword(message: string): boolean {
  return /\btutor/i.test(message);
}

const offerTool: Anthropic.Tool = {
  name: OFFER_TOOL_NAME,
  description:
    "Offer to switch this conversation into Tutor mode. Call it immediately, without writing an answer, when the user is trying to learn an academic subject.",
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

// The offer is shown in place of Claude's answer, after the user's message. If they decline,
// the answer is written then (see /decline).
async function createOffer(turn: ChatTurn, trigger: TutorSession["trigger"], input: OfferInput): Promise<TutorSession> {
  const topic = topics.find((candidate) => candidate.id === input.topicId) ?? matchTopic(turn);
  const subject =
    typeof input.subject === "string" && input.subject.trim()
      ? input.subject.trim()
      : (topic?.title ?? titleFromMessage(turn.message));
  const userMessage = turn.conversation.messages.filter((message) => message.role === "user").at(-1);
  return createSession({
    conversationId: turn.conversation.id,
    userId: "",
    subject,
    topicId: topic?.id,
    reason: typeof input.reason === "string" ? input.reason : "",
    trigger,
    offerMessageId: userMessage?.id,
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
}

export const tutorFeature: ChatFeature = {
  id: "tutor",
  router: tutorRouter,

  // "tutor" in the message always offers, before any answer: no Claude call at all.
  async handleTurn(turn, emit) {
    if (!hasTutorKeyword(turn.message) || (await eligibility(turn)) === "no") return false;
    // Keywords first; otherwise a quick call matches the subject to the library.
    const input: OfferInput = matchTopic(turn)
      ? {}
      : await matchSubject(turn.message, topics).catch(() => ({}));
    const session = await createOffer(turn, "keyword", input);
    emit({ type: "tutor_offer", sessionId: session.id, messageId: session.offerMessageId });
    return true;
  },

  // Detection on other turns. Keyword turns never get here (handleTurn took them).
  async callOptions(turn) {
    if ((await eligibility(turn)) !== "detect") return undefined;
    return { system: detectionInstruction(topics), tools: [offerTool] };
  },

  // When Claude offers, whatever it wrote before the call isn't shown or stored.
  withholdReply: (reply) => reply.toolUses.length > 0,

  async onReplyDone(reply, turn, emit) {
    const toolUse = reply.toolUses[0];
    if (!toolUse || (await eligibility(turn)) === "no") return;
    const session = await createOffer(turn, "detected", toolUse.input as OfferInput);
    emit({ type: "tutor_offer", sessionId: session.id, messageId: session.offerMessageId });
  },

  // Between participants: sessions move to the archive (kept for analysis), and the intro shows again.
  async onReset() {
    await archiveSessions();
    await resetAllIntros();
  },

  // A deleted chat's sessions move to the archive too, so its research data is kept.
  async onConversationDeleted(conversationId) {
    await archiveSessions(conversationId);
  },
};
