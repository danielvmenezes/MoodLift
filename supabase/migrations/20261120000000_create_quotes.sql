-- Uplifting quotes, each traceable to a verified source. Mood tags come later
-- in a separate join table (a quote can support several moods).
create table public.quotes (
  id bigint generated always as identity primary key,
  slug text not null unique,
  text text not null check (length(text) between 1 and 600),
  form text not null check (form in ('prose', 'verse')),
  author text not null,
  work text,
  translator text,
  citation text,
  source_name text not null,
  source_url text not null,
  verified_by text not null check (verified_by in ('primary_text', 'reference')),
  rights text not null check (rights in ('public_domain', 'copyrighted')),
  created_at timestamptz not null default now()
);

comment on table public.quotes is 'Uplifting quotes; wording verified against source_url.';
comment on column public.quotes.verified_by is 'primary_text: found verbatim in the original work; reference: a cited entry in a reliable quotation reference.';

-- Same quote twice with different punctuation/case is a duplicate.
create unique index quotes_text_normalised_key
  on public.quotes (lower(regexp_replace(text, '[^[:alnum:]]', '', 'g')));

alter table public.quotes enable row level security;

-- Anyone may read; no insert/update/delete policies, so clients can't write.
create policy "quotes are readable by everyone"
  on public.quotes for select
  to anon, authenticated
  using (true);

grant select on public.quotes to anon, authenticated;

-- A random batch, skipping quotes the viewer has just seen.
create function public.random_quotes(n int default 20, exclude bigint[] default '{}')
returns setof public.quotes
language sql
stable
security invoker
set search_path = ''
as $$
  select *
  from public.quotes
  where id <> all (exclude)
  order by random()
  limit least(greatest(n, 1), 50);
$$;

revoke execute on function public.random_quotes(int, bigint[]) from public;
grant execute on function public.random_quotes(int, bigint[]) to anon, authenticated;
