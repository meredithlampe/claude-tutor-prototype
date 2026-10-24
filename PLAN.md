# Plan: Simplified Claude Web App Prototype

A lightweight clone of the Claude browser chat app, used as a base for prototyping a new feature. Connects to the real Claude API; persistence and backend services are mocked/simplified.

## Open decisions

1. **App shell** — Vite + React + small Express server (recommended) vs. Next.js App Router.
   - Vite + Express: plain React, minimal framework surface, easy to throw away. Two processes behind one `npm run dev`.
   - Next.js: API routes colocated, matches usual stack, but heavier than needed here.
2. **Markdown rendering** — add `react-markdown` + `remark-gfm` for assistant messages. Without it, responses (including code blocks) render as plain text.
3. **Refusal fallbacks** — enable the server-side `fallbacks: "default"` beta on API calls, or keep the call minimal.

## Stack

- React 18 + TypeScript + Vite
- Tailwind + shadcn/ui (Button, Textarea, DropdownMenu, ScrollArea, Avatar, Card, Tooltip, Separator)
- `lucide-react` icons (shadcn default)
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
- Check `stop_reason` for `refusal` before rendering content
- Optional server-side fallbacks (see open decision 3)

## Out of scope (this pass)

- Auth (single hard-coded user)
- Search, Projects, Artifacts pages; file attachments; voice
- Light mode (theme tokens are set up as CSS variables, but only dark is styled)
- Mobile layout polish
- Tests beyond typecheck + lint scripts

## Build order

1. Scaffold Vite + Tailwind + shadcn; dark theme tokens matched to the screenshot
2. Server: Express, JSON repo, seed data, conversation routes
3. Sidebar + home view (static)
4. Composer → chat view with streaming
5. Extract all copy to `constants/content.ts`; lint/type pass
