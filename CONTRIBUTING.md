# Contributing to Haunt

Thanks for your interest in contributing to Haunt.

## Getting Started

```bash
git clone <repo-url> haunt && cd haunt
pnpm install
pnpm build
pnpm test
```

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Ensure `pnpm build`, `pnpm test`, and `pnpm lint` all pass
4. Submit a pull request

## Code Style

- Strict TypeScript. `noImplicitAny`, `strictNullChecks`, all on.
- No `any` without a comment explaining why.
- Prefer explicit return types on exported functions.
- ESLint + Prettier for formatting. Run `pnpm lint` before committing.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`

## Domain Vocabulary

Haunt uses specific terms from its fiction. Please use them consistently:

| Use | Don't use |
|-----|-----------|
| Guest | User |
| Resident | Agent, Bot |
| Room | Node, Channel |
| Affordance | Tool, Widget |
| Place | App, Environment |

## Testing

- Vitest, colocated as `.test.ts` next to source
- Mock external services with `MockModelProvider`
- Don't hit real LLMs in CI

## What to Work On

- Check open issues for `good first issue` labels
- The [adapter guide](docs/guides/writing-an-adapter.md) describes how to connect new backends
- The [character guide](docs/guides/writing-a-character.md) explains how to create new residents

## Architecture

Read these before making structural changes:

1. `README.md` — what and why
2. `docs/ARCHITECTURE.md` — core primitives and interfaces
3. `docs/ROADMAP.md` — build phases
4. `CLAUDE.md` — working conventions

If your change affects the public interfaces in `@hauntjs/core/src/types.ts`, open an issue to discuss before submitting a PR.
