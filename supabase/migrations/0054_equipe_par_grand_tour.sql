-- VéloPronos : équipe propre à un Grand Tour (demande de Guillaume du 05/11/2026, à l'essai).
--
-- Pour chaque Grand Tour, le joueur garde son équipe de cœur (rien à faire) ou choisit une autre
-- équipe pour ce Grand Tour seulement. Le choix se fait sur la page des maillots, modifiable
-- jusqu'au départ de la 1re étape (comme les maillots et le porteur d'eau, à confirmer). C'est
-- cette équipe que la carte Équipe utilise sur ce Grand Tour.

create table if not exists course_heart_teams (
  user_id uuid not null references profiles(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, stage_id)
);

alter table course_heart_teams enable row level security;

-- Modifiable tant que le Grand Tour n'est pas parti.
create or replace function public.course_heart_team_open(p_stage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from stages where id = p_stage_id and kind::text = 'grand_tour')
     and not exists (select 1 from races where stage_id = p_stage_id and locks_at <= effective_now());
$$;

grant execute on function public.course_heart_team_open(uuid) to authenticated;

drop policy if exists "course_heart_teams: read all" on course_heart_teams;
create policy "course_heart_teams: read all" on course_heart_teams for select using (true);
drop policy if exists "course_heart_teams: insert own" on course_heart_teams;
create policy "course_heart_teams: insert own" on course_heart_teams for insert
  with check (auth.uid() = user_id and public.course_heart_team_open(stage_id));
drop policy if exists "course_heart_teams: update own" on course_heart_teams;
create policy "course_heart_teams: update own" on course_heart_teams for update
  using (auth.uid() = user_id and public.course_heart_team_open(stage_id))
  with check (auth.uid() = user_id and public.course_heart_team_open(stage_id));
drop policy if exists "course_heart_teams: delete own" on course_heart_teams;
create policy "course_heart_teams: delete own" on course_heart_teams for delete
  using (auth.uid() = user_id and public.course_heart_team_open(stage_id));

-- Carte Équipe : équipe de cœur ou équipe de ce Grand Tour.
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
