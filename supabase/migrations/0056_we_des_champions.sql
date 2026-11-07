-- VéloPronos : WE des Champions (demande de Guillaume du 05/11/2026). Événement bonus autonome :
-- 1 coureur par championnat national, pas de cote, barème par palier selon le nombre de champions
-- trouvés. Module à part : aucune table de pronostic, de cote ou de grillage existante n'est touchée.
-- La course (stages, kind = bonus_event) porte le barème et la date de clôture ; seul le score
-- final entre dans le grand livre (score_ledger.bonus_kind = 'champions') et donc dans la Saison.
-- À coller dans l'éditeur SQL de Supabase.

-- Barème par palier (index = nombre de champions trouvés) et clôture de l'événement.
alter table stages add column if not exists champions_scale integer[] not null
  default '{0,50,120,220,350,500,700,950,1250,1600,2000}';
alter table stages add column if not exists champions_closed_at timestamptz;

-- Championnats nationaux sélectionnés (10 par défaut, nombre libre).
create table if not exists champion_championships (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references stages(id) on delete cascade,
  nation_code text not null references nations(code),
  starts_at timestamptz not null,
  locks_at timestamptz not null,
  winner_athlete_id uuid references athletes(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (stage_id, nation_code)
);
create index if not exists idx_champion_championships_stage on champion_championships(stage_id);

-- Pronostics : un coureur par championnat et par joueur, modifiable jusqu'à la limite du championnat.
create table if not exists champion_predictions (
  user_id uuid not null references profiles(id) on delete cascade,
  championship_id uuid not null references champion_championships(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, championship_id)
);

alter table champion_championships enable row level security;
alter table champion_predictions enable row level security;

drop policy if exists "champion_championships: read all" on champion_championships;
create policy "champion_championships: read all" on champion_championships for select using (true);

create or replace function champion_championship_open(p_championship_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from champion_championships c join stages s on s.id = c.stage_id
     where c.id = p_championship_id and c.locks_at > effective_now() and s.champions_closed_at is null
  );
$$;
grant execute on function public.champion_championship_open(uuid) to authenticated;

-- Le pronostic des autres n'est visible qu'une fois le championnat verrouillé.
drop policy if exists "champion_predictions: read" on champion_predictions;
create policy "champion_predictions: read" on champion_predictions for select
  using (auth.uid() = user_id or not public.champion_championship_open(championship_id));
drop policy if exists "champion_predictions: insert own" on champion_predictions;
create policy "champion_predictions: insert own" on champion_predictions for insert
  with check (auth.uid() = user_id and public.champion_championship_open(championship_id));
drop policy if exists "champion_predictions: update own" on champion_predictions;
create policy "champion_predictions: update own" on champion_predictions for update
  using (auth.uid() = user_id and public.champion_championship_open(championship_id))
  with check (auth.uid() = user_id and public.champion_championship_open(championship_id));
drop policy if exists "champion_predictions: delete own" on champion_predictions;
create policy "champion_predictions: delete own" on champion_predictions for delete
  using (auth.uid() = user_id and public.champion_championship_open(championship_id));

-- Score final dans le grand livre : une ligne par joueur et par WE des Champions.
alter table score_ledger add column if not exists bonus_kind text;
alter table score_ledger drop constraint if exists score_ledger_bonus_kind_check;
alter table score_ledger add constraint score_ledger_bonus_kind_check check (bonus_kind is null or bonus_kind = 'champions');
alter table score_ledger drop constraint if exists score_ledger_source_check;
alter table score_ledger add constraint score_ledger_source_check check (
  num_nonnulls(race_id, season_prediction_category, bonus_question_id, jersey, bonus_kind) = 1
  and (jersey is null or stage_id is not null)
  and (bonus_kind is null or stage_id is not null)
);
alter table score_ledger drop constraint if exists score_ledger_user_stage_bonus_unique;
alter table score_ledger add constraint score_ledger_user_stage_bonus_unique unique (user_id, stage_id, bonus_kind);

-- Course passée dans ou hors du classement : la ligne du WE suit, comme les maillots.
create or replace function stages_sync_counts_in_standings() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.counts_in_standings is distinct from old.counts_in_standings then
    update score_ledger l
       set counts_in_standings = new.counts_in_standings
     where l.race_id in (select id from races where stage_id = new.id)
        or l.bonus_question_id in (
             select q.id from bonus_questions q join races r on r.id = q.race_id where r.stage_id = new.id
           )
        or (l.stage_id = new.id and (l.jersey is not null or l.bonus_kind is not null));
  end if;
  return new;
end;
$$;
