-- VéloPronos : porteur d'eau = la Pépite de Biathlonpronos, un par Grand Tour.
--
-- La table pepites est reprise telle quelle, avec une course (stage_id) en plus : un porteur d'eau
-- par joueur et par Grand Tour (clé (user_id, stage_id) au lieu de (user_id, season_id, sex)).
-- Dans VéloPronos la table est vide à ce jour ; si elle ne l'était pas, l'étape « not null »
-- échouerait sans rien effacer.
--
-- Règles côté joueur (le back-office et l'éditeur SQL ne passent pas par ces contrôles) :
-- 1. Grand Tour uniquement (stages.kind = 'grand_tour').
-- 2. Coureur engagé dans la course et dont TOUTES les cotes courantes de la course (types d'étape
--    et maillots) sont >= 30. odds_at_pick = la plus basse.
-- 3. Choix modifiable jusqu'au départ de la 1re étape, figé ensuite (à confirmer).
-- 4. Un porteur pas encore révélé ne peut pas figurer dans les pronostics d'étape de son joueur
--    pour ce Grand Tour : il y est déjà joué en caché.

alter table pepites add column if not exists stage_id uuid references stages(id) on delete cascade;
alter table pepites alter column stage_id set not null;
alter table pepites drop constraint if exists pepites_pkey;
alter table pepites add primary key (user_id, stage_id);

create or replace function public.porteur_is_eligible(p_athlete_id uuid, p_stage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from stage_riders where stage_id = p_stage_id and athlete_id = p_athlete_id)
     and (select count(*) > 0 and coalesce(bool_and(value >= 30), false)
            from odds
           where athlete_id = p_athlete_id
             and stage_id = p_stage_id
             and valid_until is null);
$$;

grant execute on function public.porteur_is_eligible(uuid, uuid) to authenticated;

create or replace function public.pepites_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stage stages%rowtype;
  v_first_lock timestamptz;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.stage_id is distinct from old.stage_id then
    raise exception 'porteur_wrong_course' using errcode = '23514';
  end if;

  select * into v_stage from stages where id = new.stage_id;
  if not found or v_stage.kind::text <> 'grand_tour' then
    raise exception 'porteur_grand_tour_only' using errcode = '23514';
  end if;

  select min(locks_at) into v_first_lock from races where stage_id = new.stage_id;
  if v_first_lock is not null and v_first_lock <= effective_now() then
    raise exception 'porteur_locked' using errcode = '23514';
  end if;

  new.season_id := v_stage.season_id;
  new.bonus_claimed := false;
  new.revealed_race_id := null;
  new.active_from := null;

  if tg_op = 'INSERT' or new.athlete_id is distinct from old.athlete_id then
    if not public.porteur_is_eligible(new.athlete_id, new.stage_id) then
      raise exception 'pepite_not_eligible' using errcode = '23514';
    end if;
    select sex into new.sex from athletes where id = new.athlete_id;
    select min(value) into new.odds_at_pick
      from odds
     where athlete_id = new.athlete_id and stage_id = new.stage_id and valid_until is null;
  else
    new.sex := old.sex;
    new.odds_at_pick := old.odds_at_pick;
  end if;

  return new;
end;
$$;

create or replace function public.predictions_no_hidden_pepite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' or new.athlete_ids is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.athlete_ids is not distinct from old.athlete_ids then
    return new;
  end if;

  if exists (
    select 1
      from pepites p
      join races r on r.id = new.race_id
     where p.user_id = new.user_id
       and p.stage_id = r.stage_id
       and not p.bonus_claimed
       and p.athlete_id = any (new.athlete_ids)
  ) then
    raise exception 'hidden_pepite_in_prediction' using errcode = '23514';
  end if;

  return new;
end;
$$;

-- Un joueur ne retire pas son porteur d'eau une fois la course partie.
create or replace function public.pepites_no_late_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and exists (select 1 from races where stage_id = old.stage_id and locks_at <= effective_now()) then
    raise exception 'porteur_locked' using errcode = '23514';
  end if;
  return old;
end;
$$;

drop trigger if exists pepites_no_late_delete on pepites;
create trigger pepites_no_late_delete
  before delete on pepites
  for each row execute function public.pepites_no_late_delete();

-- Carte Talent (Biathlonpronos) : sans objet en vélo, elle ne peut plus modifier un porteur d'eau.
create or replace function play_talent_card(p_card_id uuid, p_sex sex, p_athlete_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'card_not_offered';
end;
$$;
