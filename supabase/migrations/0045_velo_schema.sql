-- VéloPronos — schéma saison > course > étape (04/11/2026).
-- À coller APRÈS 0044 (exécutée seule) et après 0043 (mention d'étape, si elle est passée).
--
-- On garde les tables de Biathlonpronos, avec un sens vélo :
--   seasons  = saison (2027)
--   stages   = course (Tour de France, Paris-Nice, Strade Bianche…) ; une classique = 1 étape
--   races    = étape ; races.format = type d'étape (sprint, montagne, clm, baroudeurs, clm_equipes)
--   athletes = coureurs (un par saison), rattachés à une équipe
--   odds     = cotes, désormais propres à une course (odds.stage_id) : une par type d'étape et
--              une par maillot
-- Le grillage (grilled_states, par stage_id) reste donc limité à une course, comme le veut la
-- règle vélo : jamais d'une classique à la suivante.

-- ---------------------------------------------------------------------
-- Courses (table stages)
-- ---------------------------------------------------------------------
create type course_kind as enum ('one_day', 'stage_race', 'grand_tour', 'bonus_event');
create type course_category as enum (
  'grand_tour', 'stage_race', 'monument', 'world_tour', 'world_champs', 'national_championships'
);
-- general = maillot du leader (jaune, rose, rouge… selon la course), points = vert,
-- montagne = pois, jeune = blanc, combatif = super combatif, equipe = meilleure équipe.
create type jersey_type as enum ('general', 'points', 'montagne', 'jeune', 'combatif', 'equipe');

alter table stages add column if not exists name text;
alter table stages add column if not exists kind course_kind not null default 'one_day';
alter table stages add column if not exists category course_category;
-- Couleur du maillot de leader de la course (hex), pour le picto du leader du classement.
alter table stages add column if not exists jersey_color text;
-- Maillots pronostiqués avant le départ (vide pour une classique).
alter table stages add column if not exists jerseys jersey_type[] not null default '{}';
alter table stages add column if not exists rest_days date[] not null default '{}';
alter table stages add column if not exists is_visible boolean not null default true;

create unique index if not exists stages_season_name_unique on stages (season_id, lower(name)) where name is not null;

-- ---------------------------------------------------------------------
-- Étapes (table races)
-- ---------------------------------------------------------------------
alter table races add column if not exists stage_number smallint;      -- 0 = prologue
alter table races add column if not exists start_city text;
alter table races add column if not exists end_city text;
alter table races add column if not exists distance_km numeric;
alter table races add column if not exists elevation_m integer;         -- dénivelé positif
alter table races add column if not exists combatif_athlete_id uuid references athletes(id) on delete set null;

create unique index if not exists races_stage_number_unique on races (stage_id, stage_number) where stage_number is not null;

-- ---------------------------------------------------------------------
-- Équipes et coureurs
-- ---------------------------------------------------------------------
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  code text not null,                      -- code à 3 lettres (UAD, TVL…)
  name text not null,
  nation_code text references nations(code),
  created_at timestamptz not null default now(),
  unique (season_id, code)
);

alter table athletes add column if not exists team_id uuid references teams(id) on delete set null;
alter table athletes alter column sex set default 'H';

-- Engagés d'une course : dossard, et étape de l'abandon (null tant qu'il est en course).
create table if not exists stage_riders (
  stage_id uuid not null references stages(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  bib smallint,
  abandoned_race_id uuid references races(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (stage_id, athlete_id)
);

create index if not exists idx_stage_riders_athlete on stage_riders(athlete_id);

-- CLM par équipes : on pronostique 3 équipes.
alter table predictions add column if not exists team_ids uuid[];

-- ---------------------------------------------------------------------
-- Cotes par course (et cotes d'équipe)
-- ---------------------------------------------------------------------
alter table odds add column if not exists stage_id uuid references stages(id) on delete cascade;
alter table odds add column if not exists team_id uuid references teams(id) on delete cascade;

alter table odds drop constraint if exists odds_target_check;
alter table odds add constraint odds_target_check check (
  num_nonnulls(athlete_id, nation_code, team_id) = 1
  and (
    (athlete_id is not null and nation_sex is null)
    or (
      nation_code is not null
      and format in ('meilleure_nation', 'relais_h', 'relais_f', 'relais_mixte', 'relais_mixte_simple')
      and (
        (format in ('meilleure_nation', 'relais_h', 'relais_f') and nation_sex is not null)
        or (format in ('relais_mixte', 'relais_mixte_simple') and nation_sex is null)
      )
    )
    or (team_id is not null and nation_sex is null and format in ('clm_equipes', 'meilleure_equipe'))
  )
);

-- Une seule cote courante par (saison, course, format, cible). stage_id null = cote de saison.
drop index if exists odds_athlete_current_unique;
create unique index odds_athlete_current_unique
  on odds (season_id, stage_id, format, athlete_id) nulls not distinct
  where valid_until is null and athlete_id is not null;

create unique index if not exists odds_team_current_unique
  on odds (season_id, stage_id, format, team_id) nulls not distinct
  where valid_until is null and team_id is not null;

create index if not exists idx_odds_stage_current on odds(stage_id, format) where valid_until is null;

-- ---------------------------------------------------------------------
-- Pronostics maillots (par course, posés avant la 1re étape)
-- ---------------------------------------------------------------------
create table if not exists course_predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  jersey jersey_type not null,
  athlete_id uuid references athletes(id),
  team_id uuid references teams(id),
  corrected_via_chat_noir boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (user_id, stage_id, jersey),
  constraint course_predictions_target_check check (
    (jersey = 'equipe' and team_id is not null and athlete_id is null)
    or (jersey <> 'equipe' and athlete_id is not null and team_id is null)
  )
);

-- Podium final de chaque maillot (top 3), saisi dans l'admin.
create table if not exists course_jersey_results (
  stage_id uuid not null references stages(id) on delete cascade,
  jersey jersey_type not null,
  rank smallint not null check (rank between 1 and 3),
  athlete_id uuid references athletes(id),
  team_id uuid references teams(id),
  created_at timestamptz not null default now(),
  primary key (stage_id, jersey, rank),
  constraint course_jersey_results_target_check check (num_nonnulls(athlete_id, team_id) = 1)
);

-- Points des maillots dans le grand livre : une ligne par (joueur, course, maillot).
alter table score_ledger add column if not exists stage_id uuid references stages(id) on delete cascade;
alter table score_ledger add column if not exists jersey jersey_type;

alter table score_ledger drop constraint if exists score_ledger_source_check;
alter table score_ledger add constraint score_ledger_source_check check (
  num_nonnulls(race_id, season_prediction_category, bonus_question_id, jersey) = 1
  and (jersey is null or stage_id is not null)
);

alter table score_ledger drop constraint if exists score_ledger_user_stage_jersey_unique;
alter table score_ledger add constraint score_ledger_user_stage_jersey_unique unique (user_id, stage_id, jersey);

-- ---------------------------------------------------------------------
-- Accès : lecture publique des données de course, écriture admin (clé service, sans policy)
-- ---------------------------------------------------------------------
alter table teams enable row level security;
alter table stage_riders enable row level security;
alter table course_predictions enable row level security;
alter table course_jersey_results enable row level security;

drop policy if exists "teams: read all" on teams;
create policy "teams: read all" on teams for select using (true);

drop policy if exists "stage_riders: read all" on stage_riders;
create policy "stage_riders: read all" on stage_riders for select using (true);

drop policy if exists "course_jersey_results: read all" on course_jersey_results;
create policy "course_jersey_results: read all" on course_jersey_results for select using (true);

-- Maillots : chacun lit les siens ; ceux des autres deviennent visibles au départ de la course.
-- Écriture par le joueur jusqu'au départ de la 1re étape (horloge simulée de l'admin comprise).
drop policy if exists "course_predictions: read own or started" on course_predictions;
create policy "course_predictions: read own or started" on course_predictions for select using (
  auth.uid() = user_id
  or exists (select 1 from races r where r.stage_id = course_predictions.stage_id and r.locks_at <= now())
);

drop policy if exists "course_predictions: insert own before start" on course_predictions;
create policy "course_predictions: insert own before start" on course_predictions for insert with check (
  auth.uid() = user_id
  and not exists (select 1 from races r where r.stage_id = course_predictions.stage_id and r.locks_at <= effective_now())
);

drop policy if exists "course_predictions: update own before start" on course_predictions;
create policy "course_predictions: update own before start" on course_predictions for update
  using (
    auth.uid() = user_id
    and not exists (select 1 from races r where r.stage_id = course_predictions.stage_id and r.locks_at <= effective_now())
  )
  with check (auth.uid() = user_id);

drop policy if exists "course_predictions: delete own before start" on course_predictions;
create policy "course_predictions: delete own before start" on course_predictions for delete using (
  auth.uid() = user_id
  and not exists (select 1 from races r where r.stage_id = course_predictions.stage_id and r.locks_at <= effective_now())
);
