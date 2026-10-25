# Plan: Tutor Mode

An interactive learning mode built on top of the Claude clone (`PLAN.md`). When Claude detects that the user is trying to learn an academic subject, it offers to switch the conversation into **Tutor** mode.

Tutor mode is meant to feel like sitting with a human tutor, using two surfaces:

- **Workbook** (panel beside the chat): the learning battery. It holds instruction, visuals, questions and activities, and it's the only place answers are submitted and progress is made.
- **Chat**: a conversation with the tutor about the workbook ("I don't get step 2", "is it B?", "why was that wrong?"). Nothing said in the chat records an answer or moves the battery forward.

This is the feature under test. The clone is the base it sits on. Topic content, fixed check items, scoring and the event log are specified in `TUTOR-MEASUREMENT.md`.

## Separation from the clone

We may throw Tutor away and rebuild it on the same clone, so it should come out cleanly.

- **All Tutor code lives in two folders:** `client/src/features/tutor/` and `server/tutor/`. Tutor data lives in its own files (`server/data/tutor-*.json`), never inside `conversations.json` records.
- **The clone gets a small number of generic extension points**, not Tutor-specific code. Each one is something any future feature could use:
  1. **Claude call options:** `server/services/claude.ts` accepts optional `system` and `tools`, so a feature can add instructions and tools to a normal chat turn.
  2. **Server hooks:** the clone's message route asks registered features for extra call options before calling Claude, and passes tool calls to them. A feature can emit its own SSE event types (e.g. `{type:"tutor_offer", ...}`). The clone's client ignores types it doesn't know.
  3. **Client slots:** the chat view renders registered feature components (a banner above the thread, a card after a message, a side panel, a replacement composer) and lets a feature take over sending while it's active.
  4. **One registration file per side** (`client/src/features/index.ts`, `server/features.ts`) lists the enabled features. Turning Tutor off means removing one line there. A `TUTOR_ENABLED` env flag does the same without a code change.
- **Removal test:** deleting `features/tutor/`, `server/tutor/`, `server/data/tutor-*.json`, and the registration lines leaves a working clone. No other clone file mentions Tutor.
- **Copy:** Tutor's UI copy lives in `client/src/features/tutor/content.ts`, not the clone's `constants/content.ts`. This is a deliberate exception to the clone's "all copy in one file" rule, so that Tutor stays self-contained.

## Flow

1. **User sends a message** in a normal chat.
2. **Offer:** if the message shows the user trying to learn an academic subject, Claude answers normally and an offer card appears after the answer:

   > Tutor mode uses education best practices to assist with deeper comprehension and recall. You may switch back to normal chat at any time. Try it out?

   Buttons: **Start with voice (recommended)**, **Start with text**, **No thanks**. See Voice below.
3. **Scoping (chat):** the tutor's first message acknowledges the answer the user already has ("You have the answer. Let's make sure you could solve the next one."). It then asks what to focus on, with tappable choices for goal (homework, exam, curiosity) and time available. Scoping and assessment together take about 4 turns at most. A loading state shows while the workbook is generated.
4. **Assessment (workbook):** 1 self-report question ("What about X is confusing?", multiple choice or freeform) and 1–2 real probe questions. This is a **check** (see Practice and checks). For library topics, these are the topic's fixed items.
5. **Steps (workbook):** the 3 teaching steps are generated **after** the assessment, pitched at the level it showed. Each step is an instruction plus visual, then a question. The tutor introduces each step in a sentence or two in the chat, and the full explanation is in the workbook.
6. **Final check (workbook):** 2 questions with no instruction before them, mixing content from the earlier steps. At least one matches an assessment question, so the session gives a before/after comparison. This is a **check**. For library topics, these are the topic's fixed items. An optional bonus item follows.
7. **Wrap-up:** the learner writes a short summary of what they learned, and then the tutor gives its own summary. Tutor asks whether the learner will do a short check-in in 3–7 days (see `TUTOR-MEASUREMENT.md`). The learner then chooses **More practice** (a few more questions on the same topic) or **Exit**.
8. **Exit, any time:** from the banner. There's no confirmation. A "Tutor paused — Resume" card stays in the thread, and the session persists. Response style and voice revert to the user's previous settings.

## Offer and detection

**Detection, recommended approach (A):** through extension points 1–2, Tutor adds a short system instruction and an `offer_tutor_mode({ subject, reason, topicId? })` tool to every normal chat turn. Claude calls the tool when it judges the user is trying to learn, and the server turns the call into a `tutor_offer` SSE event. The instruction tells Claude to **write its full answer first, then call the tool**, because the turn ends at the tool call and nothing is fed back. If that proves unreliable, send a tool result back so Claude can finish. The instruction lists the library topics so Claude can match the subject to one. There's no extra API call, and Claude judges with the full conversation.

**Alternative (B):** a separate classifier call on each user message. It leaves the main call untouched but adds an API call per message. B is the fallback if the tool noticeably changes Claude's normal answers.

**Offer rules:**

- **"tutor" always works:** a message containing the word "tutor" (case-insensitive) that asks for tutoring triggers the offer, including in the very first message. Test scripts rely on this, so it must not depend on detection firing.
- **After a decline:** Claude tells the user that if they want to try Tutor mode later, they can use the word "tutor". It then doesn't offer again in that conversation unless a message contains "tutor". The server enforces this: once a conversation has a `declined` session, the detection tool is only included on turns whose message contains "tutor".
- **Subject shift:** during a session, if the subject moves meaningfully away from the session's subject, the tutor offers in the chat to build a new workbook and start a new session.

## Workbook

### Topics

Topics come from a topic library (`server/tutor/topics/`, one file per topic; see `TUTOR-MEASUREMENT.md`). Each file holds vetted content notes, sources, and the fixed check items. Adding or switching topics means adding or changing files, with no other code changes. Subjects outside the library fall back to generated items, flagged in the logs. Long-term, topics would live in a database of carefully generated topics mapped to real, vetted learning resources.

### Practice and checks

- **Practice** (the 3 steps and More practice): the learner can work answers out with the tutor in the chat.
- **Checks** (the assessment and the final check): the tutor gives hints only and never confirms or gives an answer before it's submitted. The workbook marks check questions so the learner knows. Each check question has a confidence control (*Sure / Think so / Guessing*).

### Steps

- **One idea per step:** a few sentences of instruction with a visual, then a question (Rosenshine: small steps, check for understanding, aim for about 80% success). See `docs/reference/principles-of-instruction.webp`.
- **The steps climb Bloom's levels:** roughly Understand, then Apply, then Analyze or Evaluate. Step 3 is freeform ("explain why", "spot the error") so the learner explains in their own words.
- **"Show me"** on every practice question reveals the answer and explanation. The step then counts as not mastered.
- The learner moves to the next step with a **Next** button once the step is answered or revealed.

### After a wrong answer

1. The workbook shows one line of feedback that names the likely misconception. Each multiple-choice option has a `rationale` linking a wrong choice to its misconception.
2. The learner chooses:
   - **Show answer**: reveals the answer and explanation. The step counts as not mastered.
   - **Explain my thinking**: opens a discussion in the chat. The learner explains why they chose their answer, and the tutor responds to their reasoning, with a short worked example if it helps.
3. The workbook then offers a **parallel question** (similar, not the same, so it can't be passed by elimination).
4. After 2 misses on a step, the answer is shown with an explanation, logged, and the learner moves on.

Freeform answers are graded as correct, partially correct, or incorrect. Partially correct gets feedback on what's missing and one more try.

On checks, wrong answers get no reveal or retry. The answer is recorded and the learner moves on.

### Data

The steps (and, outside the library, the checks) are generated as structured data (a tool call or structured output with a JSON schema; check the `claude-api` skill for current parameters when building), in two passes: assessment first, then steps and final check after the assessment is answered.

```ts
type TutorBattery = {
  subject: string;
  goal: string;
  assessment: TutorQuestion[];  // 1 self-report + 1–2 probes
  steps: TutorStep[];           // 3, generated after the assessment
  finalCheck: TutorQuestion[];  // 2, at least one parallel to an assessment probe
};

type TutorStep = {
  id: string;
  instruction: string;          // markdown, a few sentences
  artifact?: TutorArtifact;
  bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  knowledgeType: "factual" | "conceptual" | "procedural" | "metacognitive";
  question: TutorQuestion;
};

type TutorQuestion = {
  id: string;
  prompt: string;
  kind: "multiple_choice" | "freeform";
  role: "practice" | "check" | "self_report";
  options?: { text: string; rationale: string }[];  // server only: rationale
  answer?: string;              // server only: correct option or grading notes
};

type TutorArtifact = { kind: "svg"; title: string; description: string; content: string };
```

**Answer keys stay on the server.** The client receives questions without `answer` or `rationale`, and grading happens on the server.

### Visuals

- Claude generates self-contained SVG (diagrams, number lines, graphs, labelled figures). It's rendered as an image (`<img src="data:image/svg+xml,...">`), so no scripts run and no new dependencies are needed.
- Every visual has a title and a text description for screen readers.
- Each visual must support its step's instruction, and the instruction refers to it.
- Interactive visuals (sandboxed HTML) are out of scope for now.

## Chat and workbook together

- **The tutor sees the workbook:** every Tutor chat turn sends the current workbook state: the step, the question, what the learner has selected or typed but not submitted, and past results.
- **Workbook events can prompt the tutor to speak:** a step starting (the tutor introduces it), a wrong answer, "Explain my thinking", or the battery finishing. The client sends the event to the chat endpoint, and the tutor replies in the chat.
- **The chat never changes the workbook.** No chat message submits an answer, reveals one, or moves forward.
- **Workbook answers are given by clicking or typing only, never by voice.**

## Voice

Chosen on the offer card: **Start with voice (recommended)** or **Start with text**. The user can switch at any time from the banner.

- **Voice:** the tutor's chat messages are spoken aloud with `speechSynthesis`. The user replies to the tutor by speaking: `SpeechRecognition` listens when the tutor finishes talking, and there's a visible mic mute button and listening indicator. The click on "Start with voice" asks for microphone permission.
- **Text:** a normal typed chat with the tutor.
- **Voice is for the chat only.** The workbook is never read aloud, and workbook answers are always clicked or typed.
- **Speech-friendly messages:** in voice mode, the tutor writes chat messages to be spoken (short, no markdown or math symbols, refers to the workbook: "in the diagram, the left bar…").
- **Fallback:** if the browser doesn't support speech recognition (it's Chrome and Safari only) or the user denies microphone access, Tutor switches to text and says why.
- **Implementation:** browser Web Speech API only, with no new dependencies or services.

## Tutor system prompt

- The learner does the thinking. Don't solve the problem the student came with; guide them to it.
- Be concise. One idea at a time. Aim for about 80% success; after two wrong answers in a row, make the steps smaller.
- Ask, don't tell. Feedback is one sentence and names the specific error.
- Follow the practice and checks rules: help freely on practice, give hints only on checks.
- Fade hints as the learner gets answers right.
- Never claim to have submitted, revealed or advanced anything in the workbook; only the learner does that.
- In voice mode, write for speech.
- Stay on the session's subject, and follow the subject-shift rule.

## Layout

- **Desktop:** the workbook is the main workspace, on the right and at least half the width. The chat is narrower on the left. A banner across the top shows "Tutor mode", the subject, progress (step N of M), the voice/text switch, and Exit.
- **Narrow screens:** Chat and Workbook tabs.
- Multiple-choice questions are a keyboard-operable radio group with a Submit button. Feedback is announced through a polite live region.

## Server

`server/tutor/`:

- `routes.ts`, mounted at `/api/tutor/:conversationId`:
  - `POST /start` with `{ mode: "voice" | "text" }`: creates a session and starts scoping.
  - `POST /decline`: records the decline.
  - `GET /`: the session without answer keys, so a reload resumes where the user was.
  - `POST /chat`: tutor chat turn, streamed as SSE. Takes the message (or a workbook event) plus the workbook state.
  - `POST /answer` with `{ questionId, answer }`: grades and returns the result and feedback.
  - `POST /reveal` with `{ questionId }`: returns the answer; the step counts as not mastered.
  - `POST /advance`: next step, or generates the next part of the battery.
  - `POST /summary`: the learner's wrap-up summary.
  - `POST /exit`, `POST /resume`.
- `prompts.ts`: the Tutor system prompt and the detection instruction.
- `topics/`: the topic library (one JSON file per topic, plus `index.ts` listing the active ones).
- `battery.ts`: loading fixed items from the topic, generating the steps (and items for subjects outside the library), grading freeform answers, and generating parallel questions.
- `repo.ts`: reads and writes `server/data/tutor-sessions.json` and `tutor-events.json`.
- `hooks.ts`: what Tutor registers with the clone's extension points.

**Session record:** `conversationId`, `userId`, `subject`, `topicId`, `form` (1 or 2, alternating), `mode`, `previousSettings` (response style and voice before Tutor started), `status` (`offered` | `declined` | `scoping` | `assessing` | `teaching` | `final_check` | `wrap_up` | `complete` | `paused`), `battery`, `currentQuestionId`, `answers[]` (with result, attempts, revealed), `learnerSummary`, `delayedCheckConsent`, `createdAt`, `updatedAt`.

**Tutor chat turns are stored in the conversation's message history**, so pausing Tutor and continuing to chat keeps the context.

## Client

`client/src/features/tutor/`:

- `TutorOfferCard`: the offer copy plus Start with voice, Start with text, and No thanks.
- `TutorBanner`: mode, subject, progress, voice/text switch, Exit.
- `TutorPausedCard`: the Resume card left in the thread after exiting.
- `Workbook`: the panel; renders the current item and the Next button.
  - `InstructionCard`: markdown instruction plus its visual.
  - `QuestionCard`: radio group or textarea, Submit, Show me, feedback, and the Show answer / Explain my thinking choice.
  - `ArtifactView`: SVG with its title and description.
  - `WrapUp`: the learner's summary box, then More practice / Exit.
- `TutorChat`: the tutor conversation, with scoping choice chips.
- `VoiceControls`: mic mute, speaker, listening indicator.
- `useTutorSession`, `useSpeech`: session state, API calls, SSE, and the Web Speech wrappers.
- `content.ts`: all Tutor copy.

## Measurement

See `TUTOR-MEASUREMENT.md` for topics, fixed items, counterbalancing, scoring, the delayed check, the event log format (`server/data/tutor-events.json`), and the moderator sheet. The main learning signal is **final check accuracy compared with the assessment probes**. Participants are identified by the user ID in the chat.

## Test setup

- **Test topics:** `stats.base_rates` (base rates in a positive test result) and `social.bystander` (the bystander effect). See `TUTOR-MEASUREMENT.md`.
- Test scripts start Tutor with "tutor" in the first message.
- The `design-reviewer` agent reviews the full Tutor screen (banner, chat, workbook, voice controls) for whether it's clear where to look.

## Open questions

1. **Delayed check items:** a third parallel version (Form C) of each probe is still to be drafted.

## Decided

- **Offer copy:** see Flow, step 2.
- **Two surfaces:** progress happens in the workbook only, and the chat is for discussing it.
- **Practice and checks:** collaborative help on practice; hints only on checks.
- **Voice:** chosen at start, with voice recommended. It applies to the chat only, and workbook answers are clicked or typed.
- **After a wrong answer:** Show answer, or Explain my thinking in the chat.
- **Battery:** assessment, then 3 steps generated after it, then a 2-question final check.
- **Topics:** a topic library with fixed, counterbalanced check items. The test topics are base rates and the bystander effect.
- **On exit:** response style and voice revert to the user's previous settings.
- **Re-offering:** offer a new session when the subject shifts meaningfully. After a decline, only offer again when the user says "tutor".

## Build order

Starts after the clone's build order (`PLAN.md`) is finished.

1. Clone extension points (Claude call options, server hooks, client slots including the side panel, registration files). Confirm the clone still works with no features registered.
2. Detection: tool, "tutor" keyword, `tutor_offer` event, `TutorOfferCard`, decline rules.
3. Session record, Tutor routes, Tutor layout (banner, chat, empty workbook), and scoping turns in text mode.
4. Assessment generation, then steps and final check, with `QuestionCard`, server-side grading, the wrong-answer flow, and Show me.
5. Chat and workbook link-up: workbook state in chat turns, workbook events prompting the tutor, and the practice and checks rules.
6. SVG visuals.
7. Wrap-up, More practice, exit and resume.
8. Voice mode.
9. Event logging and the delayed check (per `TUTOR-MEASUREMENT.md`).
10. Review: the `user-researcher` agent reviews the flow and prompts, and the `design-reviewer` agent reviews the UI.

## Out of scope (this pass)

- Saving progress across conversations, or a learner profile
- Spaced review or reminders
- Interactive (scripted) visuals
- Voice answers in the workbook
- Subjects outside academic topics
