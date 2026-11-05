# LifeOS

A gamified personal growth tracker. Log what you do, and LifeOS turns it into streaks, achievements, charts and a record of how far you've come.

Every number on screen is computed from what you logged. Nothing is hardcoded, and a new account starts at zero.

## Run it

Double-click **`LifeOS.command`** in Finder. It installs what it needs, builds the app when the code has changed, starts it at http://localhost:3000 and opens your browser. It runs for as long as the Terminal window stays open, so close the window to stop it, or use **`Stop LifeOS.command`**.

The first double-click gives the launcher its icon and hides its `.command` extension (Git can't store either, so it sets them on itself). Drag it to the right-hand side of the Dock for one-click launching. If macOS says it can't be opened, right-click it and choose **Open** once. Its log is `.lifeos/server.log`.

Keep the address the same: your data lives in the browser under `localhost:3000`, so a different port would show an empty account.

For development:

```bash
npm install
npm run dev
```

Then open http://localhost:3000. For the production build, use `npm run build && npm start`.

```bash
npm test        # Tests for streaks, parsing, reviews, imports, migrations and backups
npm run lint
```

If the project sits in an iCloud-synced folder such as Documents, iCloud can move dependencies to the cloud and commands then hang. To prevent that, `npm install` marks `node_modules` to be skipped by iCloud, and builds go to `node_modules/.cache/next`. Moving the project outside Documents also solves it.

## Using it

- **Set it up your way:** pick what to track during onboarding. Add one language or several, choose a creative focus, and pick or write your own long-term roadmaps.
- **Add anything later:** New Goal has templates for languages, creative work, fitness, reading and learning, plus a fully custom option with your own metrics and measurements.
- **Log from anywhere:** press `N`, or use the gradient button. Type a sentence like "Read 25 pages", or tap through the form.
- **One tap:** the row under the dashboard hero repeats your usual session for each goal.
- **Timers** survive refreshes. Stop one and the log sheet opens with the duration filled in.
- **Rest:** set rest days or planned breaks on a goal page or in Settings. They never break a streak, and weekly targets shrink to fit.

## Your data

Data lives in this browser's IndexedDB, with localStorage as a fallback. It stays on this device and browser, and clearing site data deletes it, so export a backup regularly from Settings. A backup is a JSON file you can restore on any browser.

Demo mode stores sample data under a separate key, so it never touches your real account.

## How it works

`src/lib/engine` is plain TypeScript with no React, and it owns all the logic:

| File | Responsibility |
| --- | --- |
| `dates.ts` | Calendar maths on day numbers, safe across timezones and daylight saving |
| `streaks.ts` | Daily, specific-day and weekly streaks, rest periods, schedule history |
| `achievements.ts` | Achievement definitions and when each was earned |
| `records.ts` | Personal records and strength progress |
| `insights.ts`, `review.ts` | Rule-based insights and the weekly review |
| `parse.ts` | The quick-log sentence parser, which runs locally |
| `derive.ts` | Combines all of the above into one snapshot for the UI |

Streaks and achievements are never stored. They are recomputed from saved activity, so editing or deleting an entry corrects everything, including backdated changes.

A few decisions worth knowing:

- Each entry stores the local date it was logged on, so travelling never moves past activity to a different day.
- Changing a goal's schedule keeps the old schedule for past days, so it can't break a streak retroactively.
- A sessions-per-week target is prorated for partial weeks, such as your first week or a week with a break.
- An unfinished day or week is pending, never a miss.
- First day of the week, weight unit, and date, time and number formats follow the browser's locale. The first two can be changed in Settings.
- Saved data carries a version. `src/lib/migrate.ts` upgrades older data and backups when they load.
- Sessions with no duration get an estimate for heatmaps only. Estimates never count towards reported hours.

## Stack

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, Motion, Zustand, Zod and idb-keyval.

## Anki

LifeOS can import daily review totals from [Anki Analytics](../anki-analytics) running on the same computer. Connect it from Settings, under Integrations, and choose which deck feeds which goal. If it isn't running, LifeOS works as normal.

- Only dates, deck names, review counts and study time are read. Card text never reaches LifeOS or its backups.
- A small route, `src/app/api/anki/route.ts`, does the reading, because Anki Analytics refuses other websites. It only answers requests from this computer, and it needs the LifeOS server, so it does not work from a static host or another device.
- Imports are safe to repeat: one entry per goal per day, and a flashcard session logged by hand takes that day's place.
- Dates follow Anki's own day, so a review just after midnight can count as the day before.
- Set `ANKI_ANALYTICS_URL` if it runs somewhere other than `http://127.0.0.1:5174`.

## Not connected yet

Hevy, Apple Health and Calendar are planned extensions. None of them are integrated.
