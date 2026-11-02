# Lessons
- Tell builders that `.factory/jobs/` is gitignored: give absolute job-folder paths, and have WP1 builders run `git checkout main -- src/shared/fixtures` after any prettier/lint --fix so fixtures stay untouched.
- Briefs for any code that sends text off-machine should state the PII rules up front (replacer functions not template strings, case-insensitive, trimmed names, one pass for all names); round 1 found all three the hard way.
- UX testers on the plain-browser build can't confirm persistence and hit state bugs (collapsed sections unmounting open editors). Ask UI builders to keep editor state mounted when a container collapses, and give testers a single-session script.
- Briefs for name/PII scrubbing must list the real-world name shapes up front (two-letter names, hyphens, curly apostrophes, @handles/underscores, NFKC/zero-width, names that are common words) and say tests must use multi-word names and a date-plus-time string; two review rounds were spent finding these one batch at a time.
- Builders cannot see the job folder: ask orchestrator-side for `wp-N.build.md` content in the final message and write it myself, so the approver can audit assumptions.
- Remove finished builder worktrees (inside .claude/worktrees) before running lint, or eslint reports their copies as errors.
