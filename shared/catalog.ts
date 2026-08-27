// Catalogue des articles et des niveaux, issu du document de référence
// « LISTE_METREE.xlsx » (Ordre de gestion des métrés / unité de mesure).
// C'est la source de vérité : les calques, les sous-agents et le tableau
// final sont générés à partir de ce catalogue.

import type { ArticleDef, LevelDef, Unit } from "./types";

export const ARTICLES: ArticleDef[] = [
  {
    id: "sf",
    label: "Semelles filantes",
    codes: ["SF"],
    unit: "ml",
    color: "#e11d48",
    description:
      "Fondations linéaires courant sous les murs porteurs, sur un plan de fondations vues de dessus : deux traits parallèles encadrant l'axe du mur (le débord de la semelle de part et d'autre du mur), souvent en trait interrompu ou trait fin car élément enterré/caché — jusqu'à 3 ou 4 lignes parallèles au total (bords de semelle + faces du mur). Repérées SF, SF1, SF2… Se métrent en suivant l'axe du mur, en mètres linéaires, y compris les retours et angles. La semelle suit TOUS les murs porteurs, refends intérieurs compris : ne pas se limiter au périmètre. Ne pas confondre le débord de semelle avec une double cloison ou une isolation.",
  },
  {
    id: "si",
    label: "Semelles isolées",
    codes: ["SI", "M"],
    unit: "u",
    color: "#f59e0b",
    description:
      "Fondations ponctuelles sous poteaux : carrés ou rectangles concentriques (la semelle autour de l'empreinte du poteau) sur le plan de fondations, repérés SI, SI1, M1, M2… Chaque semelle isolée compte pour une unité, positionnée au centre du carré.",
  },
  {
    id: "jonction_angle",
    label: "Jonctions d'angle",
    codes: ["JA"],
    unit: "u",
    color: "#a855f7",
    description:
      "Points de rencontre des semelles filantes : angles (en L), intersections en T et croisements des axes de semelles. Une unité par nœud où deux tronçons de semelle filante se rejoignent en changeant de direction ou en se croisant.",
  },
  {
    id: "attr",
    label: "Attentes raidisseurs",
    codes: ["ATTR", "AC", "ATTCV"],
    unit: "u",
    color: "#14b8a6",
    description:
      "Aciers en attente pour raidisseurs verticaux, ancrés dans les fondations ou le chaînage : petits symboles ponctuels (croix, cercles pleins, carrés) le long des murs, repérés ATTR, AC, ATTCV… Une unité par attente. Ne pas confondre avec les attentes de poteaux (ATTP).",
  },
  {
    id: "attp",
    label: "Attentes poteaux",
    codes: ["ATTP"],
    unit: "u",
    color: "#0ea5e9",
    description:
      "Aciers en attente pour poteaux, ancrés dans les fondations ou la structure : symbole ponctuel à l'emplacement de chaque futur poteau, repéré ATTP. Une unité par attente, positionnée au droit du poteau.",
  },
  {
    id: "lg",
    label: "Longrines",
    codes: ["LG"],
    unit: "u",
    color: "#84cc16",
    description:
      "Poutres de liaison horizontales reliant les semelles ou têtes de pieux, franchissant les zones sans fondation continue : deux traits parallèles rapprochés (souvent interrompus car enterrées sous dallage) entre deux appuis ponctuels, repérées LG, LG1 (ex. LG 20x50)… Se comptent à l'unité : une longrine = un élément d'appui à appui. À distinguer des semelles filantes (la longrine relie des appuis ponctuels, la SF suit un mur) et des réseaux/canalisations en pointillés.",
  },
  {
    id: "beche",
    label: "Bêches",
    codes: ["BECHE"],
    unit: "ml",
    color: "#f97316",
    description:
      "Approfondissements linéaires localisés de la fondation ou du dallage (bêche d'ancrage, bêche périphérique) : bandes linéaires souvent hachurées ou en trait renforcé, en rive de dallage ou sous des seuils, souvent accompagnées d'un détail en coupe. Se métrent en mètres linéaires le long de leur axe. Attention à ne pas les confondre avec la semelle filante de rive.",
  },
  {
    id: "ch",
    label: "Chaînages",
    codes: ["CH", "CHR"],
    unit: "ml",
    color: "#dc2626",
    description:
      "Chaînages horizontaux en tête de murs sur un plan de plancher/coffrage : ils suivent le contour des murs porteurs et refends (trait fort double le long des murs, ou étiquette « CH 3HA8 » avec flèche), repérés CH, CH1, CHR (chaînage rampant)… Souvent IMPLICITES : un chaînage règne en tête de tout mur porteur (périphérie et refends) même sans tracé dédié — suivre alors l'axe des murs porteurs du niveau. Se métrent en mètres linéaires, retours compris.",
  },
  {
    id: "jonction_ch",
    label: "Jonctions de chaînage",
    codes: ["JC"],
    unit: "u",
    color: "#9333ea",
    description:
      "Nœuds où les chaînages se rejoignent : angles, intersections en T et croisements des axes de chaînage. Une unité par nœud (équerres/U de jonction à prévoir).",
  },
  {
    id: "raid",
    label: "Raidisseurs",
    codes: ["R", "CV"],
    unit: "u",
    color: "#0891b2",
    description:
      "Raidisseurs verticaux en maçonnerie (poteaux raidisseurs coulés dans les blocs) : symboles ponctuels le long des murs — petits carrés/rectangles pochés ou croix dans l'épaisseur du mur — aux angles, jonctions et encadrements de baies, repérés R, R1, CV… Une unité par raidisseur.",
  },
  {
    id: "pot",
    label: "Poteaux",
    codes: ["P"],
    unit: "u",
    color: "#1d4ed8",
    description:
      "Poteaux en béton armé : sections pochées (noircies) ou hachurées, carrées, rectangulaires ou circulaires, isolées ou incorporées aux murs, repérées P, P1, P2… Une unité par poteau, positionnée au centre de la section.",
  },
  {
    id: "lt",
    label: "Linteaux et passages",
    codes: ["LT"],
    unit: "u",
    color: "#65a30d",
    description:
      "Linteaux au-dessus des ouvertures (portes, fenêtres, passages) : l'ouverture apparaît comme une interruption du mur avec ses traits conventionnels (menuiserie, arc d'ouverture de porte), le linteau est repéré LT, LT1… au droit de l'ouverture. Une unité par ouverture couverte.",
  },
  {
    id: "poutre",
    label: "Poutres",
    codes: ["PT", "POU"],
    unit: "u",
    color: "#7c3aed",
    description:
      "Poutres du plancher : deux traits parallèles (ou axe en trait mixte) franchissant une portée entre deux appuis, souvent avec cote de section (ex. 20x40), repérées sur les plans de coffrage. Une unité par poutre, d'appui à appui.",
  },
  {
    id: "relevee",
    label: "Relevées",
    codes: ["REL"],
    unit: "ml",
    color: "#db2777",
    description:
      "Relevés en béton (acrotères, relevés d'étanchéité, rehausses en rive de plancher) : bandes linéaires en rive ou en périphérie sur le plan du plancher haut du rez-de-chaussée. Se métrent en mètres linéaires le long de leur axe.",
  },
];

export const LEVELS: LevelDef[] = [
  {
    id: "fondations",
    label: "Niveau Fondations",
    articleIds: ["sf", "si", "jonction_angle", "attr", "attp", "lg", "beche"],
  },
  {
    id: "ph_vs",
    label: "Plancher haut du vide sanitaire",
    articleIds: [
      "ch",
      "jonction_ch",
      "raid",
      "attr",
      "attp",
      "pot",
      "lt",
      "lg",
      "beche",
      "poutre",
    ],
  },
  {
    id: "ph_rdc",
    label: "Plancher haut du rez-de-chaussée",
    articleIds: [
      "ch",
      "jonction_ch",
      "raid",
      "attr",
      "attp",
      "pot",
      "lt",
      "beche",
      "poutre",
      "relevee",
    ],
  },
  {
    id: "ph_etage",
    label: "Plancher haut d'étage",
    articleIds: ["ch", "jonction_ch", "raid", "pot", "lt", "poutre"],
  },
];

export function getArticle(id: string): ArticleDef | undefined {
  return ARTICLES.find((a) => a.id === id);
}

export function getLevel(id: string | null | undefined): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id);
}

/** Articles attendus pour un niveau donné ; tout le catalogue si niveau inconnu. */
export function articlesForLevel(levelId: string | null | undefined): ArticleDef[] {
  const level = getLevel(levelId);
  if (!level) return ARTICLES;
  return level.articleIds
    .map((id) => getArticle(id))
    .filter((a): a is ArticleDef => Boolean(a));
}

export function unitLabel(unit: Unit): string {
  return unit === "ml" ? "mètres linéaires" : "unités";
}
