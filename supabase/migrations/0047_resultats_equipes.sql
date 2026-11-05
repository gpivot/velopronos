-- VéloPronos : résultats d'une étape CLM par équipes (une ligne par équipe classée).
-- À coller dans l'éditeur SQL de Supabase avant la fusion de la PR.
alter table race_results add column if not exists team_id uuid references teams(id) on delete cascade;

alter table race_results drop constraint if exists race_results_target_check;
alter table race_results add constraint race_results_target_check check (num_nonnulls(athlete_id, nation_code, team_id) = 1);

create unique index if not exists race_results_race_team_key on race_results(race_id, team_id);
