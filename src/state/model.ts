// Modèle de données du frontend : un projet = un dossier de plans.

import type { Calibration, Layer, PageOverview, VectorLine, VectorTextItem } from "../../shared/types";

export interface ProjectPage {
  id: string;
  /** Nom d'origine, ex. "plan.pdf — page 2". */
  name: string;
  /** Image PNG de la page (data URL), base de l'analyse et de l'affichage. */
  imageDataUrl: string;
  width: number;
  height: number;
  /** Pixels par point PDF — présent si la page vient d'un PDF (calibration exacte possible). */
  renderScale?: number;
  /** Contenu vectoriel extrait du PDF (absent pour les images et anciens projets). */
  vectorText?: VectorTextItem[];
  vectorLines?: VectorLine[];
  /** Niveau du bâtiment auquel la page est rattachée (modifiable par l'utilisateur). */
  levelId: string | null;
  /** Résultat de l'agent orchestrateur pour cette page. */
  overview?: PageOverview;
  /** Calibration d'échelle retenue (IA ou manuelle). */
  calibration: Calibration | null;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  pages: ProjectPage[];
  /** Calques vectorisés, un par couple (page, article). */
  layers: Layer[];
  globalRemarks?: string;
  /** Modèle OpenRouter choisi pour ce projet (sinon défaut serveur). */
  model?: string;
}

export function layerKey(pageId: string, articleId: string): string {
  return `${pageId}::${articleId}`;
}

export function findLayer(project: Project, pageId: string, articleId: string): Layer | undefined {
  return project.layers.find((l) => l.pageId === pageId && l.articleId === articleId);
}
