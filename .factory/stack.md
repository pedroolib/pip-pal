# Stack: pip-pal (Pip)
Profiles: webdev
Run: npm run dev  (web apps must serve on http://localhost:3000 during review; renderer port pinned to 3000 in electron.vite.config.ts)
Gates:
- npm run typecheck
- npm run lint
- (no test command yet)
- npm run build
Always escalate:
- Database migrations, auth and session code, payment code, deploy config
- src/main/ and src/preload/ (Electron main process, IPC, preload security boundary)
- src/shared/ (IPC contracts shared by main and renderer)
- electron-builder.yml (packaging)
- Dependency changes (package.json dependencies)
- Privacy: anything that sends data off the machine (API calls to Claude or Jev) and the PII scrubbing code

## webdev
- UI library: shadcn/ui (components.json; MCP `ui-kit` = shadcn)
- Database: none
- Styling: Tailwind CSS v4 + shadcn, "Harbor" theme
- App must serve on http://localhost:3000 during review
- Electron app: in a plain browser the preload `window.api` is absent; reviewers see the renderer only
