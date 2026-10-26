# Tutor Mode: Measurement

How we tell whether Tutor sessions produce learning. This companion to `TUTOR-PLAN.md` holds the topic items, scoring, event log format, and moderator guidance. Monitoring the prototype's success more broadly is a separate, later area of work; this is the start of it.

## Topic library

Each topic is one file in `server/tutor/topics/` (e.g. `stats.base_rates.json`). A topic file holds:

- `id`, `title`, `subject area`, and detection hints (keywords and example questions)
- **vetted content notes:** key ideas, the learning model (L0–L3), common misconceptions, and accuracy caveats, which the tutor is told to stay consistent with
- **sources:** the real learning resources the content was checked against
- **fixed items:** self-report, assessment probes, final-check items in two counterbalanced forms, and an optional bonus item, each with an answer key, option rationales and misconception tags
- **visual suggestions** for the generated steps

To add a topic, add a file. To switch topics for a test, change which files are present (or a list in `server/tutor/topics/index.ts`). No other code changes are needed.

**Long-term direction:** topics live in a database of carefully generated topics, each mapped back to real, vetted learning resources, so learners don't depend on the model getting answers right. The topic files are the prototype version of that.

**Subjects outside the library:** Tutor falls back to generating the items. These sessions are flagged `itemSource: "generated"` in the logs and excluded from the learning analysis. Test scripts use library topics only.

## Topics

### Statistics: base rates in a positive test result (`stats.base_rates`)

Screening-test problems: Bayes reasoning without the formula.

- **Why it works for a test:** most non-experts get it wrong, and in 20 minutes they can learn a better method: count 1,000 people and see where the positives come from.
- **Misconceptions:**
  - Confusing P(positive | disease) with P(disease | positive), called the *inverse fallacy*.
  - Ignoring how rare the condition is, called *base-rate neglect*.
  - "It's 50/50."
- **Visuals:** an icon array of 1,000 dots, or a frequency tree.
- **Learning model:**
  - L0: inverse fallacy
  - L1: knows rarity matters but can't combine the numbers
  - L2: computes the answer with counts
  - L3: predicts how a change in base rate shifts the answer
- **Source note:** the evidence that counts are easy to teach comes from Gigerenzer & Hoffrage (1995).

### Social science: the bystander effect (`social.bystander`)

Latané and Darley's diffusion of responsibility and their decision model of helping.

- **Why it works for a test:** non-experts usually explain inaction by personality, and the theory replaces that with situational causes that can be taught in a few minutes.
- **Misconceptions:** blaming character instead of the situation (tag: `dispositional`), and "more people means more help from each person" (tag: `additive`).
- **Visuals:** a five-box decision flowchart (notice, interpret, take responsibility, know how, act), and a graph of helping against group size.
- **Learning model:**
  - L0: personality only
  - L1: names one situational cause
  - L2: tells diffusion of responsibility apart from misreading others' calm ("pluralistic ignorance")
  - L3: maps a new scenario onto a decision step and designs an intervention
- **Accuracy caveat:** CCTV studies (Philpot et al., 2020) find that someone usually does intervene in real public conflicts. Items and steps are about *each person's* likelihood, and must not claim that crowds make help less likely overall.

## Fixed items

- **Fixed, not generated:** assessment probes and final-check items come from the topic file. Generated checks would change from person to person, so a gain couldn't be told apart from a change in item difficulty. The 3 teaching steps stay generated, because they're the feature under test, but they're told to stay consistent with the topic's vetted notes.
- **Counterbalanced:** Form 1 gives the A items in the assessment and the F items in the final check. Form 2 gives the reverse. Sessions alternate forms.
- **Opening message:** the test script's opening problem uses different numbers or a different scenario from A1. When Tutor is offered, Claude's answer is not shown first (the offer replaces it), so the assessment measures what the learner knows before any explanation.
- **Confidence:** each check question has a "How sure are you?" control: *Sure / Think so / Guessing*.
- **Freeform scoring:** 0, 1 or 2 points. In the workbook, 2 = correct, 1 = partially correct and 0 = incorrect. Check items also record a misconception tag.

### `stats.base_rates`

**S0 (self-report, not scored):** "Which part of base rates feels confusing?"
- (a) Which numbers to use
- (b) Why the answer isn't just the accuracy
- (c) How much the condition's rarity matters
- (d) Not sure

**A1 (MC, Apply):** 1 in 100 people have a condition. The test detects 90% of people who have it. It also wrongly flags 9% of people who don't. Someone tests positive. Roughly what's the chance they have it?
- A) About 90%: `inverse_fallacy`
- B) About 50%: `fifty_fifty`
- **C) About 9%** (correct). Per 1,000 people, there are 9 true positives against 89 false ones.
- D) About 1%: `base_rate_only`

**A2 (freeform, Understand):** A friend says, "The test is 90% accurate, so my positive result means I almost certainly have it." What's missing from their reasoning?
- 2 points: says the condition is rare, so false positives from the large healthy group outnumber the true ones.
- 1 point: mentions false positives or rarity, but doesn't connect them.
- 0 points: anything else.

**F1 (MC, near transfer, parallel to A1):** 2% of job applicants fake their credentials. A background check flags 95% of fakers and wrongly flags 10% of honest applicants. An applicant is flagged. Roughly what's the chance they faked?
- A) About 95%: `inverse_fallacy`
- **B) About 16%** (correct). 19 flagged fakers against 98 flagged honest applicants.
- C) About 2%: `base_rate_only`
- D) About 90%: `one_minus_fpr`

**F2 (freeform, parallel to A2):** A news story says a border lie-detector is "90% accurate, so most travellers it flags are lying." Fewer than 1 in 1,000 travellers lie about anything serious. What's wrong with the conclusion?
- Same rubric as A2.

**P1 (optional bonus after the final check, not in the gain score):**
- **Embedded resource:** "If a second, independent test is done, use the chance after the first positive as the new 'how common'."
- **Question:** The person in A1's scenario tests positive again on an independent test. Roughly what's the chance now?
  - A) 9%
  - **B) About 50%** (correct). About 8.3 true positives against 8.2 false ones.
  - C) 81%
  - D) 99%

### `social.bystander`

**B0 (self-report, not scored):** "Which part of the bystander effect feels confusing?"
- (a) Why groups change behaviour
- (b) What the theory predicts
- (c) How it applies to real life
- (d) Not sure

**A1 (MC, Understand):** A man collapses on a crowded train platform. Is any *one* person there more or less likely to step in than the only other person on an empty platform?
- A) More likely, because crowds make people braver: `additive`
- **B) Less likely, because responsibility feels shared and others' calm suggests it's not an emergency** (correct)
- C) About the same, because it depends on what kind of person you are: `dispositional`
- D) Less likely, because people in crowds are selfish: `moral`

**A2 (freeform, Analyze):** A car is smoking by a busy road and dozens of drivers pass without stopping. Explain why.
- 2 points: two situational mechanisms (diffusion of responsibility, others' calm read as "no emergency", not noticing, not knowing how to help).
- 1 point: one mechanism.
- 0 points: personality only, tagged `dispositional`.

**F1 (MC, near transfer, parallel to A1):** "Can someone cover my 2pm shift? Urgent." It's posted in a 60-person channel. Compared with sending it as a DM to one coworker, is any one person in the channel more or less likely to reply?
- A) The same, because it depends on how helpful each person is: `dispositional`
- B) More likely, because people want to look good in public: `additive`
- **C) Less likely, because everyone can assume someone else will reply, and others' silence suggests it's handled** (correct)
- D) Less likely, because big teams care less: `moral`

**F2 (freeform, parallel to A2):** A faint alarm sounds in an open-plan office and a little smoke comes from a vent. Everyone glances around and keeps working. Explain why.
- Same rubric as A2.

**P1 (optional bonus):**
- **Embedded resource:** a 3-sentence description of *audience inhibition*, meaning people hold back because they're afraid of looking foolish.
- **Question:** "Any questions?" is met with silence in a lecture of 300, though many students are lost. Use both ideas to explain it, and suggest one change.
- 2 points: uses audience inhibition plus one earlier mechanism, and the change targets a mechanism (anonymous questions, calling on a specific person, pair discussion).
- 1 point: does one of the two.
- 0 points: neither.

## Learning signal

**Computing it:**
- Score each item as a fraction of its maximum: MC is 0 or 1, freeform is 0, 0.5 or 1.
- Pre = mean of the assessment probes. Post = mean of the paired final-check items.
- **Gain = post − pre** for each participant. Show every participant's pair, not just the mean.

**Most informative views:**
1. Wrong-to-right and right-to-wrong counts on each item pair.
2. Misconception change: the distractor or tag chosen before vs. after.
3. Freeform level change, on the L0–L3 learning models.
4. Confidence vs. accuracy on checks.

Report the paired effect size (mean difference / SD of differences) as descriptive only. Don't report p-values or normalized gain.

**What would change the plan:**
- **More than 70% correct on A1 at pre:** the probes are too easy. Revise them before drawing conclusions.
- **Any right-to-wrong case:** review that generated step and the transcript.

**Can claim:** whether the items discriminate, which misconceptions are present and whether they shift, and where the flow breaks down.

**Can't claim:**
- That Tutor caused the gain. With no comparison group, time on task, the practice effect of retesting, and the opening Claude answer are confounded.
- That results generalize to a wider population.
- Anything about other topics.

## Delayed check

At wrap-up, Tutor asks the learner whether they'll do a short check-in in 3–7 days.

- **If yes:** when they come back to the conversation 3 or more days later, Tutor offers a 3–5 minute delayed check: a third parallel version of each probe (Form C, *items to be drafted*) plus the P1 item.
- **Recording:** results are logged as `delayed_check_answer` events.
- **Expect** some participants not to return, and report that.

## Event log

`server/data/tutor-events.json` is append-only and written only through `server/tutor/repo.ts`. Participants are identified by the user ID already in the chat, so no separate participant ID is needed.

```ts
type TutorPhase = "offer" | "scoping" | "assessment" | "step" | "final_check" | "bonus" | "wrap_up" | "more_practice" | "delayed_check";
type Base = {
  id: string; ts: string;                 // ISO
  sessionId: string; conversationId: string; userId: string;
  topicId?: string;                       // e.g. "stats.base_rates"
  form?: 1 | 2;
  phase: TutorPhase; stepIndex?: number;  // 0–2 during steps
};

type TutorEvent = Base & (
  | { type: "offer_shown"; trigger: "keyword" | "detected" }
  | { type: "offer_response"; choice: "voice" | "text" | "declined" }
  | { type: "mode_changed"; from: "voice" | "text"; to: "voice" | "text"; reason: "user" | "fallback" }
  | { type: "battery_generated"; part: "assessment" | "steps_and_final"; itemSource: "fixed" | "generated"; latencyMs: number }
  | { type: "item_shown"; questionId: string; itemKey?: string; // e.g. "stats.A1"
      role: "practice" | "check" | "self_report"; parallelOf?: string }
  | { type: "answer_submitted"; questionId: string; itemKey?: string;
      role: "practice" | "check" | "self_report"; kind: "multiple_choice" | "freeform";
      attempt: number; response: string;
      result?: "correct" | "partial" | "incorrect"; score?: 0 | 1 | 2;
      misconceptionTag?: string; msSinceShown: number;
      confidence?: "sure" | "think_so" | "guessing" } // checks only
  | { type: "reveal"; questionId: string; via: "show_me" | "show_answer" | "auto_after_two_misses" }
  | { type: "explain_my_thinking"; questionId: string }
  | { type: "chat_turn"; messageId: string;        // text stays in conversations.json
      speaker: "learner" | "tutor"; origin: "typed" | "voice" | "workbook_event";
      activeQuestionId?: string; activeRole?: "practice" | "check" }
  | { type: "step_completed"; mastered: boolean; attempts: number; revealed: boolean; durationMs: number }
  | { type: "summary_submitted"; chars: number }
  | { type: "delayed_check_consent"; consented: boolean }
  | { type: "session_exit"; reason: "exit_button" | "complete"; atQuestionId?: string }
  | { type: "session_resumed" }
  | { type: "delayed_check_answer"; itemKey: string; response: string; score: 0 | 1 | 2; daysAfter: number }
);
```

- `chat_turn.activeRole` flags chat help given during check items. Score checks with and without those items, and check the tutor's replies for leaked answers.
- Time per step and chat turns per step are computed from these events rather than logged separately.

## Moderator sheet

**Metrics:**
- Pre and post scores, item-pair changes, and misconception tags before and after
- Confidence vs. accuracy on checks
- First-try success on practice steps (target ~80%) and the number of reveals
- Chat turns during checks, and any leaked answers
- Time per phase, how far they got, and the P1 score
- The wrap-up summary, scored on the L0–L3 levels as a third measure
- Prior knowledge from the intake: any stats course, and whether they'd heard of the bystander effect

**Qualitative:**
- **Item validation:** with the first 2–3 participants, ask "how did you get that?" after each check item.
- **Quality of learner questions:** 0 = fishing for the answer, 1 = about the procedure, 2 = about the concept.
- Whether they understood the difference between practice and checks.
- Where they looked (chat or workbook) and whether they used the visual.
- Problems with voice mode.
- Satisfaction last, labelled secondary.

**Validity threats:**
- Novelty and the moderator being present
- Retesting on parallel items
- Pre-test scores at the ceiling
- Generated steps varying between participants
- Mistaking a finished session or a high chat-turn count for learning

**Scheduling:** in ~60-minute sessions, run both topics in counterbalanced order. Otherwise, alternate topics between participants.
