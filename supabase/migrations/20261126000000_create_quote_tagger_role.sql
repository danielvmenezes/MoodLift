-- A login for tagging quotes by mood from an outside tool (database GUI,
-- script) without handing out the admin `postgres` password. It can read
-- quotes and moods and add, change or remove rows in quote_moods. Nothing
-- else: no edits to quotes or moods, no schema changes.
--
-- Created without a password; the project owner sets one in the SQL editor:
--   alter role quote_tagger with password '...';
-- Connect through the Session pooler with the username
-- quote_tagger.<project-ref>. To revoke access: drop role quote_tagger
-- (after dropping its policies) or `alter role quote_tagger nologin`.
create role quote_tagger with login noinherit;

grant usage on schema public to quote_tagger;
grant select on public.quotes, public.moods, public.quote_moods to quote_tagger;
grant insert, update, delete on public.quote_moods to quote_tagger;

-- RLS is on for all three tables, so the role needs its own policies.
create policy "quote_tagger reads quotes"
  on public.quotes for select to quote_tagger using (true);
create policy "quote_tagger reads moods"
  on public.moods for select to quote_tagger using (true);
create policy "quote_tagger reads quote moods"
  on public.quote_moods for select to quote_tagger using (true);
create policy "quote_tagger adds quote moods"
  on public.quote_moods for insert to quote_tagger with check (true);
create policy "quote_tagger changes quote moods"
  on public.quote_moods for update to quote_tagger using (true) with check (true);
create policy "quote_tagger removes quote moods"
  on public.quote_moods for delete to quote_tagger using (true);
