# MoodLift — TODO

Development roadmap for the MoodLift web app. Status as of 15 Nov 2026.

**Stack:** Next.js (App Router, TypeScript), Supabase (database + auth), Vercel (hosting), Figma (UI). Next.js alone covers what React + Vite would; no separate Vite setup.

**Timeline:** prototype weeks 4–6 · mood expression & content weeks 7–8 · usability weeks 9–10 · reviews & beta test week 11 · final report weeks 12–13.

---

## Milestone 1 — MVP

Track the user's current mood and show a quote suited to it.

- [x] Next.js app scaffold
- [x] Quote page: quote card, "new quote" button, unlimited undo
- [x] Long quotes scale to fit the card; page never scrolls
- [x] Responsive layout (phone, tablet, desktop), covered by Playwright e2e tests
- [x] Dark, comforting base theme (no harsh bright screens)
- [x] Bottom navigation bar (draft UI)
- [x] Icons from a standard library (Lucide), no generated graphics
- [ ] Mood selection page (Figma: *Mood selection* screen)
- [ ] Interface changes to match the selected mood
- [ ] Quotes filtered by the selected mood (currently random across all)
- [ ] Wire bottom nav to routes (Mood / Quotes / Journal)
- [x] Supabase project + `quotes` table (text, author, work, source, verification, rights, form; moods to come in a join table)
- [x] Load quotes from Supabase instead of `src/lib/quotes.ts` (bundled quotes kept as offline fallback)
- [ ] Deploy to Vercel (add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` env vars)
- [ ] Credits/attribution page: Wikiquote text is CC BY-SA, and `rights = 'copyrighted'` quotes are used as short quotations
- [ ] "Not professional help" notice with a pointer to professional / crisis resources

## Milestone 2 — Interaction & curation

- [ ] Quote collection and categorisation pipeline
  - [x] Gather ~2,000 verified quotes (Wikiquote sourced entries, Wikisource/Gutenberg primary texts; `scripts/quotes/`)
  - [ ] Mood tagging (friend), stored in a `quote_moods` join table
  - [ ] Classify by mood with an open-source sentiment model or a lightweight LLM (advisor suggested Jiffy AI) rather than a large LLM
  - [ ] Mental health collaborator reviews quotes for relevance and appropriateness
- [ ] Supabase Auth
- [ ] Favourite button and a personal saved-quotes area
- [ ] Community / metrics page (e.g. most-favourited quotes this week)
- [ ] Quote of the Week: dev-curated, with a fun fact about its origin
- [ ] Journal
  - [ ] Private entry about a quote (the Journal button on the quote page opens this)
  - [ ] Optional toggle to share an entry to the community page
  - [ ] Row-level security so entries are readable only by their owner unless shared

## Milestone 3 — UI polish

- [ ] Per-mood colour palettes chosen with colour theory to lift each mood
- [ ] Light / dark mode
- [ ] Review the UI against wellness-app conventions for users in low moods
- [ ] Usability fixes from beta testing

## Beta test (week 11)

- [ ] Stable build on Vercel for at least 8 target users
- [ ] Link to the feedback form from the app
- [ ] Target: average usability and emotional-helpfulness score ≥ 7/10

---

## Needs decision

- **Mood set.** The plan is 4 moods (Anxiety, Burnout, Overwhelm, Sadness), to be finalised after the survey and collaborator input (scope allows 4–6). The current placeholder quotes cover burnt out, sad, anxious, lonely, tired and unmotivated.
- **Mood picker style.** The pitch describes a colourful, Kahoot-style picker, but the UI direction and advisor favour a darker, comforting look. Agree on how bright the picker and per-mood palettes should be.
- **Quote rights.** Copyrighted authors (e.g. Steinbeck, Oliver, Lamott) are fine in small numbers. A database of thousands needs a sourcing and attribution policy, especially if quotes come from public APIs.

## Constraints

- Supportive wellness tool only: no medical advice or diagnosis.
- Web app only, no native app; needs an internet connection.
- Free tiers of Supabase and Vercel. The advisor expects this to handle the project's scale comfortably (~10 concurrent users).
