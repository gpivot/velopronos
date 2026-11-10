-- Biathlonpronos — parcours d'invité « e-mail seulement » (décision de Guillaume, 10/11/2026).
-- L'invité (bouton « Je joue ») ne donne que son e-mail pour valider son pronostic. Son compte
-- anonyme reçoit l'adresse (côté serveur) et devient un compte « en attente d'inscription » :
-- pronostic enregistré et noté, mais joueur absent des classements, sans e-mails de rappel ni
-- de récap. Après la course, il reçoit son score et un code privé par e-mail ; il crée ensuite
-- son compte (pseudo, prénom, nom) et garde ses points.
--
-- À exécuter après 0044.

-- 1. Compte en attente d'inscription (false pour tous les joueurs existants).
alter table public.profiles add column if not exists signup_pending boolean not null default false;

-- 2. Pas de rappels, récap ni nouvelles par e-mail tant que l'inscription n'est pas terminée
--    (l'e-mail du score part à part, depuis la saisie des résultats).
create or replace function public.player_emails(user_ids uuid[] default null)
returns table (id uuid, email text, locale text)
language sql
stable
security definer set search_path = public
as $$
  select u.id, u.email::text, coalesce(nullif(u.raw_user_meta_data->>'locale', ''), 'fr')
  from auth.users u
  join public.profiles p on p.id = u.id
  where not coalesce(u.is_anonymous, false)
    and not p.signup_pending
    and u.email is not null and u.email <> ''
    and (user_ids is null or u.id = any(user_ids))
$$;

revoke execute on function public.player_emails(uuid[]) from public, anon, authenticated;
grant execute on function public.player_emails(uuid[]) to service_role;

-- 2 bis. Trace de l'e-mail « Ton score est prêt » envoyé aux invités (une fois par course).
alter table public.notification_sends drop constraint if exists notification_sends_kind_check;
alter table public.notification_sends
  add constraint notification_sends_kind_check check (kind in ('reminder', 'results', 'weekly', 'guest_results'));

-- 3. Le joueur ne peut pas lever lui-même le statut « en attente » : seule la page d'inscription
--    (côté serveur, clé service) le fait, une fois le pseudo choisi.
create or replace function public.protect_signup_pending()
returns trigger
language plpgsql
as $$
begin
  if new.signup_pending is distinct from old.signup_pending and coalesce(auth.role(), '') <> 'service_role' then
    new.signup_pending := old.signup_pending;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_signup_pending on public.profiles;
create trigger protect_signup_pending
  before update on public.profiles
  for each row execute function public.protect_signup_pending();

-- 4. Inscriptions en attente jamais terminées : supprimées au bout de 60 jours sans pronostic
--    récent (même tâche nocturne que les invités anonymes).
create or replace function public.purge_anonymous_users(older_than interval default interval '7 days')
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  purged integer;
  pending integer;
begin
  delete from auth.users where is_anonymous and created_at < now() - older_than;
  get diagnostics purged = row_count;
  delete from auth.users u
  using public.profiles p
  where p.id = u.id
    and p.signup_pending
    and u.created_at < now() - interval '60 days'
    and not exists (
      select 1 from public.predictions pr where pr.user_id = u.id and pr.submitted_at > now() - interval '60 days'
    );
  get diagnostics pending = row_count;
  return purged + pending;
end;
$$;

revoke execute on function public.purge_anonymous_users(interval) from public, anon, authenticated;
grant execute on function public.purge_anonymous_users(interval) to service_role;
