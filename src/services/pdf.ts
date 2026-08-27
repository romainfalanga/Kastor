// Conversion des documents (PDF, JPEG, PNG) en pages exploitables.
// Pour les PDF, on extrait aussi le CONTENU VECTORIEL : textes positionnés
// (repères, cotes, échelle) et segments de lignes du dessin — données exactes
// qui servent d'ancres déterministes au pipeline (voir shared/vector.ts).

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { VectorLine, VectorTextItem } from "../../shared/types";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Dimension max (px) du grand côté des pages rendues — compromis lisibilité / poids des requêtes. */
const MAX_DIM = 2200;
const MAX_TEXT_ITEMS = 4000;
const MAX_LINES = 12000;

export interface RenderedPage {
  name: string;
  imageDataUrl: string;
  width: number;
  height: number;
  /** Pixels par point PDF (px/pt) — présent uniquement pour les pages issues de PDF. */
  renderScale?: number;
  /** Textes vectoriels extraits (PDF uniquement), coordonnées normalisées 0..1000. */
  vectorText: VectorTextItem[];
  /** Segments de lignes vectoriels extraits (PDF uniquement), normalisés 0..1000. */
  vectorLines: VectorLine[];
}

export async function fileToPages(file: File): Promise<RenderedPage[]> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return pdfToPages(file);
  }
  if (file.type.startsWith("image/")) {
    return [await imageToPage(file)];
  }
  throw new Error(`Format non pris en charge : ${file.name} (PDF, JPEG ou PNG attendus).`);
}

async function pdfToPages(file: File): Promise<RenderedPage[]> {
  const data = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: RenderedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(4, MAX_DIM / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Extraction vectorielle — best effort : en cas d'échec (PDF exotique),
    // la page reste exploitable par la voie IA classique.
    let vectorText: VectorTextItem[] = [];
    let vectorLines: VectorLine[] = [];
    try {
      vectorText = await extractText(page, viewport, canvas.width, canvas.height);
    } catch {
      vectorText = [];
    }
    try {
      vectorLines = await extractLines(page, viewport, canvas.width, canvas.height);
    } catch {
      vectorLines = [];
    }

    pages.push({
      name: doc.numPages > 1 ? `${file.name} — page ${i}` : file.name,
      imageDataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      renderScale: scale,
      vectorText,
      vectorLines,
    });
  }
  await doc.destroy();
  return pages;
}

type PdfPage = Awaited<ReturnType<Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>["getPage"]>>;
type Viewport = ReturnType<PdfPage["getViewport"]>;

async function extractText(
  page: PdfPage,
  viewport: Viewport,
  width: number,
  height: number,
): Promise<VectorTextItem[]> {
  const content = await page.getTextContent();
  const out: VectorTextItem[] = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const str = item.str.trim();
    if (!str) continue;
    const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
    out.push({
      text: str,
      x: clamp1000((m[4] / width) * 1000),
      y: clamp1000((m[5] / height) * 1000),
    });
    if (out.length >= MAX_TEXT_ITEMS) break;
  }
  return out;
}

/**
 * Parcourt la liste d'opérateurs de rendu du PDF et en extrait les segments de
 * lignes (moveTo/lineTo/rectangle), transformés en coordonnées image normalisées.
 * Les courbes sont ignorées (le point courant avance sans émettre de segment).
 */
async function extractLines(
  page: PdfPage,
  viewport: Viewport,
  width: number,
  height: number,
): Promise<VectorLine[]> {
  const OPS = pdfjsLib.OPS;
  const opList = await page.getOperatorList();
  const lines: VectorLine[] = [];
  const seen = new Set<string>();
  const ctmStack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];

  const applyPoint = (x: number, y: number): { x: number; y: number } => {
    const m = pdfjsLib.Util.transform(viewport.transform, ctm);
    return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
  };

  const pushLine = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (lines.length >= MAX_LINES) return;
    const l: VectorLine = {
      x1: clamp1000((a.x / width) * 1000),
      y1: clamp1000((a.y / height) * 1000),
      x2: clamp1000((b.x / width) * 1000),
      y2: clamp1000((b.y / height) * 1000),
    };
    // Ignore les segments trop courts (bruit) et les doublons exacts.
    if (Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 2) return;
    const key = [l.x1, l.y1, l.x2, l.y2].map((v) => Math.round(v * 2)).join(",");
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(l);
  };

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];
    if (fn === OPS.save) {
      ctmStack.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = ctmStack.pop() ?? [1, 0, 0, 1, 0, 0];
    } else if (fn === OPS.transform) {
      ctm = pdfjsLib.Util.transform(ctm, args as number[]);
    } else if (fn === OPS.constructPath) {
      const [pathOps, pathArgs] = args as [number[], number[] | Float32Array];
      let ai = 0;
      let current: { x: number; y: number } | null = null;
      let subpathStart: { x: number; y: number } | null = null;
      for (const op of pathOps) {
        if (op === OPS.moveTo) {
          current = applyPoint(pathArgs[ai], pathArgs[ai + 1]);
          subpathStart = current;
          ai += 2;
        } else if (op === OPS.lineTo) {
          const next = applyPoint(pathArgs[ai], pathArgs[ai + 1]);
          if (current) pushLine(current, next);
          current = next;
          ai += 2;
        } else if (op === OPS.rectangle) {
          const x = pathArgs[ai];
          const y = pathArgs[ai + 1];
          const w = pathArgs[ai + 2];
          const h = pathArgs[ai + 3];
          const p1 = applyPoint(x, y);
          const p2 = applyPoint(x + w, y);
          const p3 = applyPoint(x + w, y + h);
          const p4 = applyPoint(x, y + h);
          pushLine(p1, p2);
          pushLine(p2, p3);
          pushLine(p3, p4);
          pushLine(p4, p1);
          ai += 4;
        } else if (op === OPS.curveTo) {
          current = applyPoint(pathArgs[ai + 4], pathArgs[ai + 5]);
          ai += 6;
        } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
          current = applyPoint(pathArgs[ai + 2], pathArgs[ai + 3]);
          ai += 4;
        } else if (op === OPS.closePath) {
          if (current && subpathStart) pushLine(current, subpathStart);
          current = subpathStart;
        } else {
          // Opérateur de chemin inconnu : on abandonne ce chemin par prudence.
          break;
        }
      }
    }
    if (lines.length >= MAX_LINES) break;
  }
  return lines;
}

function clamp1000(v: number): number {
  return Math.min(1000, Math.max(0, Math.round(v * 10) / 10));
}

async function imageToPage(file: File): Promise<RenderedPage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Impossible de lire l'image ${file.name}.`));
      el.src = url;
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      name: file.name,
      imageDataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
      vectorText: [],
      vectorLines: [],
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
