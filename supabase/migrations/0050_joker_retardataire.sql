-- VéloPronos : joker retardataire (règle base44 « LateJoker »).
--
-- Un par joueur et par course (classique, course par étapes ou Grand Tour) : il permet de
-- pronostiquer une étape oubliée jusqu'à 1 h après son départ, tant que ses résultats ne sont pas
-- saisis. Les points de ce pronostic sont divisés par 2 (arrondi à l'entier inférieur), au
-- moment de la notation (src/lib/admin/raceResults.ts).
--
-- Choix pragmatiques (à confirmer) : pas de bonus ×2 sur un pronostic joker ; un pronostic déjà
-- posé avant le départ ne peut pas devenir un pronostic joker (le joker sert à une étape oubliée).

alter table predictions add column if not exists late_joker boolean not null default false;

-- Le pronostic joker est lisible par les autres joueurs comme tout pronostic d'une étape partie (0018).

-- Fenêtre du joker : départ passé, moins d'une heure, résultats pas encore saisis.
create or replace function public.late_joker_window_open(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from races
     where id = p_race_id
       and locks_at <= effective_now()
       and effective_now() < locks_at + interval '1 hour'
       and status <> 'finished'
  );
$$;

grant execute on function public.late_joker_window_open(uuid) to authenticated;

-- Joker déjà utilisé sur une autre étape de la même course ?
create or replace function public.late_joker_used_elsewhere(p_user_id uuid, p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from predictions p
      join races r on r.id = p.race_id
      join races target on target.id = p_race_id
     where p.user_id = p_user_id
       and p.late_joker
       and r.stage_id = target.stage_id
       and p.race_id <> p_race_id
  );
$$;

grant execute on function public.late_joker_used_elsewhere(uuid, uuid) to authenticated;

drop policy if exists "predictions: insert own late joker" on predictions;
create policy "predictions: insert own late joker" on predictions for insert with check (
  auth.uid() = user_id
  and late_joker
  and not bonus_x2_used
  and public.late_joker_window_open(race_id)
  and not public.late_joker_used_elsewhere(user_id, race_id)
);

drop policy if exists "predictions: update own late joker" on predictions;
create policy "predictions: update own late joker" on predictions for update
  using (auth.uid() = user_id and late_joker and public.late_joker_window_open(race_id))
  with check (auth.uid() = user_id and late_joker and not bonus_x2_used);

-- Avant le départ, un joueur ne pose jamais lui-même late_joker (il gâcherait son joker et ses points).
create or replace function public.predictions_late_joker_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.late_joker is distinct from old.late_joker then
    raise exception 'late_joker_immutable' using errcode = '23514';
  end if;
  if new.late_joker and not public.late_joker_window_open(new.race_id) then
    raise exception 'late_joker_window_closed' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_late_joker_check on predictions;
create trigger predictions_late_joker_check
  before insert or update on predictions
  for each row execute function public.predictions_late_joker_check();
