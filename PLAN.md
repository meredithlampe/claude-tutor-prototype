# Plan: Simplified Claude Web App Prototype

A lightweight clone of the Claude browser chat app, used as a base for prototyping a new feature. Connects to the real Claude API; persistence and backend services are mocked/simplified.

The feature under test, Tutor mode, is planned separately in `TUTOR-PLAN.md` and kept separate from the clone in code.

## Decisions

1. **App shell** — Vite + React client with a small Express server. Plain React, minimal framework surface, easy to throw away. Two processes behind one `npm run dev`.
2. **Markdown rendering** — `react-markdown` + `remark-gfm` for assistant messages, so formatting and code blocks render properly.
3. **Refusal fallbacks** — off for now. API calls stay minimal; refusals are surfaced to the user as-is.

## Stack

- React 19 + TypeScript + Vite
- Tailwind + shadcn/ui (Button, Textarea, DropdownMenu, ScrollArea, Avatar, Card, Tooltip, Separator, Sheet for the mobile sidebar drawer)
- `lucide-react` icons (shadcn default)
- `react-markdown` + `remark-gfm` for rendering assistant messages
- Express + `@anthropic-ai/sdk` server; API key in `.env` (`ANTHROPIC_API_KEY`)
- Mock database: JSON files in `server/data/`, accessed through a small repository module so it can be swapped later without touching routes

## Structure

```
client/
  src/
    components/
      ui/                # shadcn-generated
      sidebar/           # Sidebar, NavItem, ConversationList, UserFooter
      home/              # Greeting, RecentArtifacts
      chat/              # Composer, MessageList, Message
    pages/               # HomePage, ChatPage
    lib/                 # api client, SSE stream parser, greeting helper
    constants/content.ts # all UI copy (nav labels, placeholders, greetings)
    types.ts
server/
  index.ts               # Express app
  routes/conversations.ts
  services/claude.ts     # SDK call + streaming
  repo/                  # JSON-file read/write
  data/
    conversations.json   # seeded pinned + recent chats
    artifacts.json       # seeded artifact cards
    user.json            # name, plan
```

## Features in scope

### Sidebar
- Nav items: New, Search, Projects, Artifacts, Scheduled, Customize, More. Only **New** is functional; the rest are visual stubs.
- Pinned and Recents lists from `conversations.json`
- User footer (name, plan)
- Collapse toggle

### Home view
- Time-of-day greeting ("Afternoon, Meredith") with logo mark
- Composer: auto-growing textarea; Enter to send, Shift+Enter for newline. `+`, mic, and voice buttons are stubs.
- Below composer: Project dropdown (stub) and static model label ("Opus 5.5 Medium")
- Recent artifacts: 3 cards from `artifacts.json` with placeholder thumbnails

### Chat view (`/chat/:id`)
- Sending from home creates a conversation, adds it to Recents, and navigates to the chat view
- Message list with streamed assistant responses
- Composer pinned to bottom
- Title: truncated first user message (no extra API call)

### Server API
- `GET /api/conversations`
- `GET /api/conversations/:id`
- `GET /api/artifacts`
- `GET /api/user`
- `POST /api/conversations/:id/messages` — appends the user message, streams Claude's reply via SSE, persists the final message

### Claude API call
- Model `claude-opus-5-5`, `output_config.effort: "medium"`, adaptive thinking, streaming
- Check `stop_reason` for `refusal` before rendering content; show a simple refusal notice (no fallback model)

## Visual spec

Reference screenshot: `docs/reference/claude-home.png` (dark theme home screen).

- **Sidebar** (~380px desktop, slightly lighter warm grey than main):
  - Top row: collapse icon button, "Claude" serif wordmark, and two small icon toggles on the right (chat / code, stubs).
  - Nav with lucide icons: New (Plus, highlighted pill), Search, Projects, Artifacts, Scheduled (Clock), Customize, More (Ellipsis).
  - **Pinned** (caret header): Interviewing, Work Wife (project icon), Deploying password-protected prototypes, Birdhouse website proposal deck (chat-bubble icon). Long titles truncate.
  - **Recents** (caret header): Untitled, Browser page request, Historical context research, Photopea layer background color, Downloading a graphic (file icon), Untitled, Ridgewood NY hair colorists, Seattle backyard landscaping (file icon).
  - Footer: avatar "M", "Meredith · Pro" with chevron, and a device icon button.
- **Main, vertically centered:**
  - Terracotta asterisk-burst logo (~`#D97757`, inline SVG) and a large serif greeting: "{Morning|Afternoon|Evening}, Meredith".
  - Composer card (~20px radius, lighter bg, subtle border, max-width ~880px) with placeholder "How can I help you today?". `+` on the left; mic with chevron and a voice-waveform button on the right.
  - Below the composer: "Project ▾" on the left; "Opus 5.5" plus muted "Medium", then "Manual", on the right.
  - "Recent artifacts" with a "View all" link, and 3 cards with placeholder thumbnails: "Anthropic Interview Prep — Full Stack Engineer, Education Labs" (Oct 21), "Backyard Blueprint" (Oct 8), "Solo Wireframe" (Sep 14).
  - Top-right corner: small icon button (stub).
- **Fonts:** a free Google serif close to Claude's (e.g. Source Serif 4) for the wordmark and greeting; sans for everything else.
- **Chat view:** user messages right-aligned in a muted bubble; assistant messages left-aligned and rendered as markdown.

## Implementation notes

- **Workspace:** root `package.json` with `client/` and `server/`. `npm run dev` runs both via `concurrently`. Vite proxies `/api` to Express. Server runs TS via `tsx`.
- **Routing:** `react-router-dom` for `/` and `/chat/:id`.
- **Env:** load `.env` with Node's `--env-file` (no dotenv). Commit `.env.example` only.
- **Conversation record:** `id`, `title`, `pinned`, `icon`, `messages[]`, `createdAt`, `updatedAt`. `POST /api/conversations` creates one with the title set to the first message truncated to ~40 chars.
- **SSE events:** `{type:"text",text}`, `{type:"done"}`, `{type:"refusal"}`, `{type:"error"}`. The client parses the `fetch` POST body with a small reader in `client/src/lib/` (EventSource can't POST). Abort the API stream if the client disconnects. Persist text content only.
- **Claude SDK usage** (`server/services/claude.ts`):

  ```ts
  const stream = client.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    messages, // Anthropic.MessageParam[]
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") { /* send SSE text */ }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") { /* send refusal */ }
  ```

  - Don't send `temperature`, `top_p`, or `top_k`: they return a 400.
  - Use SDK types, not custom ones.
  - Catch typed `Anthropic.APIError` subclasses.
- **Scripts:** `dev`, `build`, `typecheck`, `lint`. Add a short README with setup steps. Lint includes `eslint-plugin-jsx-a11y`.

## Out of scope (this pass)

- Auth (single hard-coded user)
- Search, Projects, Artifacts pages; file attachments; voice
- Light mode (theme tokens are set up as CSS variables, but only dark is styled)
- Mobile layout polish
- Unread dots on pinned items
- Tests beyond typecheck + lint scripts

## Build order

1. Scaffold Vite + Tailwind + shadcn; dark theme tokens matched to the screenshot
2. Server: Express, JSON repo, seed data, conversation routes
3. Sidebar + home view (static)
4. Composer → chat view with streaming
5. Extract all copy to `constants/content.ts`; lint/type pass
