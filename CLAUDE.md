@AGENTS.md

# LifeOS

A gamified personal growth tracker: log activity, get streaks, achievements and charts. Next.js (App Router), React, TypeScript, Tailwind, Zustand, Zod. [README.md](README.md) covers behaviour and the integrations.

## Commands

```bash
npm test                               # Vitest
npx vitest run src/lib/engine/streaks.test.ts   # one file
npm run lint
npx tsc --noEmit                       # type check (no npm script)
npm run build                          # output goes to node_modules/.cache/next, not .next
npm run build:static                   # hosted site, into out/
```

## Running it locally

- The LaunchAgent `local.lifeos` may already be serving the production build on port 3000. Check with `npm run service:status`. After a code change it needs `npm run service:restart`, which rebuilds.
- `.env.local` holds Firebase keys and the Library sign-in, so a local copy that is signed in reads and writes real data. Use demo mode to try changes, and don't reset, import or delete in the real account.

## Two ways it runs

| | Local (Mac) | Hosted (Firebase Hosting) |
| --- | --- | --- |
| Build | `next build` | `LIFEOS_STATIC=1` static export |
| Server | API routes in `src/app/api` | none |
| Anki and Library | server routes, browser as fallback | browser only |

- Anything new must work in the static build, or be hidden when `NEXT_PUBLIC_STATIC` is set.
- With Firebase keys set, data syncs to Firestore (`src/lib/cloud.ts`). Without them it saves to the data file through `/api/data`. `src/lib/file-sync.ts` handles both, so check both paths when changing sync.
- `scripts/build-static.sh` moves `src/app/api` aside while building and puts it back. Check it is still there if a build is killed.
- `/goals/[id]` is exported as one placeholder page (`_`) and reads the real id from the URL. `firebase.json` rewrites to it.
- `next.config.ts` reads public keys from the sibling folders `../Library` and `../anki-analytics`.

## Code layout

- `src/lib/engine`: plain TypeScript, no React. Streaks, achievements, parsing, reviews and imports belong here, with tests beside them.
- `src/lib/store.ts`: Zustand store. Data changes go through its `update` helper, which saves in order.
- `src/lib`: sync, storage, migration and integrations.
- `src/components`: UI. `src/app` pages are thin wrappers.

## Rules

- Streaks and achievements are derived from logs, never stored.
- Dates are local `YYYY-MM-DD` strings (`ISODate`), not UTC instants. Use `engine/dates.ts`.
- Changing the saved data shape means bumping `version` (`types.ts`, `defaults.ts`, the schema in `io.ts`) and adding a step in `migrate.ts`, so old data and backups still load.
- Integration imports must be safe to repeat, and hand-logged entries win over imported ones.
- Card text, book ratings, reviews, prices and passwords stay out of LifeOS data.
- API routes answer only local requests (`isLocalRequest`). Routes that change something also require `x-requested-by: lifeos`.

## Deploying and the public repo

- The repository is public: no secrets, emails or personal data in code, tests or logs.
- `scripts/send-reminders.ts` runs on GitHub Actions from the pushed branch, so a push that touches it or what it imports from `src/lib` changes live reminders.
- `npm run deploy:web` publishes the site and `firestore.rules`. Ask before running it.
- `LifeOS.command` runs `git pull` on start, so what is pushed to `main` reaches users.
