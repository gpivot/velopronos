-- VéloPronos : équipe de cœur, nation favorite, cartes Équipe et Chat noir.
--
-- 1. favorite_teams (une ligne par joueur et par saison) garde la nation favorite (nation_code,
--    Fête nationale) et reçoit l'équipe de cœur (team_id). Chacune se choisit une fois pour la
--    saison, à part : un choix posé n'est plus modifiable par le joueur.
-- 2. Carte Équipe (Grands Tours seulement) : s'active à la prochaine étape ; à partir de l'étape
--    10, chaque coureur de l'équipe de cœur dans le Top 10 rapporte une fois sa cote (base44).
-- 3. Carte Chat noir (gardée en main) : remplace un pronostic maillot (hors meilleure équipe) ou le
--    porteur d'eau dont le coureur a abandonné, jusqu'au départ de l'étape 10.

-- Équipe de cœur et nation favorite ---------------------------------------------------------------

alter table favorite_teams add column if not exists team_id uuid references teams(id) on delete set null;
alter table favorite_teams alter column nation_code drop not null;
alter table favorite_teams alter column sex set default 'H';

drop policy if exists "favorite_teams: insert own once" on favorite_teams;
create policy "favorite_teams: insert own" on favorite_teams for insert with check (auth.uid() = user_id);
drop policy if exists "favorite_teams: fill own" on favorite_teams;
create policy "favorite_teams: fill own" on favorite_teams for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Un choix posé est définitif : le joueur ne peut que compléter le choix manquant.
create or replace function public.favorite_teams_fill_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if new.season_id is distinct from old.season_id
     or (old.nation_code is not null and new.nation_code is distinct from old.nation_code)
     or (old.team_id is not null and new.team_id is distinct from old.team_id) then
    raise exception 'favorite_definitive' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists favorite_teams_fill_only on favorite_teams;
create trigger favorite_teams_fill_only
  before update on favorite_teams
  for each row execute function public.favorite_teams_fill_only();

-- Le porteur d'eau peut être remplacé par la carte Chat noir (drapeau de session) ---------------

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
  if coalesce(current_setting('velopronos.chat_noir', true), '') = 'on' then
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

-- Choisir sa carte : Équipe et Chat noir en plus ---------------------------------------------------

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
  if p_card_type not in ('fondue', 'ca_farte', 'balle_de_pioche', 'equipe', 'chat_noir') then raise exception 'card_not_offered'; end if;

  select * into v_stage from stages where id = p_stage_id;
  if not found or v_stage.kind::text not in ('stage_race', 'grand_tour') then raise exception 'course_without_cards'; end if;
  if not bonus_card_offered(v_stage.season_id, p_card_type) then raise exception 'card_not_offered'; end if;
  if not exists (select 1 from races where stage_id = p_stage_id and locks_at > effective_now()) then
    raise exception 'course_finished';
  end if;
  if p_card_type = 'equipe' then
    if v_stage.kind::text <> 'grand_tour' then raise exception 'card_locked'; end if;
    if not exists (select 1 from favorite_teams where user_id = v_user and season_id = v_stage.season_id and team_id is not null) then
      raise exception 'no_favorite_team';
    end if;
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

  if p_card_type in ('balle_de_pioche', 'equipe') then
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

-- Jouer le Chat noir --------------------------------------------------------------------------------

-- p_target : un maillot de course_predictions (sauf 'equipe') ou 'porteur'.
create or replace function play_chat_noir(p_card_id uuid, p_target text, p_athlete_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_card bonus_cards%rowtype;
  v_course uuid;
  v_old uuid;
  v_stage10_lock timestamptz;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select * into v_card from bonus_cards where id = p_card_id and user_id = v_user for update;
  if not found then raise exception 'card_not_found'; end if;
  if v_card.status <> 'available' then raise exception 'card_already_used'; end if;
  if v_card.card_type::text <> 'chat_noir' then raise exception 'not_a_chat_noir_card'; end if;
  v_course := v_card.course_id;
  if v_course is null then raise exception 'wrong_course'; end if;

  -- Jusqu'au départ de l'étape 10 (1er jour de repos d'un Grand Tour, à confirmer).
  select min(locks_at) into v_stage10_lock from races where stage_id = v_course and stage_number >= 10;
  if v_stage10_lock is not null and v_stage10_lock <= effective_now() then raise exception 'chat_noir_too_late'; end if;

  -- Nouveau coureur : engagé dans la course et pas abandonné.
  if not exists (
    select 1 from stage_riders where stage_id = v_course and athlete_id = p_athlete_id and abandoned_race_id is null
  ) then raise exception 'rider_not_available'; end if;

  if p_target = 'porteur' then
    select athlete_id into v_old from pepites where user_id = v_user and stage_id = v_course and not bonus_claimed for update;
    if v_old is null then raise exception 'nothing_to_replace'; end if;
    if not public.porteur_is_eligible(p_athlete_id, v_course) then raise exception 'pepite_not_eligible'; end if;
  elsif p_target = 'equipe' then
    raise exception 'nothing_to_replace';
  else
    select athlete_id into v_old from course_predictions where user_id = v_user and stage_id = v_course and jersey::text = p_target for update;
    if v_old is null then raise exception 'nothing_to_replace'; end if;
  end if;

  -- Seulement un coureur qui a abandonné.
  if not exists (
    select 1 from stage_riders where stage_id = v_course and athlete_id = v_old and abandoned_race_id is not null
  ) then raise exception 'rider_not_abandoned'; end if;

  if p_target = 'porteur' then
    perform set_config('velopronos.chat_noir', 'on', true);
    update pepites
       set athlete_id = p_athlete_id,
           odds_at_pick = (select min(value) from odds where athlete_id = p_athlete_id and stage_id = v_course and valid_until is null)
     where user_id = v_user and stage_id = v_course;
    perform set_config('velopronos.chat_noir', '', true);
  else
    update course_predictions set athlete_id = p_athlete_id, submitted_at = now()
     where user_id = v_user and stage_id = v_course and jersey::text = p_target;
  end if;

  update bonus_cards set status = 'used', used_at = now(), used_on_stage_id = v_course where id = p_card_id;
end;
$$;

revoke all on function play_chat_noir(uuid, text, uuid) from public;
grant execute on function play_chat_noir(uuid, text, uuid) to authenticated;
