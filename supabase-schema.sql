-- ═══════════════════════════════════════════════════════════════════════
-- we. — Supabase séma (v0.2 előkészület)
--
-- HASZNÁLAT:
-- 1. Supabase Dashboard → SQL Editor → New query
-- 2. Másold be ezt a fájlt és futtasd
-- 3. Az URL-t és anon-kulcsot rakd be a config.js-be (még nem létezik)
-- ═══════════════════════════════════════════════════════════════════════

-- Párok (egy páros = egy sor)
create table if not exists pairs (
  id uuid primary key default gen_random_uuid(),
  pair_code text unique not null check (length(pair_code) = 6),
  pici_name text,
  pici_born_at timestamptz default now(),
  created_at timestamptz default now(),
  -- a két fél azonosítója (kliens-oldali random ID, nem auth user)
  member_a text not null,
  member_b text,
  -- v0.3: közös szint-választás a Mai kérdéshez
  preferred_level text default 'kozepes' check (preferred_level in ('konnyu', 'kozepes', 'mely'))
);

-- Idempotens migrate: ha már létezik a tábla, csak hozzáadjuk a mezőt
alter table pairs add column if not exists preferred_level text default 'kozepes';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pairs_preferred_level_check') then
    alter table pairs add constraint pairs_preferred_level_check
      check (preferred_level in ('konnyu', 'kozepes', 'mely'));
  end if;
end $$;

-- v0.6: saját pool-ok (mind a két telefonon ugyanazok)
alter table pairs add column if not exists custom_pools jsonb default '{}'::jsonb;

-- v0.8: utolsó belépési idő mindkét félnek (presence "ma volt itt" jelzéshez)
alter table pairs add column if not exists last_seen jsonb default '{}'::jsonb;

-- ════════════════════════════════════════════════════════════════════
-- v0.10 — Strukturált jegyzetek (vagyak bővítés)
-- ════════════════════════════════════════════════════════════════════
-- A "vágy" mostantól általánosabb "jegyzet": kategóriával, opcionális
-- dátummal, időhorizonttal. A Csillám buborék néha emlékeztet rájuk.

alter table vagyak add column if not exists category text default 'egyeb';
alter table vagyak add column if not exists target_date date;
alter table vagyak add column if not exists time_tag text default 'anywhen';
alter table vagyak add column if not exists last_surfaced_at timestamptz;

-- ════════════════════════════════════════════════════════════════════
-- v0.9 — Csillám buborék-üzenetek
-- ════════════════════════════════════════════════════════════════════
-- type: 'hala' (késleltetett) | 'hangulat' (azonnal) | 'gondolok' (azonnal)
-- delivery_at: amikor megjelenik a buborékban (lehet jövő = késleltetett)
-- expires_at: amikor levevhetjük a buborékból (NULL = következő buborékig)

create table if not exists csillam_messages (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  author_id text not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz default now(),
  delivery_at timestamptz not null,
  expires_at timestamptz
);

create index if not exists csillam_messages_pair_delivery on csillam_messages (pair_id, delivery_at desc);

alter publication supabase_realtime add table csillam_messages;
alter table csillam_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'csillam_messages' and policyname = 'open_csillam_messages') then
    create policy "open_csillam_messages" on csillam_messages for all using (true) with check (true);
  end if;
end $$;

-- Suttogások (csak az aktuális — egyszerre egy él)
create table if not exists whispers (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  text text not null check (length(text) <= 80),
  from_member text not null,
  sent_at timestamptz default now()
);

-- Feladat-napló (mindkét fél naplója, a párhoz kötve)
create table if not exists feladat_log (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  task_id text not null,
  task_text text not null,
  done_by text not null,
  done_at timestamptz default now(),
  note text
);

-- Vágyak / közös bakancslista
create table if not exists vagyak (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  text text not null,
  note text,
  done_at timestamptz,
  created_by text not null,
  created_at timestamptz default now()
);

-- Megbeszélt kérdések (Naplónk → Kérdések)
create table if not exists kerdesek (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  question text not null,
  question_id text,                  -- pl. "konnyu_3" — pool-azonosító
  level text check (level in ('konnyu', 'kozepes', 'mely')),
  note text,
  discussed_by text,                 -- aki rányomta a "megbeszéltük" gombot
  discussed_at timestamptz default now()
);

-- Idempotens migrate v0.2 → v0.3
alter table kerdesek add column if not exists question_id text;
alter table kerdesek add column if not exists discussed_by text;

-- ─── Realtime engedélyezés ─────────────────────────────────────────────

-- Engedélyezzük a realtime-ot a suttogásokon és a feladatokon
-- (a Dashboard → Database → Replication menüben is be kell állítani)
alter publication supabase_realtime add table pairs;
alter publication supabase_realtime add table whispers;
alter publication supabase_realtime add table feladat_log;
alter publication supabase_realtime add table vagyak;
alter publication supabase_realtime add table kerdesek;

-- ════════════════════════════════════════════════════════════════════
-- v0.5 — „Mit mondana a másik" táblák
-- ════════════════════════════════════════════════════════════════════

create table if not exists mit_mondana_sessions (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  question_id text,
  question text,
  date text,
  created_at timestamptz default now(),
  initiator_id text,
  revealed_at timestamptz,
  note text
);

-- egy páros napi 1 session-t kap maximum (race-védelem)
create unique index if not exists mit_mondana_sessions_pair_date
  on mit_mondana_sessions (pair_id, date);

create table if not exists mit_mondana_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references mit_mondana_sessions(id) on delete cascade,
  member_id text not null,
  guess text,
  actual text,
  completed_at timestamptz default now()
);

-- egy session alá member_id-nként 1 válasz
create unique index if not exists mit_mondana_responses_session_member
  on mit_mondana_responses (session_id, member_id);

-- realtime
alter publication supabase_realtime add table mit_mondana_sessions;
alter publication supabase_realtime add table mit_mondana_responses;

-- nyitott RLS (a többi táblához hasonlóan)
alter table mit_mondana_sessions enable row level security;
alter table mit_mondana_responses enable row level security;
create policy "open read mm sessions" on mit_mondana_sessions for select using (true);
create policy "open write mm sessions" on mit_mondana_sessions for insert with check (true);
create policy "open update mm sessions" on mit_mondana_sessions for update using (true);
create policy "open delete mm sessions" on mit_mondana_sessions for delete using (true);
create policy "open read mm responses" on mit_mondana_responses for select using (true);
create policy "open write mm responses" on mit_mondana_responses for insert with check (true);
create policy "open update mm responses" on mit_mondana_responses for update using (true);
create policy "open delete mm responses" on mit_mondana_responses for delete using (true);

-- ════════════════════════════════════════════════════════════════════
-- v0.7 — Csapat-funkciók (Hála / Hangulat / Ölelés / Rád gondolok / Híd)
-- ════════════════════════════════════════════════════════════════════

create table if not exists team_activities (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  activity_type text not null,
  date text not null,
  state jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Egy páros napi 1 aktivitás-példányt kap aktivitás-típusonként
create unique index if not exists team_activities_pair_date_type
  on team_activities (pair_id, date, activity_type);

alter publication supabase_realtime add table team_activities;

alter table team_activities enable row level security;
create policy "open read team activities" on team_activities for select using (true);
create policy "open write team activities" on team_activities for insert with check (true);
create policy "open update team activities" on team_activities for update using (true);
create policy "open delete team activities" on team_activities for delete using (true);

-- ─── Row Level Security ────────────────────────────────────────────────

-- Egyelőre nyilvános (tesztidő alatt). v0.3-ban: párkód-alapú szigorítás.
alter table pairs enable row level security;
alter table whispers enable row level security;
alter table feladat_log enable row level security;
alter table vagyak enable row level security;
alter table kerdesek enable row level security;

-- v0.2: nyitott olvasás+írás (mert még nincs auth, csak párkód)
create policy "open read pairs" on pairs for select using (true);
create policy "open write pairs" on pairs for insert with check (true);
create policy "open update pairs" on pairs for update using (true);

create policy "open read whispers" on whispers for select using (true);
create policy "open write whispers" on whispers for insert with check (true);
create policy "open delete whispers" on whispers for delete using (true);

create policy "open read feladat_log" on feladat_log for select using (true);
create policy "open write feladat_log" on feladat_log for insert with check (true);

create policy "open read vagyak" on vagyak for select using (true);
create policy "open write vagyak" on vagyak for insert with check (true);
create policy "open update vagyak" on vagyak for update using (true);

create policy "open read kerdesek" on kerdesek for select using (true);
create policy "open write kerdesek" on kerdesek for insert with check (true);
create policy "open update kerdesek" on kerdesek for update using (true);
create policy "open delete kerdesek" on kerdesek for delete using (true);

-- FONTOS: ezt v0.3-ban szigorítsuk, ha publikussá tesszük
