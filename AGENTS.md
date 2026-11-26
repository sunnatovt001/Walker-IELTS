# Walker IELTS

After implementing and verifying requested repository changes, commit those changes and push them to `origin/main`, unless the user requests a different branch or asks to keep the changes local. Use a normal push and verify the commit reached `main`.

## Architecture

- `public/` is the browser UI. `app.js` handles navigation and interactions, `style.css` the visual system, and `reading-pdf.js` extracts CD Reading drafts locally in the browser.
- `server.js` contains the Node.js HTTP handler, API logic, and libSQL schema and queries. `oauth.js` handles social sign-in, and `reading.js` validates and scores CD Reading. `api/walker.js` exposes the handler to Vercel.
- The demo and local server use SQLite via libSQL. Production uses Turso. `vercel.json` defines routing and the build, and `scripts/build-assets.js` prepares the browser PDF dependency.

## Native Codex agents

| Agent | Assignment | Expected handoff |
| --- | --- | --- |
| `frontend` | Browser UI, navigation, accessibility and responsive layouts | Changed files and browser checks |
| `backend` | API contracts, validation, authentication and server behavior | Compatibility notes and API verification |
| `database` | SQLite and Turso schema, queries and data integrity | Migration impact and isolated database checks |
| `ai-data` | PDF extraction, structured Reading drafts and scoring data | Fixture results and extraction or scoring limits |
| `security` | Defensive security assessment | Prioritized findings with file references and remediation |
| `qa` | Regression tests and end-to-end coverage | Reproduction steps, results and coverage gaps |
| `review` | Independent correctness and maintainability review | Actionable findings with file and line references |
| `devops` | Build, Vercel routing and deployment readiness | Build and routing verification, deployment implications |

### Coordination

1. The parent agent defines the acceptance checks, maps dependencies, and assigns each task an agent, an exact write scope, a baseline, and an expected handoff. Run independent work in parallel with at most six active subagents. The parent is the only dispatcher. Subagents report additional work to the parent.
2. Assign one writer per file at a time. Unassigned files are read-only. When tasks share `server.js`, `public/app.js`, or the same API or data contract, agree on the contract first. Sequence shared edits or have one owner apply them. Agents may read shared files while another agent owns the edits. Use isolated fixtures and unique ports for parallel test runs.
3. Security and code review start in report-only mode. They can inspect code and run non-mutating checks. Route fixes to the owning implementation agent. QA may edit only explicitly assigned test files and uses a fresh demo database for write-path checks.
4. Each agent returns its summary, changed files, commands and outcomes, and any remaining risks or blockers. The parent reviews the diff and resolves overlap, then runs `npm run check`, `npm run build`, and the relevant integration flows before committing. Use a fresh temporary `WALKER_DATA` directory and `WALKER_DEMO=1` for local smoke tests. Use test credentials and data. Keep production secrets and learner data out of prompts, fixtures, and logs.
5. The parent coordinates commits and push. Subagents do not commit, push, deploy, or change production configuration independently. The repository push instruction above applies after the parent verifies the result.

### Using the agents

Open Codex from the trusted repository root. Name the custom roles in a request to the parent, for example:

> Use `frontend` and `backend` in parallel once the API contract is agreed. Give them separate file scopes. Then run `qa` and `review` on the integrated diff.

For a single role, ask for its name and scope, such as “Use `security` in report-only mode to review OAuth.” In the interactive CLI, use `/subagents` to inspect and switch among spawned threads. Use the parent thread to pass follow-up instructions, interrupt obsolete work, and inspect the integrated result. Adjust the task and write scope before reassigning work.

The concurrency setting targets Codex CLI `0.172.0-alpha.2`. Start a new session from the trusted repository after changing these profiles. The report-only rule is an instruction to Security and Review. For a separately sandboxed audit, start a dedicated `codex --sandbox read-only` session and ask for the relevant role.
