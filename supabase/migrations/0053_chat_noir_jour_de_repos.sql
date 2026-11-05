-- VéloPronos : limite du Chat noir (décision de Guillaume du 05/11/2026).
--
-- Le Chat noir se joue jusqu'au 1er jour de repos à partir de l'étape 8 : le départ de la 1re étape
-- (n° >= 9) qui suit un jour sans course (heure de Paris). Exemple : Tour 2027, repos à J4 ignoré,
-- on attend le suivant. Faute de jour de repos repéré, le départ de l'étape 10 (comme en 0052).

create or replace function chat_noir_deadline(p_stage_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  with ordered as (
    select stage_number, locks_at,
           lag(locks_at) over (order by locks_at) as previous_lock
      from races
     where stage_id = p_stage_id and stage_number is not null
  )
  select coalesce(
    (select min(locks_at) from ordered
      where stage_number > 8
        and previous_lock is not null
        and (locks_at at time zone 'Europe/Paris')::date - (previous_lock at time zone 'Europe/Paris')::date >= 2),
    (select min(locks_at) from ordered where stage_number >= 10)
  );
$$;

grant execute on function chat_noir_deadline(uuid) to authenticated;

create or replace function play_chat_noir(p_card_id uuid, p_target text, p_athlete_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_card bonus_cards%rowtype;
  v_course uuid;
  v_old uuid;
  v_deadline timestamptz;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;

  select * into v_card from bonus_cards where id = p_card_id and user_id = v_user for update;
  if not found then raise exception 'card_not_found'; end if;
  if v_card.status <> 'available' then raise exception 'card_already_used'; end if;
  if v_card.card_type::text <> 'chat_noir' then raise exception 'not_a_chat_noir_card'; end if;
  v_course := v_card.course_id;
  if v_course is null then raise exception 'wrong_course'; end if;

  v_deadline := chat_noir_deadline(v_course);
  if v_deadline is not null and v_deadline <= effective_now() then raise exception 'chat_noir_too_late'; end if;

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
