-- The four moods MoodLift covers, and which quotes help each one.
-- A quote can help several moods. Tags are added by hand in the Supabase
-- table editor; `reviewed` is ticked once a second person has checked one.
create table public.moods (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  sort_order smallint not null
);

insert into public.moods (slug, name, sort_order) values
  ('anxiety', 'Anxiety / overthinking', 1),
  ('burnout', 'Burnout / mental fatigue', 2),
  ('overwhelm', 'Overwhelmed / pressure', 3),
  ('sadness', 'Sadness / feeling down', 4);

create table public.quote_moods (
  quote_id bigint not null references public.quotes (id) on delete cascade,
  mood_id smallint not null references public.moods (id) on delete cascade,
  reviewed boolean not null default false,
  primary key (quote_id, mood_id)
);

comment on column public.quote_moods.reviewed is 'true once the tag has been checked by a reviewer.';

-- Look up quotes by mood without scanning the whole join table.
create index quote_moods_mood_id_idx on public.quote_moods (mood_id, quote_id);

alter table public.moods enable row level security;
alter table public.quote_moods enable row level security;

create policy "moods are readable by everyone"
  on public.moods for select to anon, authenticated using (true);
create policy "quote moods are readable by everyone"
  on public.quote_moods for select to anon, authenticated using (true);

grant select on public.moods, public.quote_moods to anon, authenticated;
