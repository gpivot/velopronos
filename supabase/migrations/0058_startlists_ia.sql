-- VéloPronos : startlists par IA (demande de Guillaume du 07/11/2026). À partir du lundi 17 h de
-- la semaine de course, l'IA récupère la liste des engagés, puis la met à jour chaque jour à 17 h
-- et une dernière fois à 7 h le matin du départ. Les cotes viennent de la liste de la saison.
-- À coller dans l'éditeur SQL de Supabase (après 0057).

-- Site prioritaire de la saison (domaine ou URL) ; vide = ProCyclingStats.
alter table seasons add column if not exists startlist_priority_site text;

-- Par course : page des engagés à lire en premier (facultatif), mise à jour auto (désactivable),
-- et compte rendu du dernier passage pour l'admin.
alter table stages add column if not exists startlist_url text;
alter table stages add column if not exists startlist_auto boolean not null default true;
alter table stages add column if not exists startlist_synced_at timestamptz;
alter table stages add column if not exists startlist_report text;
