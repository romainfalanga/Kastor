// Moteur de calcul algorithmique des métrés.
// L'IA vectorise (points et polylignes en coordonnées normalisées 0..1000) ;
// tout ce qui est quantitatif est calculé ici, de façon déterministe.

import type { Calibration, LayerElement, Pt, Unit } from "./types";

/** Dimensions en pixels de l'image d'une page (pour dé-normaliser les coordonnées). */
export interface PageDims {
  width: number;
  height: number;
}

/** Convertit un point normalisé 0..1000 en pixels image. */
export function toPx(p: Pt, dims: PageDims): { x: number; y: number } {
  return { x: (p.x / 1000) * dims.width, y: (p.y / 1000) * dims.height };
}

/** Distance en pixels entre deux points normalisés. */
export function distPx(a: Pt, b: Pt, dims: PageDims): number {
  const pa = toPx(a, dims);
  const pb = toPx(b, dims);
  return Math.hypot(pb.x - pa.x, pb.y - pa.y);
}

/** Longueur en pixels d'une polyligne (somme des segments). */
export function polylineLengthPx(points: Pt[], dims: PageDims): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distPx(points[i - 1], points[i], dims);
  }
  return total;
}

/** Mètres par point PDF pour une échelle nominale 1/D : 1 pt = 1/72 pouce réel × D. */
export function metersPerPdfPoint(denominator: number): number {
  return (0.0254 / 72) * denominator;
}

/**
 * Facteur mètres/pixel issu de la calibration de la page :
 * - mode "scale"   : valeur exacte précalculée depuis l'échelle nominale du PDF ;
 * - mode "segment" : distance réelle connue entre deux points de l'image.
 * Retourne null si la calibration est dégénérée.
 */
export function metersPerPx(cal: Calibration, dims: PageDims): number | null {
  if (cal.kind === "scale") {
    return cal.metersPerPx > 0 ? cal.metersPerPx : null;
  }
  const d = distPx(cal.a, cal.b, dims);
  if (d <= 0 || cal.meters <= 0) return null;
  return cal.meters / d;
}

/**
 * Quantité d'un élément :
 * - article en "u"  → 1 par élément ;
 * - article en "ml" → longueur réelle de la polyligne en mètres
 *   (null si la page n'est pas calibrée).
 */
export function elementQuantity(
  unit: Unit,
  element: LayerElement,
  cal: Calibration | null,
  dims: PageDims,
): number | null {
  if (unit === "u") return 1;
  if (!cal) return null;
  const mpp = metersPerPx(cal, dims);
  if (mpp === null) return null;
  return polylineLengthPx(element.points, dims) * mpp;
}

/**
 * Quantité totale d'un calque : nombre d'éléments (u) ou somme des longueurs (ml).
 * Retourne null pour un calque en ml sans calibration.
 */
export function layerQuantity(
  unit: Unit,
  elements: LayerElement[],
  cal: Calibration | null,
  dims: PageDims,
): number | null {
  if (unit === "u") return elements.length;
  let total = 0;
  for (const el of elements) {
    const q = elementQuantity(unit, el, cal, dims);
    if (q === null) return null;
    total += q;
  }
  return total;
}

/** Arrondi d'affichage : 2 décimales pour les ml, entier pour les unités. */
export function formatQuantity(unit: Unit, qty: number | null): string {
  if (qty === null) return "—";
  if (unit === "u") return String(Math.round(qty));
  return qty.toFixed(2);
}

/** Borne un point dans le domaine normalisé 0..1000. */
export function clampPt(p: Pt): Pt {
  return {
    x: Math.min(1000, Math.max(0, p.x)),
    y: Math.min(1000, Math.max(0, p.y)),
  };
}
