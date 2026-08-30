# Work Permit

Turns a goal or vision statement into RAG-grounded, spec'd, test-planned, security-reviewed units of work sized for a day's human review - ready for Claude Code to build against.

See [VISION.md](./VISION.md) for the full pipeline design and the trust-staging model this tool applies to itself.

## Decisions

- [0001: RAG stack for Epic 3](./docs/decisions/0001-rag-stack.md) - Voyage AI embeddings, LanceDB, Claude Citations, tree-sitter chunking, no orchestration framework, and why.

Status: pre-build. See the [project board](https://github.com/users/ironfis1/projects/3) for epics and the current build sequence.

## Development

```bash
npm install
npx work-permit --help
npx work-permit --version
```

- `npm run lint` - ESLint, including a security-aware ruleset (`eslint-plugin-security`) enforced as a hard gate, not advisory.
- `npm test` - runs the Vitest suite once.
- `npm run test:watch` - Vitest in watch mode.

CI (`.github/workflows/ci.yml`) runs lint and tests on every push and pull request to `main` and fails the build on either failing.

### Source layout

```
src/
  cli.js         CLI entrypoint (Commander)
  config/        Story 1.2 - target-repo config + read-access validation
  intake/        Story 1.3 - goal/vision intake
  decompose/     Epic 2 - decomposition engine
  rag/           Epic 3 - RAG corpus & retrieval
  spec/          Epic 4 - spec generation
  gaps/          Epic 5 - gap detection & escalation
  tests-gen/     Epic 6 - test plan & test generation
  compliance/    Epic 7 - standards compliance check
  output/        Epic 8 - output adapter (GitHub issues)
  trust/         Epic 9 - trust staging & audit trail
```

Folders are scaffolded ahead of the epics that fill them in, so later stories are drop-ins rather than restructures.

## Configuration

Point work-permit at the repo it should operate against with a `.work-permit.json` file in your working directory:

```json
{
  "targetRepo": "owner/repo",
  "outputRepo": "owner/other-repo",
  "standardsCorpus": "./standards"
}
```

- `targetRepo` (required) - the codebase later stages ground specs against. Either a local path (`.`, `./relative/path`, `/abs/path`, `~/path`) or a GitHub `owner/repo` reference.
- `outputRepo` (optional) - where finished issues land once Epic 8 exists. Defaults to `targetRepo`.
- `standardsCorpus` (optional) - override path for the OWASP/style-guide corpus used from Epic 3 onward. Defaults to the built-in corpus location once that exists.

The config file itself must never contain an auth token - `work-permit` rejects an unrecognized field (including anything token-like) rather than silently accepting it. For a GitHub `owner/repo` reference, set the `GH_TOKEN` environment variable if the repo needs authenticated read access (see `.env.example`); local paths need no token.

Validate a config before using it:

```bash
npx work-permit config validate
npx work-permit config validate --config path/to/other-config.json
```

`config validate` confirms the target resolves and is readable - for a local path, that it exists and is a git repo; for a GitHub reference, that the API returns it and a default branch. Errors name the specific problem (missing field, path not found vs. not a git repo, repo not found vs. no GitHub access vs. not authenticated) rather than a generic failure.

Node's built-in `fetch` doesn't read `HTTP_PROXY`/`HTTPS_PROXY` on its own; `config validate` wires in a proxy-aware dispatcher automatically when those env vars are set, so it also works unmodified in a proxied sandbox/CI environment.
