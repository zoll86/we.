# we.

> Egy közös tér kettőtöknek.

**Aktuális verzió:** v0.7 — 5 új csapat-funkció a Mai választás keretbe (Hála-üzenet, Hangulat-megosztás, 20 másodperces ölelés, Rád gondolok, Híd-jelzés). Napi sorsolás 6 funkció között.

## ⚙️ V0.7 frissítés (ha most v0.6-ról jössz)

### 1. SQL migráció — egy új tábla

Supabase → SQL Editor → New query:

```sql
create table if not exists team_activities (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  activity_type text not null,
  date text not null,
  state jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists team_activities_pair_date_type
  on team_activities (pair_id, date, activity_type);

alter publication supabase_realtime add table team_activities;

alter table team_activities enable row level security;
create policy "open read team activities" on team_activities for select using (true);
create policy "open write team activities" on team_activities for insert with check (true);
create policy "open update team activities" on team_activities for update using (true);
create policy "open delete team activities" on team_activities for delete using (true);
```

### 2. Fájlok cseréje a repo-ban

Cserélendő:
- `app.js`, `index.html`, `style.css`, `lib/sync.js`, `sw.js`, `supabase-schema.sql`, `README.md`

A `config.js`, `data/`, `pool-peldak/` változatlan.

```bash
git add .
git commit -m "we. v0.7 — 5 csapat-funkció + Mai választás random sorsolás"
git push
```

A localStorage kulcs verziót váltottam (`we-state-v6` → `we-state-v7`), tehát mindkét telefonon **újra kell párosítani** induláskor (vagy `__we.reset()`).

## Mi az új (v0.7)

### Mai választás napi sorsolása

A Mai választás kártya most **napi 1 véletlent sorsol** a 6 funkció közül:
- Mit mondana a másik (a v0.5-ben épített kétlépcsős kérdésjáték)
- Hála-üzenet
- Hangulat-megosztás
- 20 másodperces ölelés
- Rád gondolok
- Híd-jelzés

A sorsolás **deterministic hash** a `pair_id + dátum`-ból — tehát mindkét telefon ugyanazt a funkciót látja az adott napon. Holnap új sorsolódik.

### Az 5 új funkció

#### 🌸 Hála-üzenet
„Egy konkrét dolog, amit ma a párodnál értékelsz."
- Egyikőtök írja → a másik elolvashatja → kész
- Hármas állapot: senki nem írt → írj; te írtál → várjuk hogy elolvassa; ő írt → olvass; mindkettő → megtörtént

#### 😊 Hangulat-megosztás
5 emoji választás (😊 jól · 😐 közepes · 😔 nehéz · 😴 fáradt · 🌟 csillogós).
- Mindketten választotok egyet → kártyán látszik mindkettőtöké
- Aki elsőként választ, az „A-szlot"; a másik „B-szlot"

#### 🤗 20 másodperces ölelés
- Egyikőtök megnyomja az „indítom" gombot → mindkét telefonon fut a 20→0 visszaszámláló
- A másik telefonján toast: „öleljetek 20 mp-ig ❤"
- Lejár → „megcsináltuk?" gomb → kész

#### ❤ Rád gondolok
- Egy szív gomb a kártyán
- Tap → jelzés a párodnak (toast: „ő rád gondol ❤")
- Bármikor, bárhányszor — a kártyán számláló: „ma 3-szor küldted, 2-szer kaptál"

#### 🌉 Híd-jelzés
„Valamit szeretnék veled megbeszélni, de nehéz elindulnom."
- Egyikőtök rányom a „beszélnünk kéne" gombra → a másik telefonján toast + kártya: „ő szeretne valamiről beszélni — készen állsz?"
- A másik rányom a „hallgatlak" gombra → összekötve, élőben beszéltek

### Architektúra

Egy közös tábla: `team_activities`. Minden aktivitás-példány:
- `pair_id`, `activity_type`, `date` — egyedi kulcs (egy páros napi 1 példányt kap típusonként)
- `state` (jsonb) — típus-specifikus adatok

Ez azt is jelenti, hogy a táblába jövőben még több aktivitás-típus belefér séma-változás nélkül.

## Mi szinkron

Mind az 5 funkció **valós időben** szinkron a két telefonon — bárki bármit változtat, a partneren is azonnal frissül. Toast-ekkel jelezzük a fontos eseményeket (új hála-üzenet, hangulat-választás, ölelés-indítás, szív-jelzés, híd-jelzés és válasz).

## Mi NINCS v0.7-ben

- A csapat-funkciók nem archiválódnak külön Naplónk-fülbe (csak az aznapi kártyán élnek)
- Mit mondana továbbra is a Naplónk → Kérdések fülre archiválódik (v0.5 óta)
- A „Rád gondolok" napi limit nélküli — bárki bármikor küldhet többször

## Mi jön (v0.8)

Esti rítusok + presence:
- Közös meditáció (timer + soft bell + ki van fent jelzés)
- Magányos pillanat alt-Mindennapok (ha csak egyikőtök van fent)
- Élő status-dotok valós idejű presence-szel
- Csillám éjjeli meditáció-javaslat interaktívvá

## Mi jön később

- v0.9: Emlékek + idő-funkciók (Visszhang, Évforduló-szellem, Zenei időkapszula, Színes nap, Párhuzamos pillanat)
- v0.10: Polish + Auth + szigorúbb RLS
- v1.0+: Mélyvíz mód

---

Bármi kérdés / hiba: szólj.
