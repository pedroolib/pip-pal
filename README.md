# Pip

A desktop companion that keeps a person's professional profile alive and uses it day to day.

## Read first

| Doc | What it answers |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | What we build, the demo script, who owns what, the day-by-day calendar |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why each decision was made, alternatives rejected, technical notes per module |
| [docs/research/](docs/research/) | The interview with Specialisterne, the concept, the post-interview plan and the challenge rubric (Markdown, with the original PDFs) |
| [docs/design/](docs/design/README.md) | Visual references, how the task card maps to shadcn/Tailwind, the Pip redesign brief |

## Setup

```bash
npm install
npm run fetch:whisper
npm run dev
```

`fetch:whisper` downloads the speech model once (about 80 MB, not in git). Only voice capture needs it, and packaging needs it first. Copy `.env.example` to `.env` for the API keys; set `PIP_DEMO=1` to start with Sam's demo data instead of onboarding.

Gates: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## What Pip does

| Feature | How |
|---|---|
| One shortcut | `Ctrl+Shift+Space` (`Control+Shift+Space` on a Mac). **With text selected:** the triage bubble appears next to the cursor; each button opens its own card (steps, questions, change plan). **With nothing selected:** Pip's menu opens at the cursor with five choices: Pip's Home, Let Pip listen, Check-In, Tell Pip and Remember Pip. Pip no longer falls back to the last thing you copied; on a Mac without Accessibility permission the menu says it could not read the selection. With typed text in an open card the shortcut does nothing, so the text is never lost. On Windows, with a terminal in front Pip does not press Ctrl+C and opens the menu, so text selected in a terminal cannot be read this way (the terminal inside VS Code cannot be told apart and still gets Ctrl+C). `Ctrl+Shift+Enter` no longer does anything |
| Voice capture | Pick "Let Pip listen" in the menu, or run `pip-pal --record`. It records the microphone, computer audio or both (up to 10 min). Pip transcribes on this machine, you review the text, then the same triage runs. Pressing the shortcut with nothing selected while recording stops it |
| Tell Pip | Write or speak to Pip and press Send: it answers, says why, and offers to keep what you said as a note. Nothing is sent until you press Send |
| Reminders | "Remember Pip" in the menu, or the clock on a step card. Pip reminds you at the time you pick and keeps them on this computer; they show under "Coming up" in Pip's Home. A due reminder stays until you answer it. In the installed app, Pip starts when you log in so reminders still arrive; you can turn that off in Settings |
| Privacy | Names, emails, links, handles and phone numbers are removed before text reaches Claude, even when pasted text hides invisible characters inside or next to them. Notes you taught Pip are saved with real names on this computer and scrubbed again each time they are sent. This covers accidental leaks in normal use, not text crafted to get past it |
| Check-ins | Spoons (1–5) at the times set in Settings; few spoons means fewer steps and a calming suggestion |
| Pip's House | Home, My profile, Achievements, Summary, Connections (coming soon) and Settings |
| Onboarding | First run without `PIP_DEMO=1`: Pip's questions become suggestions you accept, edit or reject |

Open work is in [docs/PLAN.md §8](docs/PLAN.md).

## Where things live

| Path | What | Owner |
|---|---|---|
| `src/shared/` | Contract: Zod schemas, IPC API, fixtures, and `mock-api.ts` (fixture-backed API used until the real one exists, and in a plain browser). **Change only through a PR all three devs review.** | All |
| `src/main/` | Electron main: windows, hotkey, capture, storage. `mock.ts` serves the mock over IPC until real handlers replace it, one by one. | A |
| `src/main/` (AI files) | Claude + Jev calls, PII scrubbing, cache fallback. | B |
| `src/renderer/` | React UI. Call main through `api` from `@renderer/api`. Theme tokens in `assets/main.css`, UI text in `locales/en.json`. Also runs in a plain browser on the fixtures. | C |
| `src/shared/fixtures/*.json` | Sam's profile and demo data; plain JSON, editable without code. | D |

Add shadcn components with `npx shadcn@latest add <name>`, then fix the `cn` import to `@renderer/lib/utils` if the CLI gets it wrong.
