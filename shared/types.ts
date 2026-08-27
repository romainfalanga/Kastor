// Types partagés entre le frontend (src/) et le Worker Cloudflare (worker/).

/** Unité de quantification d'un article : mètres linéaires ou unités comptées. */
export type Unit = "ml" | "u";

export interface ArticleDef {
  id: string;
  /** Libellé affiché, ex. "Semelles filantes". */
  label: string;
  /** Repères/abréviations rencontrés sur les plans, ex. ["SF"]. */
  codes: string[];
  unit: Unit;
  /** Couleur du calque dans la visionneuse. */
  color: string;
  /** Comment reconnaître cet élément sur un plan — utilisé dans le prompt du sous-agent et l'aide UI. */
  description: string;
}

export interface LevelDef {
  id: string;
  label: string;
  /** Articles attendus à ce niveau, dans l'ordre de gestion des métrés. */
  articleIds: string[];
}

/**
 * Point en coordonnées normalisées 0..1000 sur l'image de la page :
 * x de gauche à droite, y de haut en bas. Indépendant de la résolution.
 */
export interface Pt {
  x: number;
  y: number;
}

export interface LayerElement {
  id: string;
  /** Repère lu sur le plan, ex. "SF1", "P3", "CH2". */
  label?: string;
  /**
   * Géométrie : 1 point pour un article compté en unités,
   * >= 2 points (polyligne) pour un article métré en ml.
   */
  points: Pt[];
  source: "ia" | "manuel";
}

export type LayerStatus = "pending" | "running" | "done" | "error";

export interface Layer {
  articleId: string;
  pageId: string;
  elements: LayerElement[];
  status: LayerStatus;
  error?: string;
  /** Remarques du sous-agent (ambiguïtés, éléments incertains…). */
  notes?: string;
}

/** Ligne de cote repérée par l'IA, utilisable pour calibrer l'échelle. */
export interface ScaleHint {
  a: Pt;
  b: Pt;
  /** Distance réelle en mètres indiquée par la cote. */
  meters: number;
  description?: string;
}

/** Calibration retenue pour une page : deux points de l'image et la distance réelle. */
export interface Calibration {
  a: Pt;
  b: Pt;
  meters: number;
  source: "ia" | "manuel";
}

export interface PageOverview {
  pageId: string;
  /** Type de plan identifié, ex. "plan de fondations", "plan de coffrage". */
  planType: string;
  /** Niveau du catalogue auquel la page se rattache (null si indéterminé). */
  levelId: string | null;
  /** Échelle lue dans le cartouche, ex. "1/50". */
  scaleText?: string;
  /** Articles du catalogue détectés comme présents sur cette page. */
  articleIds: string[];
  scaleHint?: ScaleHint;
  /** Légende/symboles relevés, transmis aux sous-agents. */
  legendNotes?: string;
  remarks?: string;
}

// ---------------------------------------------------------------------------
// Contrats d'API Worker
// ---------------------------------------------------------------------------

export interface AnalyzeOverviewRequest {
  pages: { pageId: string; name: string; imageDataUrl: string }[];
  model?: string;
}

export interface AnalyzeOverviewResponse {
  pages: PageOverview[];
  globalRemarks?: string;
}

export interface AnalyzeLayerRequest {
  pageId: string;
  imageDataUrl: string;
  articleId: string;
  levelId: string | null;
  /** Contexte issu de l'orchestrateur : légende, échelle, remarques. */
  context?: string;
  model?: string;
}

export interface AnalyzeLayerResponse {
  articleId: string;
  pageId: string;
  elements: LayerElement[];
  notes?: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
