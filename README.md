# Kastor 🦫

**Kastor** est une plateforme de décorticage de plans pour les entreprises
d'armature : elle transforme un dossier de plans (PDF/JPEG) en une **liste
métrée** — le tableau des articles nécessaires à la construction, quantifiés en
unités ou en mètres linéaires selon le document de référence
(`reference/LISTE_METREE.xlsx`).

## Principe

1. **Import des documents** : l'utilisateur crée un chantier et ajoute les
   plans (chaque page de PDF devient une page analysable, rendue en image).
2. **Agent orchestrateur** (IA multimodale via OpenRouter) : lit cartouche,
   légende et nomenclatures, identifie le type de chaque plan, son niveau
   (fondations, plancher haut du vide sanitaire, plancher haut du RDC,
   plancher haut d'étage), son échelle (avec une cote exploitable pour la
   calibration) et la liste des articles présents.
3. **Sous-agents de calque** : un agent spécialisé par type d'article
   (semelles filantes, semelles isolées, chaînages, raidisseurs, poteaux,
   linteaux, longrines, bêches, attentes, poutres, jonctions, relevées…)
   vectorise ses éléments : **polylignes** pour les articles métrés en mL,
   **points** pour les articles comptés en unités. Les prompts encodent les
   conventions de lecture des plans de béton armé français
   (voir `docs/METHODOLOGIE.md`).
4. **Reconstruction algorithmique par calques** : le plan est reconstruit en
   couches superposables et filtrables dans la visionneuse ; l'utilisateur
   vérifie et corrige (**l'IA propose, l'humain valide**) : ajout, déplacement
   et suppression d'éléments, calibration d'échelle sur une cote connue.
5. **Calcul 100 % algorithmique** : les quantités sont calculées par le code —
   comptage des points, longueur des polylignes × calibration — jamais par
   l'IA. Le tableau final est exportable en **Excel** et en **PDF**.

## Architecture

- **Frontend** : React + Vite (`src/`), visionneuse SVG à calques avec édition,
  persistance locale des chantiers (IndexedDB).
- **API** : Cloudflare Worker + Hono (`worker/`), qui porte les appels
  OpenRouter (la clé reste côté serveur) et sert le frontend en assets
  statiques.
- **Partagé** (`shared/`) : catalogue des articles/niveaux (source :
  `reference/LISTE_METREE.xlsx`), types, moteur géométrique.

```
worker/index.ts        API Hono : /api/analyze/overview, /api/analyze/layer
worker/prompts.ts      Prompts orchestrateur + sous-agents par article
worker/openrouter.ts   Client OpenRouter (multimodal) + extraction JSON robuste
shared/catalog.ts      Catalogue articles/niveaux/unités (source de vérité)
shared/geometry.ts     Moteur de calcul des métrés (déterministe)
src/                   Interface : analyse, visionneuse à calques, tableau
docs/METHODOLOGIE.md   Synthèse des recherches (conventions plans BA, pièges)
```

## Démarrage

```bash
npm install

# Clé API (développement local)
cp .dev.vars.example .dev.vars   # puis renseigner OPENROUTER_API_KEY

# Deux terminaux :
npm run dev:worker   # API sur http://localhost:8787
npm run dev          # Frontend sur http://localhost:5173 (proxy /api → 8787)
```

## Déploiement Cloudflare

```bash
npx wrangler login
npx wrangler secret put OPENROUTER_API_KEY   # coller la clé OpenRouter
npm run deploy
```

Le Worker sert l'application et l'API sur votre domaine `*.workers.dev` (ou un
domaine personnalisé configuré dans le dashboard Cloudflare).

### Configuration

- `OPENROUTER_API_KEY` (secret, obligatoire) : clé API OpenRouter.
- `OPENROUTER_MODEL` (variable, défaut `google/gemini-2.5-pro`) : modèle
  multimodal utilisé ; surchargée au besoin chantier par chantier depuis
  l'interface (champ « Modèle OpenRouter »).

## Notes de conception

- Les métrés en mL exigent une **calibration d'échelle par page** : l'IA
  propose une cote lue sur le plan, et l'outil 📏 de la visionneuse permet de
  calibrer manuellement (cliquer deux points d'une cote connue, saisir la
  distance). Les PDF/scans étant souvent redimensionnés, l'échelle nominale du
  cartouche seule n'est jamais suffisante.
- L'article « relevées » figure dans le document de référence sans unité ; il
  est traité en mL (élément linéaire de rive) — modifiable dans
  `shared/catalog.ts` si besoin.
- Les chantiers restent stockés **localement dans le navigateur**
  (IndexedDB) ; seules les images de pages transitent par le Worker vers
  OpenRouter pendant l'analyse. Un stockage partagé (D1/R2) pourra être ajouté
  ensuite si le besoin multi-postes apparaît.
