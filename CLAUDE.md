# GotchiGarden — project notes for Claude

Read this at the start of every session working in this repo.

## What this project is

GotchiGarden is a webpage Taylor built and uses. This repo (`margioldparadise`,
owned by `daewoomarigold` on GitHub) is a from-scratch rewrite/overhaul of an
earlier version of the site.

> TODO (Taylor): fill in what GotchiGarden actually does — the core concept,
> main features, who uses it — so future sessions don't have to ask. A couple
> of sentences is enough.

## Stack

- React + Vite (JavaScript, not TypeScript)
- No CSS framework chosen yet — plain CSS until told otherwise
- Node 20 (matches the deploy workflow)

## Hosting / deployment

- Hosted on GitHub Pages at `https://daewoomarigold.github.io/margioldparadise/`
- Deploys automatically via `.github/workflows/deploy.yml` on every push to
  `main` (builds with Vite, publishes `dist/` through GitHub Pages)
- `vite.config.js` sets `base: '/margioldparadise/'` to match the Pages URL —
  if the repo is ever renamed, update this too
- One manual one-time step (if not already done): in the repo's Settings →
  Pages, set Source to "GitHub Actions"

## Database

- The previous version used Supabase.
- Supabase has known issues that need fixing, but that work is intentionally
  **not** part of this initial rewrite/setup. Don't touch or reintroduce
  Supabase integration unless Taylor explicitly asks for it.

## Working across devices

Taylor works on this project through Cowork (cloud sessions), not a locally
installed Claude Code CLI, often from different devices. Each session gets a
fresh, empty container, so:

- At the start of a session, clone this repo before doing anything else.
- Commit and push before the session ends (or after any meaningful chunk of
  work) — nothing should be left only in the session's container, since it
  won't exist next time.
- Don't assume `node_modules` or any local state carries over between
  sessions. Re-run `npm install` after cloning.

## Conventions

> TODO (Taylor): add anything you want followed consistently — naming,
> folder structure, commit message style, code style preferences, etc.
