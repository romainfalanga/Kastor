// Moteur vectoriel déterministe : exploitation du contenu vectoriel des PDF
// (textes positionnés, segments de lignes) pour ancrer, corriger et fiabiliser
// les détections IA — sans aucune part d'interprétation.

import type {
  ArticleDef,
  LayerElement,
  Pt,
  Seed,
  Unit,
  VectorLine,
  VectorTextItem,
} from "./types";

// ---------------------------------------------------------------------------
// Repères textuels (ancres déterministes)
// ---------------------------------------------------------------------------

/**
 * Motif de repère pour un code d'article. Un code d'une seule lettre (P…)
 * exige un numéro (P1, P2) pour éviter les faux positifs ; un code multi-lettres
 * (SF, CH, ATTP…) accepte un numéro optionnel (SF, SF1, SF-2, CH2a…).
 */
function codePattern(code: string): RegExp {
  const c = escapeRegex(code);
  return code.length === 1
    ? new RegExp(`^${c}[-. ]?\\d{1,3}[a-z]?$`, "i")
    : new RegExp(`^${c}[-. ]?\\d{0,3}[a-z]?$`, "i");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Repères de cet article trouvés dans le texte vectoriel de la page.
 * Chaque item de texte est découpé en jetons ; un jeton qui matche un des codes
 * de l'article devient une ancre à la position (exacte) du texte.
 */
export function findSeeds(article: ArticleDef, texts: VectorTextItem[]): Seed[] {
  const patterns = article.codes.map(codePattern);
  const seeds: Seed[] = [];
  for (const t of texts) {
    const tokens = t.text.split(/[\s,;()]+/).filter(Boolean);
    for (const token of tokens) {
      if (patterns.some((p) => p.test(token))) {
        seeds.push({ label: token.toUpperCase(), x: t.x, y: t.y });
        break;
      }
    }
  }
  return dedupeSeeds(seeds, 6);
}

function dedupeSeeds(seeds: Seed[], tol: number): Seed[] {
  const out: Seed[] = [];
  for (const s of seeds) {
    if (!out.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < tol)) out.push(s);
  }
  return out;
}

/**
 * Détection déterministe de l'échelle nominale dans le texte vectoriel
 * (« 1/50 », « 1:50 », « ECH. 1-50 »…). Préfère une occurrence dans le quart
 * bas-droit de la page (zone du cartouche). Retourne le dénominateur ou null.
 */
export function detectScaleDenominator(texts: VectorTextItem[]): number | null {
  const re = /1\s*[:/-]\s*(\d{1,4})/;
  const candidates: { d: number; inCartouche: boolean }[] = [];
  for (const t of texts) {
    const m = re.exec(t.text);
    if (!m) continue;
    const d = Number(m[1]);
    // Échelles plausibles pour des plans de structure.
    if (![10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500].includes(d)) continue;
    candidates.push({ d, inCartouche: t.x > 550 && t.y > 550 });
  }
  if (candidates.length === 0) return null;
  const pick = candidates.find((c) => c.inCartouche) ?? candidates[0];
  return pick.d;
}

// ---------------------------------------------------------------------------
// Accrochage géométrique (snapping) sur les lignes vectorielles du PDF
// ---------------------------------------------------------------------------

function projectOnSegment(p: Pt, l: VectorLine): { pt: Pt; dist: number } {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const pt = { x: l.x1 + t * dx, y: l.y1 + t * dy };
  return { pt, dist: Math.hypot(p.x - pt.x, p.y - pt.y) };
}

/**
 * Accroche un point sur la géométrie vectorielle : d'abord sur l'extrémité de
 * segment la plus proche (les nœuds du dessin sont les positions exactes des
 * angles/jonctions), sinon sur la projection sur le segment le plus proche.
 * Retourne le point inchangé si rien n'est à portée.
 */
export function snapPoint(p: Pt, lines: VectorLine[], tol: number): Pt {
  let bestEnd: { pt: Pt; dist: number } | null = null;
  let bestProj: { pt: Pt; dist: number } | null = null;
  for (const l of lines) {
    for (const end of [
      { x: l.x1, y: l.y1 },
      { x: l.x2, y: l.y2 },
    ]) {
      const d = Math.hypot(p.x - end.x, p.y - end.y);
      if (!bestEnd || d < bestEnd.dist) bestEnd = { pt: end, dist: d };
    }
    const proj = projectOnSegment(p, l);
    if (!bestProj || proj.dist < bestProj.dist) bestProj = proj;
  }
  // Une extrémité proche est prioritaire (angles exacts), sinon la projection.
  if (bestEnd && bestEnd.dist <= tol * 0.9) return bestEnd.pt;
  if (bestProj && bestProj.dist <= tol) return bestProj.pt;
  return p;
}

export function snapPolyline(points: Pt[], lines: VectorLine[], tol: number): Pt[] {
  if (lines.length === 0) return points;
  return points.map((p) => snapPoint(p, lines, tol));
}

// ---------------------------------------------------------------------------
// Jonctions déduites algorithmiquement du réseau linéaire
// ---------------------------------------------------------------------------

interface Seg {
  a: Pt;
  b: Pt;
  owner: number;
}

/**
 * Déduit les JONCTIONS d'un réseau de polylignes (semelles filantes, chaînages)
 * de façon purement algorithmique — zéro IA, zéro erreur d'interprétation :
 * - angles : sommet intérieur d'une polyligne dont la direction change (L) ;
 * - raccords en T / bout-à-bout : extrémité d'une polyligne qui touche une
 *   autre polyligne ;
 * - croisements : intersection franche entre segments de polylignes distinctes.
 */
export function deriveJunctions(polylines: Pt[][], tol = 8): Pt[] {
  const nodes: Pt[] = [];
  const segs: Seg[] = [];
  polylines.forEach((pl, owner) => {
    for (let i = 1; i < pl.length; i++) segs.push({ a: pl[i - 1], b: pl[i], owner });
  });

  // 1. Angles internes (changement de direction >= 25°).
  for (const pl of polylines) {
    for (let i = 1; i < pl.length - 1; i++) {
      if (directionChangeDeg(pl[i - 1], pl[i], pl[i + 1]) >= 25) nodes.push(pl[i]);
    }
  }

  // 2. Extrémités touchant une autre polyligne (T et raccords).
  polylines.forEach((pl, owner) => {
    if (pl.length === 0) return;
    for (const end of [pl[0], pl[pl.length - 1]]) {
      for (const seg of segs) {
        if (seg.owner === owner) continue;
        const { pt, dist } = projectPointOnSeg(end, seg);
        if (dist <= tol) {
          nodes.push(pt);
          break;
        }
      }
    }
  });

  // 3. Croisements francs entre polylignes distinctes.
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].owner === segs[j].owner) continue;
      const x = segmentIntersection(segs[i], segs[j]);
      if (x) nodes.push(x);
    }
  }

  // Dédoublonnage des nœuds confondus.
  const out: Pt[] = [];
  for (const n of nodes) {
    if (!out.some((o) => Math.hypot(o.x - n.x, o.y - n.y) < tol * 1.2)) out.push(n);
  }
  return out;
}

function directionChangeDeg(a: Pt, b: Pt, c: Pt): number {
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const lu = Math.hypot(u.x, u.y);
  const lv = Math.hypot(v.x, v.y);
  if (lu === 0 || lv === 0) return 0;
  const cos = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function projectPointOnSeg(p: Pt, s: Seg): { pt: Pt; dist: number } {
  return projectOnSegment(p, { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y });
}

/** Intersection franche (hors extrémités) de deux segments, ou null. */
function segmentIntersection(s1: Seg, s2: Seg): Pt | null {
  const d1x = s1.b.x - s1.a.x;
  const d1y = s1.b.y - s1.a.y;
  const d2x = s2.b.x - s2.a.x;
  const d2y = s2.b.y - s2.a.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((s2.a.x - s1.a.x) * d2y - (s2.a.y - s1.a.y) * d2x) / denom;
  const u = ((s2.a.x - s1.a.x) * d1y - (s2.a.y - s1.a.y) * d1x) / denom;
  const margin = 0.02;
  if (t < margin || t > 1 - margin || u < margin || u > 1 - margin) return null;
  return { x: s1.a.x + t * d1x, y: s1.a.y + t * d1y };
}

// ---------------------------------------------------------------------------
// Fusion ancres + détections IA, et dédoublonnage
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<string, number> = { manuel: 3, vecteur: 2, ia: 1 };

function elementAnchor(el: LayerElement): Pt {
  return el.points[0];
}

/**
 * Fusion déterministe pour les articles comptés en unités :
 * - une détection IA proche d'une ancre récupère le label exact du repère ;
 * - une ancre sans détection à portée devient un élément à part entière
 *   (source "vecteur") : le repère écrit sur le plan fait foi.
 */
export function mergeSeedsWithElements(
  unit: Unit,
  elements: LayerElement[],
  seeds: Seed[],
  tol: number,
): LayerElement[] {
  if (unit !== "u" || seeds.length === 0) return elements;
  const out = elements.map((el) => ({ ...el }));
  const unmatched: Seed[] = [];
  for (const seed of seeds) {
    let best: { el: LayerElement; dist: number } | null = null;
    for (const el of out) {
      const a = elementAnchor(el);
      const d = Math.hypot(a.x - seed.x, a.y - seed.y);
      if (!best || d < best.dist) best = { el, dist: d };
    }
    if (best && best.dist <= tol) {
      if (!best.el.label) best.el.label = seed.label;
    } else {
      unmatched.push(seed);
    }
  }
  for (const seed of unmatched) {
    out.push({
      id: crypto.randomUUID(),
      label: seed.label,
      points: [{ x: seed.x, y: seed.y }],
      source: "vecteur",
    });
  }
  return out;
}

/**
 * Dédoublonnage des articles en unités : deux éléments à moins de `tol` l'un de
 * l'autre sont un seul et même élément ; on garde le plus fiable
 * (manuel > vecteur > ia).
 */
export function dedupeUnitElements(elements: LayerElement[], tol: number): LayerElement[] {
  const sorted = [...elements].sort(
    (a, b) => (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0),
  );
  const out: LayerElement[] = [];
  for (const el of sorted) {
    const a = elementAnchor(el);
    const dup = out.find((o) => {
      const b = elementAnchor(o);
      return Math.hypot(a.x - b.x, a.y - b.y) < tol;
    });
    if (!dup) out.push(el);
    else if (!dup.label && el.label) dup.label = el.label;
  }
  return out;
}
