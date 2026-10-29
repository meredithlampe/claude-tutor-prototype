# Chat transcript: Anthropic research on how people use Claude to learn

*Exported 2026-10-29. Messages are shown in order. Tool calls (web searches and page fetches) are summarized in brackets, not reproduced.*

---

## User — Fri 2026-10-23, 12:48 PM

does anthropic have any publicly available research about how people use claude to learn things? maybe related to education labs team, higher ed, socrating method mode

## Claude

*[Ran web searches on the Anthropic Education Report, Learning mode, and Anthropic education research]*

Yes, there are a few public pieces. The main ones:

**1. Anthropic Education Report: How university students use Claude (April 2025).** This is the core usage study. Anthropic used Clio, its privacy-preserving analysis tool, to look at 1 million anonymized conversations from Claude.ai accounts tied to university email addresses. Findings:
- The most common use was creating and improving educational content across disciplines, at 39.3% of conversations.
- Computer Science students made up 36.8% of student conversations but only 5.4% of U.S. bachelor's degrees.
- It sorted student behavior into four interaction patterns. These were roughly direct versus collaborative, crossed with problem-solving versus output creation.
- It also flagged cases where students might be using Claude to get around academic honesty, such as asking for answers to test questions.

**2. Anthropic Education Report: How educators use Claude (August 2025).** This is the follow-up on the faculty side. It's based on about 74,000 educator conversations, along with qualitative research done with Northeastern. Curriculum development was the top use. Academic research and assessing student performance came second and third.

**3. Learning mode (the Socratic piece).** This launched with Claude for Education in April 2025. In this mode Claude asks questions instead of answering directly, has students give evidence for their conclusions, and points out the fundamental concepts of a topic. Columbia's write-up says the design came from student advisory board feedback asking for features that support deeper learning. Learning modes later expanded beyond the education plan, including two in Claude Code. One of them inserts #TODO markers where you're supposed to write the code yourself.

**4. AI and skill formation.** I didn't pull this one up in search, so check it yourself. As far as I know, Anthropic published a randomized study in early 2026 on developers learning a new coding library with and without AI help. It found that people who leaned heavily on AI scored worse on mastery, while people who used it to ask conceptual questions did better. It's the closest thing to a learning-outcomes study, as opposed to a usage study.

On the team: education work sits under Anthropic's Beneficial Deployments group. Drew Bent leads education there. His podcast interviews are a good source for context beyond the reports.

Sources:
- [Anthropic Education Report: How university students use Claude](https://anthropic.com/news/anthropic-education-report-how-university-students-use-claude)
- [InfoDocket: How Educators Use Claude](https://www.infodocket.com/2025/08/26/just-released-anthropic-education-report-how-educators-use-claude/)
- [eWeek: Claude for Education Learning Mode](https://www.eweek.com/news/anthropic-claude-learning-mode/)
- [CO/AI: Claude learning modes](https://getcoai.com/?p=80053)
- [Columbia CUIT: Introduction to Anthropic and Claude](https://etc.cuit.columbia.edu/news/ai-community-practice-introduction-anthropic-and-claude)
- [Edtech Insiders podcast with Drew Bent](https://edtechinsiders.buzzsprout.com/1877869/episodes/17679410)

---

## User — Fri 2026-10-23, 7:04 PM

The 'how university students use claude' article mentions four behaviors: Direct Problem Solving, Direct Output Creation, Collaborative Problem Solving, and Collaborative Output Creation.

summarize each behavior and provide a concrete example

## Claude

I'll pull the article so the summaries and examples match what it actually says.

*[Fetched the Anthropic Education Report article]*

The report sorts conversations along two axes:

- **Mode:** In a **Direct** conversation, the student wants an answer as fast as possible. In a **Collaborative** conversation, they go back and forth with Claude to reach their goal.
- **Desired outcome:** **Problem Solving** means looking for a solution or explanation. **Output Creation** means producing something longer, like an essay or a presentation.

The four combinations showed up at roughly equal rates, each between 23% and 29% of conversations. The article lists each pattern's sample topics in a chart image I couldn't read, so the examples below are my own illustrations. Where possible I based them on the requests the article describes in its text.

**1. Direct Problem Solving.** The student wants the answer to a specific question, with little discussion. Example: a student pastes a probability homework problem and asks for the answer. The report notes this pattern is ambiguous. The same kind of conversation could be cheating on a take-home exam, or a student checking their work on a practice test. Concerning cases it found include requests for answers to machine learning multiple-choice questions.

**2. Direct Output Creation.** The student asks Claude to produce a finished piece of work in one go. Example: "Write a 1,000-word essay on the causes of World War I," or "Summarize this 30-page reading into study notes." This is ambiguous too. It could mean writing an essay from scratch, or building summaries for further research. One concerning case it found was rewriting marketing and business texts to get past plagiarism detection.

**3. Collaborative Problem Solving.** The student works through a problem over several turns. They ask follow-ups, test their own understanding, and refine it. Example: a CS student debugging a data structures assignment. They share the error, Claude asks what they expected the code to do, and they trace through it together until the student finds the bug. The report warns that collaborative doesn't automatically mean good for learning. A multi-turn session solving statistics homework with explanations can still hand off a lot of the thinking to the AI.

**4. Collaborative Output Creation.** The student and Claude build a longer piece together over many turns. Example: a student drafts a thesis statement, gets feedback, revises their outline, writes a section, and asks Claude to critique the argument. The student stays the author throughout. This pattern was dominant in Education: Output Creation made up 74.4% of conversations there, but the researchers suspect some of those were teachers making lesson plans.

The overall takeaway is that nearly half (~47%) of student conversations were Direct, meaning the student wanted answers or content with little engagement. That finding is part of why Anthropic built the Socratic Learning mode.

Sources:
- [Anthropic Education Report: How university students use Claude](https://www.anthropic.com/research/anthropic-education-report-how-university-students-use-claude)

---

## User — Thu 2026-10-29, 10:23 AM

Can you copy the transcript of this chat into this folder?

## Claude

*[Saved this transcript to the "chat transcripts" folder]*
