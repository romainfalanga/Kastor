// Vectorisation raster : pour les scans, photos et PDF scannés (sans contenu
// vectoriel natif), on reconstruit des données pseudo-vectorielles :
// - segments de lignes par détection de contours (avec tolérance aux traits
//   interrompus, fréquents sur les plans : semelles, éléments cachés) ;
// - textes (repères, échelle) par OCR (tesseract.js, chargé à la demande).
// Ces données alimentent les mêmes mécanismes (ancres, accrochage, échelle)
// que les PDF vectoriels — avec une fiabilité moindre, signalée à l'utilisateur.

import type { VectorLine, VectorTextItem } from "../../shared/types";

/** Largeur d'analyse : l'image est réduite pour accélérer la détection. */
const DETECT_DIM = 1600;
/** Longueur minimale d'un segment retenu (px à l'échelle d'analyse). */
const MIN_RUN = 14;
/** Interruption maximale tolérée à l'intérieur d'un trait (traits pointillés). */
const MAX_GAP = 6;
/** Seuil d'encre : luminance en dessous de laquelle un pixel est du trait. */
const INK_THRESHOLD = 150;
const MAX_LINES = 8000;

export interface RasterExtraction {
  lines: VectorLine[];
  text: VectorTextItem[];
}

export async function extractRasterData(
  imageDataUrl: string,
  options: { lines: boolean; ocr: boolean },
): Promise<RasterExtraction> {
  const img = await loadImage(imageDataUrl);
  const scale = Math.min(1, DETECT_DIM / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { lines: [], text: [] };
  ctx.drawImage(img, 0, 0, w, h);

  let lines: VectorLine[] = [];
  if (options.lines) {
    try {
      lines = extractLines(ctx.getImageData(0, 0, w, h));
    } catch {
      lines = [];
    }
  }

  let text: VectorTextItem[] = [];
  if (options.ocr) {
    try {
      text = await ocrCanvas(canvas);
    } catch {
      text = [];
    }
  }

  return { lines, text };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible pour la vectorisation."));
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Détection de segments par contours
// ---------------------------------------------------------------------------

/**
 * Détecte les segments horizontaux et verticaux à partir des CONTOURS du dessin
 * (transition papier → encre) : cela fonctionne aussi bien pour un trait fin que
 * pour un mur poché épais (dont on récupère les deux bords). Les plans étant
 * dominés par des tracés orthogonaux, cette approche couvre l'essentiel des
 * besoins d'accrochage ; les obliques restent gérées par l'IA.
 */
function extractLines(data: ImageData): VectorLine[] {
  const { width: w, height: h } = data;
  const px = data.data;
  const ink = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const lum = 0.299 * px[o] + 0.587 * px[o + 1] + 0.114 * px[o + 2];
    ink[i] = lum < INK_THRESHOLD ? 1 : 0;
  }

  const lines: VectorLine[] = [];
  const norm = (v: number, size: number) => Math.round((v / size) * 10000) / 10;

  // Contours horizontaux : pixel encré dont le voisin du dessus ne l'est pas.
  for (let y = 1; y < h; y++) {
    let runStart = -1;
    let gap = 0;
    for (let x = 0; x <= w; x++) {
      const isEdge = x < w && ink[y * w + x] === 1 && ink[(y - 1) * w + x] === 0;
      if (isEdge) {
        if (runStart === -1) runStart = x;
        gap = 0;
      } else if (runStart !== -1) {
        gap++;
        if (gap > MAX_GAP || x === w) {
          const end = x - gap;
          if (end - runStart >= MIN_RUN) {
            lines.push({ x1: norm(runStart, w), y1: norm(y, h), x2: norm(end, w), y2: norm(y, h) });
          }
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (lines.length >= MAX_LINES) return mergeCollinear(lines);
  }

  // Contours verticaux : pixel encré dont le voisin de gauche ne l'est pas.
  for (let x = 1; x < w; x++) {
    let runStart = -1;
    let gap = 0;
    for (let y = 0; y <= h; y++) {
      const isEdge = y < h && ink[y * w + x] === 1 && ink[y * w + x - 1] === 0;
      if (isEdge) {
        if (runStart === -1) runStart = y;
        gap = 0;
      } else if (runStart !== -1) {
        gap++;
        if (gap > MAX_GAP || y === h) {
          const end = y - gap;
          if (end - runStart >= MIN_RUN) {
            lines.push({ x1: norm(x, w), y1: norm(runStart, h), x2: norm(x, w), y2: norm(end, h) });
          }
          runStart = -1;
          gap = 0;
        }
      }
    }
    if (lines.length >= MAX_LINES) break;
  }

  return mergeCollinear(lines);
}

/** Fusionne les segments colinéaires proches (traits interrompus longs). */
function mergeCollinear(lines: VectorLine[]): VectorLine[] {
  const tol = 1.5; // en unités normalisées (0..1000)
  const gapTol = 14;
  const horizontal = lines.filter((l) => l.y1 === l.y2).sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const vertical = lines.filter((l) => l.x1 === l.x2).sort((a, b) => a.x1 - b.x1 || a.y1 - b.y1);
  const out: VectorLine[] = [];

  const mergeAxis = (
    items: VectorLine[],
    fixed: (l: VectorLine) => number,
    lo: (l: VectorLine) => number,
    hi: (l: VectorLine) => number,
    make: (fixedV: number, a: number, b: number) => VectorLine,
  ) => {
    let cur: { f: number; a: number; b: number } | null = null;
    for (const l of items) {
      const f = fixed(l);
      const a = Math.min(lo(l), hi(l));
      const b = Math.max(lo(l), hi(l));
      if (cur && Math.abs(cur.f - f) <= tol && a - cur.b <= gapTol && b >= cur.a - gapTol) {
        cur.a = Math.min(cur.a, a);
        cur.b = Math.max(cur.b, b);
      } else {
        if (cur) out.push(make(cur.f, cur.a, cur.b));
        cur = { f, a, b };
      }
    }
    if (cur) out.push(make(cur.f, cur.a, cur.b));
  };

  mergeAxis(horizontal, (l) => l.y1, (l) => l.x1, (l) => l.x2, (f, a, b) => ({ x1: a, y1: f, x2: b, y2: f }));
  mergeAxis(vertical, (l) => l.x1, (l) => l.y1, (l) => l.y2, (f, a, b) => ({ x1: f, y1: a, x2: f, y2: b }));
  return out;
}

// ---------------------------------------------------------------------------
// OCR (tesseract.js, chargé dynamiquement)
// ---------------------------------------------------------------------------

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<VectorTextItem[]> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(canvas);
    const out: VectorTextItem[] = [];
    type OcrWord = { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } };
    const words: OcrWord[] = [];
    const blocks = (data as unknown as { blocks?: { paragraphs?: { lines?: { words?: OcrWord[] }[] }[] }[] }).blocks ?? [];
    for (const block of blocks) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          for (const word of line.words ?? []) words.push(word);
        }
      }
    }
    for (const word of words) {
      const text = word.text?.trim();
      if (!text || text.length > 14 || (word.confidence ?? 0) < 40) continue;
      if (!/[A-Za-z0-9]/.test(text)) continue;
      out.push({
        text,
        x: Math.round(((word.bbox.x0 + word.bbox.x1) / 2 / canvas.width) * 10000) / 10,
        y: Math.round(((word.bbox.y0 + word.bbox.y1) / 2 / canvas.height) * 10000) / 10,
      });
      if (out.length >= 2000) break;
    }
    return out;
  } finally {
    await worker.terminate();
  }
}
