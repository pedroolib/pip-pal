# Pip

Electron desktop companion for autistic adults in their first year of work. It keeps their professional profile alive and uses it to decode vague work messages, especially announced changes.

Read before working: `docs/PLAN.md` (what we build, by when, who owns what), `docs/DECISIONS.md` (why, plus technical notes per module) and `GLOSSARY.md` (the words we use). Research sources are in `docs/research/`; visual references are in `docs/design/`.

## Rules

- `src/shared/` is the contract between main, preload and renderer. Change it only through a PR that all three devs review.
- Privacy is the product: only text the person selected, or answered in onboarding after the disclosure, leaves the machine, always after PII scrubbing; summaries are filtered by recipient in code, not in the prompt; Pip never sends anything on its own.
- The renderer talks to main only through `api` from `@renderer/api`, never `window.api` directly. In a plain browser (no preload, e.g. Factory review on localhost:3000) it falls back to the fixture-backed mock in `src/shared/mock-api.ts`.
- API keys live only in the main process (env vars), never in the renderer or the repo.
- The overlay is click-through except over Pip's surfaces: a shadcn `Card` counts automatically; mark any other clickable overlay piece (the Pip character, pills) with `data-overlay-hit` (see `src/renderer/src/click-through.ts`).
- All UI text goes in `src/renderer/src/locales/en.json` (i18next); no hard-coded strings.
- Harbor theme only, via the CSS variables in `src/renderer/src/assets/main.css`. No red or yellow. Respect `prefers-reduced-motion`.
- shadcn for interactive pieces, plain Tailwind for visual ones. After `npx shadcn add`, fix the `cn` import to `@renderer/lib/utils` if the CLI gets it wrong.
- Every AI suggestion carries its `why` (anti-masking).
- Gates: `npm run typecheck`, `npm run lint`, `npm run build`.
