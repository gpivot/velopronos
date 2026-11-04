# Correctifs communs à Biathlonpronos et VéloPronos

Les deux apps partagent le même code d'origine (VéloPronos est une copie de Biathlonpronos avec
tout son historique). Rien ne se synchronise automatiquement : un correctif utile aux deux se
reporte à la main, avec la méthode ci-dessous.

## Principe

1. **Un correctif commun = un commit à part**, qui ne touche que ce qui est commun (pas de texte
   « biathlète » ou « coureur » mélangé dans le même commit), avec un titre qui commence par
   `[commun]`. Exemple : `[commun] Classement : le pop-up du joueur se ferme au retour arrière`.
2. On le fait d'abord dans l'app où le problème a été vu, puis on le **reporte** dans l'autre par
   `git cherry-pick`, qui rejoue exactement le même changement.
3. On le note dans le **journal** en bas de ce fichier (dans les deux dépôts), pour savoir ce qui
   a été reporté et ce qui reste à faire.

## Réglage (une fois, fait par Claude)

Dans le dépôt VéloPronos, Biathlonpronos est déclaré comme seconde source :

```
git remote add biathlon https://github.com/gpivot/biathlonpronos.git
```

(et inversement `git remote add velo https://github.com/gpivot/velopronos.git` dans Biathlonpronos).

## Reporter un correctif

Dans le dépôt qui reçoit le correctif :

```
git fetch biathlon main          # ou : git fetch velo main
git cherry-pick <identifiant du commit>
```

S'il y a un conflit (le fichier a déjà divergé, par exemple un texte vélo à la place d'un texte
biathlon), on le règle à la main puis `git cherry-pick --continue`. Les migrations SQL communes
gardent leur numéro d'origine si possible ; sinon on prend le prochain numéro libre et on le note
dans le journal.

Concrètement, il suffit de dire à Claude : « reporte le correctif X dans l'autre app ».

## Plus tard

Si les reports deviennent fréquents, extraire un noyau commun (moteur de points, cartes,
classements) dans un paquet partagé. Pas avant le lancement de VéloPronos.

## Journal des reports

| Date | Correctif | Fait dans | Reporté dans | Commit(s) |
|---|---|---|---|---|
| 04/11/2026 | Duplication : VéloPronos part de Biathlonpronos `e527158` | Biathlonpronos | VéloPronos | — |
