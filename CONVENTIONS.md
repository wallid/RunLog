# Conventions

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <short summary>
```

The scope is optional; the summary is imperative and lower-case, with no full
stop. PRs are squash-merged with the PR title as the commit message, so the
**PR title** is what has to follow this format — a workflow checks it.

### Types

| Type | Use for |
|---|---|
| `feat` | A new capability a user can see — a widget, a parser, a setting |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting and visual polish with no behaviour change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | A performance improvement |
| `test` | Adding or correcting tests |
| `build` | Build system or dependency changes |
| `ci` | Workflow and automation changes |
| `chore` | Everything else that touches no `src/` behaviour |

### Scopes

Use the directory the change lives in: `parsers`, `model`, `widgets`, `shell`,
`viz`, `state`, `library`, `i18n`, `tour`, `upload`, `observability`. A change
that spans several can omit the scope.

### Examples

```
feat(widgets): add grade-adjusted pace card
fix(parsers): tolerate FIT files with a truncated final record
docs: explain the fixture re-projection
ci: deploy to Cloudflare Pages on push to main
```

### Breaking changes

Append `!` after the type (`feat!:`) and explain the break in the body. For a
browser app with no consumers of its code this mostly means storage-schema
changes that invalidate saved runs.

## Branching

Trunk-based development. `main` is always releasable and every push to it
deploys to the official site. Work happens on short-lived branches named
`<type>/<slug>` (`feat/route-flythrough`, `fix/gpx-timezones`) that merge back
within a day or two — if a branch is growing old, split the work.
