# Pip

A desktop companion that keeps a person's professional profile alive and uses it day to day. Read the full plan first: [docs/PLAN.md](docs/PLAN.md).

## Setup

```bash
npm install
npm run dev
```

## Where things live

| Path | What | Owner |
|---|---|---|
| `src/shared/` | Contract: Zod schemas, IPC API, fixtures. **Change only through a PR all three devs review.** | All |
| `src/main/` | Electron main: windows, hotkey, capture, storage. `mock.ts` serves fixtures until real handlers replace it. | A |
| `src/main/` (AI files) | Claude + Jev calls, PII scrubbing, cache fallback. | B |
| `src/renderer/` | React UI. Theme tokens in `assets/main.css`, UI text in `locales/en.json`. | C |
| `src/shared/fixtures/*.json` | Sam's profile and demo data; plain JSON, editable without code. | D |

Add shadcn components with `npx shadcn@latest add <name>`, then fix the `cn` import to `@renderer/lib/utils` if the CLI gets it wrong.
