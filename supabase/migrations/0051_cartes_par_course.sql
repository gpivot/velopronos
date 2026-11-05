-- VéloPronos : série de 5 et cartes bonus propres à chaque course par étapes (décision de
-- Guillaume du 05/11/2026, règle base44).
--
-- - La série (streak_counters) se compte course par course, sur les courses par étapes et les
--   Grands Tours seulement : 5 étapes d'affilée avec des points = une carte. Elle repart de zéro à
--   chaque course.
-- - Une carte gagnée (bonus_cards.course_id) ne se joue que dans sa course ; non jouée, elle est
--   perdue à la fin de la course.
-- - Cartes proposées pour l'instant : Grillade ('fondue'), Boost ×3 ('ca_farte') et 4e choix
--   ('balle_de_pioche', 3 étapes de suite à partir de la prochaine). Équipe et Chat noir viendront
--   avec l'équipe de cœur. Les cartes du biathlon (Aspiration, Fusée, Gâchette, Talent) ne sont
--   plus proposées.
--
-- Les compteurs de série sont des données calculées : ils sont vidés ici et recalculés à la
-- prochaine notation d'une étape.

-- Compteurs de série par course -------------------------------------------------------------------

delete from streak_counters;
alter table streak_counters add column if not exists stage_id uuid references stages(id) on delete cascade;
alter table streak_counters alter column stage_id set not null;
alter table streak_counters drop constraint if exists streak_counters_pkey;
alter table streak_counters add primary key (user_id, stage_id);

-- Course d'une carte ------------------------------------------------------------------------------

alter table bonus_cards add column if not exists course_id uuid references stages(id) on delete cascade;
create index if not exists idx_bonus_cards_course on bonus_cards(user_id, course_id);

-- 4e choix : la course d'activation puis les suivantes de la même course, 3 au total, CLM par
-- équipes exclu.
create or replace function quatrieme_choix_window(p_race_id uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with activation as (
    select r.id, r.locks_at, r.stage_id
      from races r join stages s on s.id = r.stage_id
     where r.id = p_race_id and r.format::text <> 'clm_equipes' and s.counts_in_standings
  ),
  candidates as (
    select r.id, row_number() over (order by r.locks_at, (r.id <> a.id)) as n
      from activation a
      join races r on r.stage_id = a.stage_id
     where r.format::text <> 'clm_equipes'
       and r.locks_at >= a.locks_at
  )
  select id from candidates where n <= 3;
$$;

-- Prochaine étape de la course pas encore partie (activation du 4e choix), CLM par équipes exclu.
create or replace function next_course_race(p_stage_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from races
   where stage_id = p_stage_id
     and format::text <> 'clm_equipes'
     and locks_at > effective_now()
   order by locks_at, id
   limit 1;
$$;

-- Choisir sa carte à la fin d'une série -------------------------------------------------------------

drop function if exists claim_bonus_card(uuid, text);

create or replace function claim_course_card(p_stage_id uuid, p_card_type text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_stage stages%rowtype;
  v_earned integer;
  v_held integer;
  v_previous text;
  v_race uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_card_type not in ('fondue', 'ca_farte', 'balle_de_pioche') then raise exception 'card_not_offered'; end if;

  select * into v_stage from stages where id = p_stage_id;
  if not found or v_stage.kind::text not in ('stage_race', 'grand_tour') then raise exception 'course_without_cards'; end if;
  if not bonus_card_offered(v_stage.season_id, p_card_type) then raise exception 'card_not_offered'; end if;
  if not exists (select 1 from races where stage_id = p_stage_id and locks_at > effective_now()) then
    raise exception 'course_finished';
  end if;

  select coalesce(max(cards_earned), 0) into v_earned
    from streak_counters where user_id = v_user and stage_id = p_stage_id;
  select count(*) into v_held
    from bonus_cards where user_id = v_user and course_id = p_stage_id;
  if v_held >= v_earned then raise exception 'no_card_to_claim'; end if;

  select card_type::text into v_previous
    from bonus_cards where user_id = v_user and course_id = p_stage_id
   order by earned_at desc, id desc limit 1;
  if v_previous = p_card_type then raise exception 'same_card_twice_in_a_row'; end if;

  if p_card_type = 'balle_de_pioche' then
    v_race := next_course_race(p_stage_id);
    if v_race is null then raise exception 'course_finished'; end if;
  end if;

  insert into bonus_cards (user_id, season_id, course_id, card_type, status, used_at, used_on_race_id)
  values (
    v_user, v_stage.season_id, p_stage_id, p_card_type::bonus_card_type,
    case when v_race is null then 'available' else 'used' end::bonus_card_status,
    case when v_race is null then null else now() end,
    v_race
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function claim_course_card(uuid, text) from public;
grant execute on function claim_course_card(uuid, text) to authenticated;

-- Jouer une carte sur une étape de sa course : Boost ×3 et Grillade --------------------------------

create or replace function play_bonus_card(p_card_id uuid, p_race_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_card bonus_cards%rowtype;
  v_race races%rowtype;
  v_type text;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select * into v_card from bonus_cards where id = p_card_id and user_id = v_user for update;
  if not found then raise exception 'card_not_found'; end if;
  if v_card.status <> 'available' then raise exception 'card_already_used'; end if;
  v_type := v_card.card_type::text;
  if v_type not in ('ca_farte', 'fondue') then raise exception 'card_not_for_a_race'; end if;

  select r.* into v_race from races r where r.id = p_race_id;
  if not found then raise exception 'race_not_found'; end if;
  if v_card.course_id is null or v_card.course_id <> v_race.stage_id then raise exception 'wrong_course'; end if;
  if v_race.locks_at <= effective_now() then raise exception 'race_locked'; end if;
  if v_race.format::text = 'clm_equipes' then raise exception 'individual_races_only'; end if;

  if exists (
    select 1 from bonus_cards c
     where c.user_id = v_user and c.status = 'used' and c.used_on_race_id = p_race_id
       and c.card_type::text = v_type
  ) then raise exception 'one_card_at_a_time'; end if;

  update bonus_cards
     set status = 'used', used_at = now(), used_on_race_id = p_race_id
   where id = p_card_id;
end;
$$;

revoke all on function play_bonus_card(uuid, uuid) from public;
grant execute on function play_bonus_card(uuid, uuid) to authenticated;
