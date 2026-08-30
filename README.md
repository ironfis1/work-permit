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
