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
  /** "vecteur" : élément issu d'un repère textuel extrait du PDF (déterministe). */
  source: "ia" | "manuel" | "vecteur";
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

/**
 * Calibration d'échelle d'une page. Deux modes :
 * - "segment" : deux points de l'image dont la distance réelle est connue (cote) ;
 * - "scale"   : échelle nominale d'un PDF vectoriel (1/denominator). Le PDF ayant
 *   des dimensions physiques exactes (1 pt = 1/72 pouce), metersPerPx est calculé
 *   mathématiquement — aucune erreur possible tant que le PDF est à l'échelle.
 */
export type Calibration =
  | {
      kind?: "segment";
      a: Pt;
      b: Pt;
      meters: number;
      source: "ia" | "manuel";
    }
  | {
      kind: "scale";
      /** Dénominateur de l'échelle, ex. 50 pour 1/50. */
      denominator: number;
      /** Mètres réels par pixel de l'image rendue (précalculé, exact). */
      metersPerPx: number;
      source: "auto" | "manuel";
    };

/** Texte extrait du contenu vectoriel d'un PDF, position normalisée 0..1000. */
export interface VectorTextItem {
  text: string;
  x: number;
  y: number;
}

/** Segment de ligne extrait du contenu vectoriel d'un PDF, normalisé 0..1000. */
export interface VectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Ancre déterministe : repère textuel trouvé dans le contenu vectoriel. */
export interface Seed {
  label: string;
  x: number;
  y: number;
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
  /** Ancres déterministes : repères de cet article extraits du texte vectoriel du PDF. */
  seeds?: Seed[];
  /**
   * "detect" (défaut) : détection complète.
   * "verify" : passe de vérification — le modèle critique les éléments existants
   * (ajoute les manqués, retire les faux, corrige les positions).
   */
  mode?: "detect" | "verify";
  /** Éléments actuels du calque, pour le mode "verify". */
  existing?: { label?: string; points: Pt[] }[];
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
