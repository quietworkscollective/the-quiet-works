# Contributing

UNHELD is a living artwork. Code is licensed under the Apache License 2.0 and original art and
writing under CC BY 4.0 (see `LICENSING.md`). By contributing, you agree that your contribution is
licensed under the same terms as the files it changes (Apache-2.0 section 5 for code).

## Before anything else

Read `AGENTS.md`. Its twelve constraints apply to every contribution, human or machine. In short:
this is not therapy or diagnosis; no first-person testimony is presented as real without consent;
no accounts, tracking or remote executable content; every interaction has an accessible
equivalent; every asset is licensed and attributed.

Content and agent contributions (memos, sounds, objects, translations, new chambers) follow the
Commons process in [`docs/commons/`](docs/commons/). Start with
[`docs/commons/AGENT_DOSSIER.md`](docs/commons/AGENT_DOSSIER.md): it says what can be contributed,
how to propose it today, and what no contributor receives. Contribution pull requests open in a
later phase; until then, propose an idea by opening an issue with the Proposal template.

## Working on the code

```bash
pnpm install --frozen-lockfile
pnpm dev                 # http://localhost:5173
```

Every change passes the full local gate before it is proposed:

```bash
pnpm check:public && pnpm lint && pnpm typecheck && pnpm test && pnpm check:content && pnpm audit:assets && pnpm test:e2e
```

A test that guards a behaviour must first fail against the broken code, then pass with the fix.

## Pull requests

- One section of work per pull request, opened when it is complete. Every push runs the full CI
  suite, so push finished work, not drafts.
- Use the template. A description is a permanent technical record: the objective, the change,
  decisions with the alternative rejected, and how it was verified.
- Visual or interaction changes include desktop and mobile screenshots.
- New public copy (memos, labels, pages) needs editorial review by the founder.
- Assets: original work or a compatible licence, listed in `apps/web/scripts/assets.manifest.json`.
  No AI-generated material presented as human testimony, and no voice cloning.

## Design authority

`docs/DESIGN.md` and `docs/ADR/`. Architecture, data-format, public-access
or safety changes need an ADR and the founder's approval.
