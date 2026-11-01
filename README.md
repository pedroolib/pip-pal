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
npm run dev
```

## Where things live

| Path | What | Owner |
|---|---|---|
| `src/shared/` | Contract: Zod schemas, IPC API, fixtures, and `mock-api.ts` (fixture-backed API used until the real one exists, and in a plain browser). **Change only through a PR all three devs review.** | All |
| `src/main/` | Electron main: windows, hotkey, capture, storage. `mock.ts` serves the mock over IPC until real handlers replace it, one by one. | A |
| `src/main/` (AI files) | Claude + Jev calls, PII scrubbing, cache fallback. | B |
| `src/renderer/` | React UI. Call main through `api` from `@renderer/api`. Theme tokens in `assets/main.css`, UI text in `locales/en.json`. Also runs in a plain browser on the fixtures. | C |
| `src/shared/fixtures/*.json` | Sam's profile and demo data; plain JSON, editable without code. | D |

Add shadcn components with `npx shadcn@latest add <name>`, then fix the `cn` import to `@renderer/lib/utils` if the CLI gets it wrong.
