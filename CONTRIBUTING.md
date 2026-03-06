# Contributing to KnotCode

Thanks for your interest in contributing! This guide will get you up and running.

## Getting Started

1. Fork the repo and clone your fork
2. Follow the setup instructions in [DEVELOPMENT.md](DEVELOPMENT.md)
3. Create a branch for your change

## Development Workflow

```bash
# 1. Create a branch
git checkout -b feat/my-feature

# 2. Make your changes, then verify
pnpm lint          # eslint
pnpm check         # tsc --noEmit
pnpm test          # vitest

# 3. Commit and push
git add .
git commit -m "feat: add my feature"
git push -u origin feat/my-feature

# 4. Open a PR against main
```

## Branch Naming

| Prefix      | Use for                                 |
| ----------- | --------------------------------------- |
| `feat/`     | New features                            |
| `fix/`      | Bug fixes                               |
| `docs/`     | Documentation changes                   |
| `chore/`    | Maintenance, deps, CI                   |
| `refactor/` | Code restructuring (no behavior change) |
| `test/`     | Adding or updating tests                |

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add dark mode toggle
fix: prevent crash on empty file tree
docs: update keyboard shortcuts table
chore: bump vitest to v4
refactor: extract diff logic into shared util
test: add coverage for edit-parser
```

## Code Style

ESLint and Prettier run automatically via pre-commit hooks. You can also run them manually:

```bash
pnpm lint          # check for issues
pnpm format        # auto-format all files
```

Key conventions:

- TypeScript strict mode — no `any` unless justified
- Colors via CSS theme variables, never hardcoded
- `@iconify/react` for all icons (Lucide set)
- `pnpm` only — never npm or yarn

## Secret Scanning

This repo uses `gitleaks` for local hooks and CI history scanning with a versioned baseline at `.gitleaks.baseline.json`.

Install `gitleaks` once:

```bash
# macOS
brew install gitleaks

# Windows (scoop)
scoop install gitleaks

# Or download from https://github.com/gitleaks/gitleaks/releases
```

Useful commands:

```bash
pnpm secrets:scan          # full git history scan (uses baseline)
pnpm secrets:scan:staged   # staged changes scan (hook mode)
pnpm secrets:baseline      # regenerate baseline intentionally
```

Incident response and privacy guidance lives in [docs/SECURITY.md](docs/SECURITY.md).

## Testing

Write tests for any `lib/` changes. Tests live in `__tests__/` and use [Vitest](https://vitest.dev/).

```bash
pnpm test          # run once
pnpm test:watch    # watch mode
pnpm test:coverage # with coverage report
```

## Pull Requests

- Keep PRs small and focused — one concern per PR
- Fill out the PR template (it's short, promise)
- Make sure CI passes before requesting review
- Add screenshots for any UI changes

## Issues

Use the issue templates when filing bugs or requesting features. For bugs, include:

- Steps to reproduce
- Expected vs actual behavior
- Environment (macOS Desktop / Web Browser)

## Code of Conduct

Be kind, be constructive, be respectful. We're all here to build something great together.
