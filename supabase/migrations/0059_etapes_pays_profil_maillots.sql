-- VéloPronos : demandes de Guillaume du 08/11/2026 pour les Grands Tours.
-- À coller dans l'éditeur SQL de Supabase (après 0058).

-- Pays de chaque étape (beaucoup de départs à l'étranger) : petit drapeau dans le calendrier.
alter table races add column if not exists country_code text references nations(code);

-- Profil de l'étape (image PNG ou JPG) affiché au-dessus de « L'avis de VéloPronos ».
alter table races add column if not exists profile_image_url text;

-- Couleurs des maillots sprint et montagne au choix (le leader garde stages.jersey_color).
alter table stages add column if not exists points_jersey_color text
  check (points_jersey_color is null or points_jersey_color in ('vert', 'cyclamen'));
alter table stages add column if not exists mountain_jersey_color text
  check (mountain_jersey_color is null or mountain_jersey_color in ('pois_rouges', 'pois_bleus', 'bleu'));

-- Stockage public des images de profil (lecture pour tous ; l'envoi passe par le back-office,
-- avec la clé de service, sans politique d'écriture publique).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stage-profiles', 'stage-profiles', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
