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
  member_b text
);

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
  level text check (level in ('konnyu', 'kozepes', 'mely')),
  note text,
  discussed_at timestamptz default now()
);

-- ─── Realtime engedélyezés ─────────────────────────────────────────────

-- Engedélyezzük a realtime-ot a suttogásokon és a feladatokon
-- (a Dashboard → Database → Replication menüben is be kell állítani)
alter publication supabase_realtime add table pairs;
alter publication supabase_realtime add table whispers;
alter publication supabase_realtime add table feladat_log;
alter publication supabase_realtime add table vagyak;

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

-- FONTOS: ezt v0.3-ban szigorítsuk, ha publikussá tesszük
