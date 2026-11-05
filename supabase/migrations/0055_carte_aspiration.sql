-- VéloPronos : carte Aspiration (décision de Guillaume du 05/11/2026).
--
-- Mêmes règles qu'en biathlon : gagnée au bout d'une série de 5 dans une course par étapes, elle se
-- joue sur une étape de sa course (sauf CLM par équipes) : chacun des coureurs pronostiqués compte
-- une place plus haut (un 11e devient 10e et marque). Pas cumulable avec le Boost sur la même étape.

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
  if p_card_type not in ('fondue', 'ca_farte', 'balle_de_pioche', 'aspiration', 'equipe', 'chat_noir') then raise exception 'card_not_offered'; end if;

  select * into v_stage from stages where id = p_stage_id;
  if not found or v_stage.kind::text not in ('stage_race', 'grand_tour') then raise exception 'course_without_cards'; end if;
  if not bonus_card_offered(v_stage.season_id, p_card_type) then raise exception 'card_not_offered'; end if;
  if not exists (select 1 from races where stage_id = p_stage_id and locks_at > effective_now()) then
    raise exception 'course_finished';
  end if;
  if p_card_type = 'equipe' then
    if v_stage.kind::text <> 'grand_tour' then raise exception 'card_locked'; end if;
    if not exists (select 1 from favorite_teams where user_id = v_user and season_id = v_stage.season_id and team_id is not null)
       and not exists (select 1 from course_heart_teams where user_id = v_user and stage_id = p_stage_id) then
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
  if v_type not in ('ca_farte', 'fondue', 'aspiration') then raise exception 'card_not_for_a_race'; end if;

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

  -- Boost et Aspiration ne se cumulent pas sur une même étape.
  if v_type in ('ca_farte', 'aspiration') and exists (
    select 1 from bonus_cards c
     where c.user_id = v_user and c.status = 'used' and c.used_on_race_id = p_race_id
       and c.card_type::text in ('ca_farte', 'aspiration')
  ) then raise exception 'one_card_at_a_time'; end if;

  -- Pas d'Aspiration pendant une Oreillette.
  if v_type = 'aspiration' and exists (
    select 1 from bonus_cards c
     where c.user_id = v_user and c.status = 'used' and c.card_type::text = 'balle_de_pioche'
       and c.used_on_race_id is not null
       and p_race_id in (select quatrieme_choix_window(c.used_on_race_id))
  ) then raise exception 'one_card_at_a_time'; end if;

  update bonus_cards
     set status = 'used', used_at = now(), used_on_race_id = p_race_id
   where id = p_card_id;
end;
$$;

revoke all on function play_bonus_card(uuid, uuid) from public;
grant execute on function play_bonus_card(uuid, uuid) to authenticated;
