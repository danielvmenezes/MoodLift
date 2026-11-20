# MoodLift

A small web app that shows one uplifting quote at a time. Tap the circle for another quote, tap undo to go back. Built with Next.js 16 (App Router, TypeScript), backed by Supabase and deployed on Vercel.

## Running locally

```bash
npm install
npm run dev   # http://localhost:3000
```

Create `.env.local` with the project's Supabase URL and publishable key (Supabase dashboard → Project Settings → API Keys):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Without them the page still works and shows a small bundled set of quotes.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
npx playwright test                  # all viewports; reuses a running `npm run dev`
npx playwright test --project=mobile # one viewport
```

The e2e suite pins down the layout: the page never scrolls, the card and buttons never move between quotes, quotes stay legible over the animated background, and every quote in the data set fits the smallest (320px) card.

## Quotes

Quotes live in the `quotes` table in Supabase (schema in `supabase/migrations/`). Anyone can read it; nothing can write to it through the public API. The page loads a random batch per visit and keeps a queue topped up in the background, so a tap never waits on the network.

The data set is about 1,900 quotes from around 190 writers. The source of truth is `data/quotes/quotes.json`, and every entry records where its wording was checked:

- `primary_text`: found word for word in the original work (Wikisource, Project Gutenberg, or the author's own published transcript).
- `reference`: a cited entry in a Wikiquote "Sourced" section. Disputed, misattributed, attributed and "quotes about" sections are never used.

Anything that can't be traced to a source is left out. That includes popular lines that are commonly misattributed. Quotes are not tagged by mood yet.

### Rebuilding the data set

The pipeline in `scripts/quotes/` runs with plain Node 24:

```bash
node scripts/quotes/harvest-wikiquote.ts   # candidates from each author's sourced quotes
# pick quotes → data/quotes/selection.json (plus data/quotes/manual.json for hand-checked ones)
node scripts/quotes/verify.ts              # checks every pick, writes quotes.json and rejected.json
node --env-file=.env.local scripts/quotes/load.ts   # syncs the table to quotes.json
```

`data/quotes/excluded.json` lists quotes dropped after review, each with the reason: doubtful attribution, unsuitable content, or too long for the card. Loading needs a server-only `SUPABASE_SECRET_KEY` in `.env.local`. Never give it a `NEXT_PUBLIC_` prefix.

Wikiquote text is CC BY-SA, so a credits page is still to do. See `TODO.md` for the roadmap.

## Deploying

Vercel needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set as environment variables. The secret key isn't needed there.
