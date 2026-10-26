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
  2. **Server hooks:** the clone's message route asks registered features for extra call options before calling Claude, and passes tool calls to them. A feature can emit its own SSE event types (e.g. `{type:"tutor_offer", ...}`). The clone's client ignores types it doesn't know. Features are also told when the clone resets its chats (`onReset`) or the user deletes one (`onConversationDeleted`).
  3. **Client slots:** the chat view renders registered feature components (a banner above the thread, a card after a message, a side panel, a replacement composer) and lets a feature take over sending while it's active.
  4. **One registration file per side** (`client/src/features/index.ts`, `server/features.ts`) lists the enabled features. Turning Tutor off means removing one line there. A `TUTOR_ENABLED` env flag does the same without a code change.
- **Removal test:** deleting `features/tutor/`, `server/tutor/`, `server/data/tutor-*.json`, and the registration lines leaves a working clone. No other clone file mentions Tutor.
- **Copy:** Tutor's UI copy lives in `client/src/features/tutor/content.ts`, not the clone's `constants/content.ts`. This is a deliberate exception to the clone's "all copy in one file" rule, so that Tutor stays self-contained.

## Flow

1. **User sends a message** in a normal chat.
2. **Offer:** if the message shows the user trying to learn an academic subject, the offer card appears **instead of** Claude's answer, so it can't be missed below a long reply. If the user picks No thanks, Claude's normal answer is generated and shown then. On the "tutor" keyword, the server shows the offer without calling Claude at all:

   > Tutor mode uses education best practices to assist with deeper comprehension and recall. You may switch back to normal chat at any time. Try it out?

   Buttons: **Start with voice (recommended)**, **Start with text**, **No thanks**. See Voice below.
3. **First-time intro (dialog):** the first time a user starts Tutor mode, a dialog explains the two surfaces before anything else happens: **Tutor** (arrow pointing left at the chat: discuss questions, get more context, have confusing concepts explained) and **Workbook** (arrow pointing right: assessments and exercises appear there), plus "Interacting with the tutor does not affect progress in the workbook." It has a hand-drawn sketch of the screen and one button, **Got it**. The tutor doesn't speak or stream, and voice doesn't listen, until it's closed; in voice mode, Got it is the click that lets the browser speak (the microphone was asked for on Start with voice). On narrow screens the sections stack and name their tab. "Seen" is stored per user in `server/data/tutor-users.json`; `DELETE /api/tutor/intro` resets it.
4. **Scoping (chat):** every session's first tutor message opens with fixed copy from `content.ts`: "I'm your <topic> tutor." (the topic file's short `name`, or the session's subject outside the library), then "You can talk to me, and I'll listen through your microphone." (voice) or "You can chat with me by typing into the input on the left side of Tutor mode." (text). It's spoken in voice mode. The model's opening follows it, in at most 2 short sentences: it says they'll work through the question together so the learner can solve ones like it, then asks what to focus on, with tappable choices for goal (homework, exam, curiosity) and time available. Each answer is taken as given: the tutor never asks the learner to confirm their goal or time. If the opening question already names the goal ("studying for my final"), the server records it and the tutor asks only for the time; a time given when the goal was asked counts as the time. The chat stays the surface in focus through scoping, on every screen size; the workbook takes focus when its first item appears. Scoping and assessment together take about 4 turns at most. A loading state shows while the workbook is generated.
5. **Assessment (workbook):** 1 self-report question ("Which part of <topic> feels confusing?", with the same short topic name; multiple choice), with 1–2 plain sentences above it saying what the topic is (the topic file's `definition`, or one sentence the model writes with the item outside the library), and 1–2 real probe questions. This is a **check** (see Practice and checks). For library topics, these are the topic's fixed items.
6. **Steps (workbook):** the 3 teaching steps are generated **after** the assessment, pitched at the level it showed. Each step is an instruction plus visual, then a question. The tutor introduces each step in a sentence or two in the chat, and the full explanation is in the workbook.
7. **Final check (workbook):** 2 questions with no instruction before them, mixing content from the earlier steps. At least one matches an assessment question, so the session gives a before/after comparison. This is a **check**. For library topics, these are the topic's fixed items. An optional bonus item follows.
8. **Wrap-up:** the learner writes a short summary of what they learned, and then the tutor gives its own summary. Tutor asks whether the learner will do a short check-in in 3–7 days (see `TUTOR-MEASUREMENT.md`). The learner then chooses **More practice** (a few more questions on the same topic) or **Exit**.
9. **Exit, any time:** from the banner. There's no confirmation. A "Tutor paused — Resume" card stays in the thread, and the session persists. Response style and voice revert to the user's previous settings.

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
- **Checks** (the assessment and the final check): the tutor gives hints only and never confirms or gives an answer before it's submitted. The workbook marks check questions so the learner knows. Each check question has a confidence control (*Sure / Think so / Guessing*). Check answers show only "Answer recorded"; the wrap-up shows a before/after summary (assessment probes vs. final check, per item, with a total).

### Steps

- **One idea per step:** 1–2 sentences of instruction with a visual that carries the explanation, then a question (Rosenshine: small steps, check for understanding, aim for about 80% success). See `docs/reference/principles-of-instruction.webp`.
- **Every practice item stands alone:** each step, parallel question and More practice question opens with a one-sentence **scenario** that states the situation and its numbers in words ("A thousand people take a screening test: 100 have the condition…"), before any text that refers to the visual. It sits on top of the 1–2-sentence instruction or prompt. A step's question that asks about the step's own visual can share the step's scenario. Generation checks it's there; a missing one is written by a short follow-up call, and if that fails the build fails and the workbook offers a retry.
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
  context?: string;             // the scenario sentence, shown above the instruction
  instruction: string;          // markdown, a few sentences
  artifact?: TutorArtifact;
  bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  knowledgeType: "factual" | "conceptual" | "procedural" | "metacognitive";
  question: TutorQuestion;
};

type TutorQuestion = {
  id: string;
  prompt: string;
  context?: string;             // shown above the prompt: a scenario, or the self-report's definition
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
- **Visuals carry the explanation:** every instruction and every question has one, with about a quarter of the text we'd otherwise use. The instruction refers to its visual.
- **Check questions get hand-authored visuals** in the topic files. They show the scenario without giving away the answer.
- Interactive visuals (sandboxed HTML) are out of scope for now.

## Chat and workbook together

- **One place to look at a time:** the session tracks whether the learner should be looking at the chat or the workbook. The surface in focus gets a slightly lighter background, and the other is dimmed but stays usable. The tutor's chat message finishes before the next workbook item appears, so the learner never has to read both at once.

- **The tutor sees the workbook:** every Tutor chat turn sends the current workbook state: the step, the question, what the learner has selected or typed but not submitted, and past results.
- **Workbook events can prompt the tutor to speak:** a step starting (the tutor introduces it), a wrong answer, "Explain my thinking", or the battery finishing. The client sends the event to the chat endpoint, and the tutor replies in the chat.
- **The chat never changes the workbook.** No chat message submits an answer, reveals one, or moves forward.
- **Workbook answers are given by clicking or typing only, never by voice.**

## Voice

Chosen on the offer card: **Start with voice (recommended)** or **Start with text**. The user can switch at any time from the banner.

- **Voice:** the tutor's chat messages are spoken aloud, sentence by sentence, by the configured voice provider (below). The user replies to the tutor by speaking: `SpeechRecognition` listens when the tutor finishes talking, and there's a visible mic mute button and listening indicator. Recognition runs continuously, so short pauses don't cut the learner off. After about 1 s of silence following speech (`END_OF_SPEECH_MS` in `voiceInput.ts`), the Listening box shows a small ring and "Tutor will respond in 3", counting down (`COUNTDOWN_MS`, 3 s), and the turn is sent at 0, about 4 s after the learner stops. Speaking again cancels the countdown and keeps adding to the turn; Mute, stopping, or typing a reply also cancel it. **Send now** (left of Mute, shown once something has been heard) sends at once. The countdown is announced once through a polite live region, not every second, and the ring steps instead of sweeping with reduced motion. The click on "Start with voice" asks for microphone permission.
- **Talk that isn't meant for the tutor:** a spoken turn is sent with `origin: "voice"`, and on those turns (voice sessions only) the prompt asks the tutor whether the message looks addressed to it. Reading the question or options aloud ("C, about fifty percent"), muttering or thinking out loud, fragments, and unrelated talk don't. Then the tutor replies briefly and reminds the learner that there's a Mute button in the tutor chat they can use while reading aloud or thinking out loud. It stays within 2 short sentences, and doesn't treat what was read aloud as an answer (no confirming, ruling out or hinting). The reminder is given **once per session**: when a voice-turn reply mentions Mute, the server stores `muteReminderAt` on the session, and later voice turns tell the tutor not to mention it again. Typed turns never get this rule.
- **Where to look in voice mode:** the next workbook item appears once the tutor has finished speaking, not just finished streaming.
- **Text:** a normal typed chat with the tutor.
- **Voice is for the chat only.** The workbook is never read aloud, and workbook answers are always clicked or typed.
- **Speech-friendly messages:** in voice mode, the tutor writes chat messages to be spoken (short, no markdown or math symbols, refers to the workbook: "in the diagram, the left bar…").
- **Fallback:** if the browser doesn't support speech recognition (it's Chrome and Safari only) or the user denies microphone access, Tutor switches to text and says why.
- **Implementation:** no new dependencies. Listening is the browser's Web Speech API (`voiceInput.ts`, a seam where a speech-to-text vendor could go later). Speaking goes through a provider seam:
  - Server: `server/tutor/voice/` holds the provider interface (`types.ts`), picks the provider from `TUTOR_VOICE_PROVIDER` (`index.ts`), and has one vendor, ElevenLabs (`elevenlabs.ts`, streaming TTS with the `eleven_flash_v2_5` model, key in `ELEVENLABS_API_KEY`, optional `ELEVENLABS_VOICE_ID`). `GET /api/tutor/voice` tells the client which provider is active; `POST /api/tutor/tts` `{ text }` streams one sentence's audio. The key stays on the server.
  - Client: `voiceOutput.ts` has the browser output (`speechSynthesis`) and the server output (plays `/api/tutor/tts` audio, fetching the next sentence while the current one plays). Mute and Stop speaking stop audio at once. If a server sentence fails, the rest of the page uses the browser's voice.
  - `TUTOR_VOICE_PROVIDER=browser` (the default) uses the browser's voice. To remove ElevenLabs, delete `elevenlabs.ts`, its line in `voice/index.ts`, and its env lines.

## Tutor system prompt

- The learner does the thinking. Don't solve the problem the student came with; guide them to it.
- Be concise: chat messages are at most 2 short sentences unless the learner asks for more. The fixed line that opens a session's first message (Flow, step 4) comes first and doesn't count toward this. One idea at a time. Aim for about 80% success; after two wrong answers in a row, make the steps smaller.
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
  - `GET /api/tutor/intro`, `POST` (mark seen), `DELETE` (reset): the first-time intro dialog's per-user "seen" flag.
- `prompts.ts`: the Tutor system prompt and the detection instruction.
- `topics/`: the topic library (one JSON file per topic, plus `index.ts` listing the active ones).
- `battery.ts`: loading fixed items from the topic, generating the steps (and items for subjects outside the library), grading freeform answers, and generating parallel questions.
- `repo.ts`: reads and writes `server/data/tutor-sessions.json`, `tutor-events.json` and `tutor-users.json` (per-user Tutor state, e.g. the intro flag).
- `hooks.ts`: what Tutor registers with the clone's extension points. When the user deletes a chat, its sessions move to `tutor-sessions-archive.json` (as Clear all chats does), so research data is kept.

**Session record:** `conversationId`, `userId`, `subject`, `topicId`, `form` (1 or 2, alternating), `mode`, `previousSettings` (response style and voice before Tutor started), `status` (`offered` | `declined` | `scoping` | `assessing` | `teaching` | `final_check` | `wrap_up` | `complete` | `paused`), `battery`, `currentQuestionId`, `answers[]` (with result, attempts, revealed), `learnerSummary`, `delayedCheckConsent`, `muteReminderAt`, `createdAt`, `updatedAt`.

**Tutor chat turns are stored in the conversation's message history**, so pausing Tutor and continuing to chat keeps the context.

## Client

`client/src/features/tutor/`:

- `TutorOfferCard`: the offer copy plus Start with voice, Start with text, and No thanks.
- `TutorIntroDialog`: the first-time intro (shadcn Dialog), with `IntroSketch` and `IntroArrow`.
- `TutorBanner`: mode, subject, progress, voice/text switch, Exit.
- `TutorPausedCard`: the Resume card left in the thread after exiting.
- `Workbook`: the panel; renders the current item and the Next button.
  - `InstructionCard`: markdown instruction plus its visual.
  - `QuestionCard`: radio group or textarea, Submit, Show me, feedback, and the Show answer / Explain my thinking choice.
  - `ArtifactView`: SVG with its title and description.
  - `WrapUp`: the learner's summary box, then More practice / Exit.
- `TutorChat`: the tutor conversation, with scoping choice chips.
- `VoiceControls`: mic mute, speaker, listening indicator.
- `useTutorSession`, `useSpeech`: session state, API calls, SSE, and voice (with `voiceOutput.ts` and `voiceInput.ts`).
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
