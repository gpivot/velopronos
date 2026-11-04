-- VéloPronos — mention affichée au-dessus du nom d'une étape (Guillaume, 04/11/2026).
-- Déjà appliquée sur la base VéloPronos (04/11/2026). L'écran qui l'utilise (fil abandonné) sera
-- refait plus tard ; la colonne reste en attendant, sans effet.
--
-- Texte libre saisi dans l'admin (ex. « PRÉ-SAISON »), affiché en petites capitales au-dessus du
-- nom de l'étape dans le programme. Vide : mention par défaut selon la catégorie (Coupe du monde,
-- Championnats du monde ; rien pour une étape hors classement).

alter table stages add column if not exists label text;
