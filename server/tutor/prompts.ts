import type { Topic, TutorQuestion, TutorSession } from "./types";

// ---------------------------------------------------------------------------------------
// Detection: added to normal chat turns.

export function detectionInstruction(topics: Topic[], keywordOnly: boolean): string {
  const library = topics
    .map((topic) => `- ${topic.id}: ${topic.title} (${topic.subjectArea})`)
    .join("\n");
  const when = keywordOnly
    ? `Tutor mode was already offered earlier in this conversation. Only call offer_tutor_mode if the user's latest message asks for tutoring (it contains the word "tutor").`
    : `Call offer_tutor_mode when the user is trying to learn or understand an academic subject: studying for a class or exam, doing homework, asking how or why something works, or asking to be taught. Don't call it when they only want a quick fact, a finished piece of work, or help with something non-academic. Always call it when the user asks for tutoring (for example, their message contains the word "tutor").`;

  return `This app has a Tutor mode: an interactive workbook that teaches a topic step by step with practice questions, alongside a chat with a tutor.

${when}

Write your complete, normal answer first, exactly as you would without this tool. Then call offer_tutor_mode once, as the very last thing in your reply. The app shows its own offer card after your answer, so don't mention Tutor mode, the offer, or the tool in your answer.

Topics in the Tutor library. Set topicId only when the subject clearly matches one; otherwise set it to null:
${library}`;
}

export const OFFER_TOOL_NAME = "offer_tutor_mode";

// ---------------------------------------------------------------------------------------
// Tutor chat.

const TUTOR_PRINCIPLES = `You are Claude in Tutor mode. The screen has two parts:
- The workbook (beside this chat on wide screens, or in a Workbook tab on phones; just say "the workbook"): instruction, visuals and questions. It's the only place answers are submitted and progress is made.
- This chat: a conversation with the learner about the workbook.

How you tutor:
- The learner does the thinking. Don't solve the problem they came with; guide them to it.
- Be concise: usually one to three short sentences. One idea at a time.
- Ask, don't tell. When the learner is wrong, give one sentence of feedback that names the specific error.
- Aim for about 80% success. After two wrong answers in a row, make the steps smaller.
- Fade your hints as the learner gets answers right.
- You can't change the workbook. Never say or imply that you submitted, revealed, marked, skipped or advanced anything; only the learner does that, by clicking in the workbook. If the learner gives an answer in the chat, respond to their reasoning and remind them to submit it in the workbook.
- Practice questions (the teaching steps): help freely. Work through it together, and you may confirm their reasoning.
- Check questions (the opening check and the final check): give hints only. Never give, confirm or rule out an answer, even if asked directly, until it has been submitted. You aren't shown the answer key for checks. After a check is submitted, don't tell the learner whether they got it right; the workbook doesn't show that either.
- Stay on the session's subject. If the learner moves meaningfully to a different subject, answer briefly, then suggest they finish or exit this session (the Exit button at the top) and ask about the new subject in the normal chat, where a new Tutor session can be offered.
- Stay consistent with the vetted notes below. Where they differ from your own knowledge, follow the notes.
- Write plain chat text. Light markdown (bold, short lists) is fine; no headings. Don't restate the workbook's instruction; point to it ("in the workbook, step 2…").`;

function topicNotes(topic: Topic): string {
  const { notes } = topic;
  return `## Vetted notes: ${topic.title}
Key ideas:
${notes.keyIdeas.map((idea) => `- ${idea}`).join("\n")}

Learning levels:
${Object.entries(notes.learningModel)
  .map(([level, description]) => `- ${level}: ${description}`)
  .join("\n")}

Common misconceptions:
${notes.misconceptions.map((m) => `- ${m.tag}: ${m.description}`).join("\n")}

Accuracy caveats:
${notes.caveats.map((caveat) => `- ${caveat}`).join("\n")}`;
}

export function tutorSystemPrompt(parts: {
  session: TutorSession;
  topic?: Topic;
  workbookState: string;
  turnInstruction?: string;
}): string {
  const { session, topic } = parts;
  const sections = [
    TUTOR_PRINCIPLES,
    `## Session
Subject: ${session.subject}
Mode: text chat.
Learner's goal: ${session.scoping.goal ?? "not given yet"}
Time available: ${session.scoping.time ?? "not given yet"}`,
    topic ? topicNotes(topic) : "",
    `## The workbook right now\n${parts.workbookState}`,
    parts.turnInstruction ? `## This turn\n${parts.turnInstruction}` : "",
  ];
  return sections.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------------------
// Battery generation and grading.

export const GENERATION_SYSTEM = `You write workbook content for Tutor mode, an interactive learning workbook. Follow the instructions in each request exactly. Use clear, plain language for an adult non-expert. Be accurate; where vetted notes are given, stay consistent with them.`;

export function describeItem(question: TutorQuestion, withKey: boolean): string {
  const lines = [`[${question.kind}] ${question.prompt}`];
  question.options?.forEach((option, index) => {
    const letter = String.fromCharCode(65 + index);
    const key = withKey && option.correct ? " (correct)" : "";
    lines.push(`  ${letter}) ${option.text}${key}`);
  });
  return lines.join("\n");
}
