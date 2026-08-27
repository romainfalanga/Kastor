// Store applicatif (zustand) : projets, pipeline d'analyse, édition des calques.

import { create } from "zustand";
import { articlesForLevel, getArticle } from "../../shared/catalog";
import { metersPerPdfPoint } from "../../shared/geometry";
import type { ArticleDef, Calibration, Layer, LayerElement, PageOverview, Pt } from "../../shared/types";
import {
  dedupeUnitElements,
  deriveJunctions,
  detectScaleDenominator,
  findSeeds,
  mergeSeedsWithElements,
  snapPolyline,
} from "../../shared/vector";
import { analyzeLayer, analyzeOverview } from "../services/api";
import { fileToPages } from "../services/pdf";
import { extractRasterData } from "../services/raster";
import * as storage from "../services/storage";
import { findLayer, type Project, type ProjectPage } from "./model";

/** Pages par appel modèle pour l'analyse générale (le dossier lui-même n'a pas de limite). */
const OVERVIEW_BATCH_SIZE = 8;
/** Tolérances (coordonnées normalisées 0..1000). */
const SNAP_TOL = 6;
const SEED_MATCH_TOL = 18;
const DEDUPE_TOL = 8;

export interface AnalysisProgress {
  stage: "import" | "overview" | "layers";
  label: string;
  done: number;
  total: number;
}

/** Analyses de calques menées en parallèle (limite douce pour OpenRouter). */
const LAYER_CONCURRENCY = 3;

// Sauvegarde locale différée : les mutations rapprochées (déplacement de
// points…) ne déclenchent qu'une seule écriture IndexedDB.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: Project | null = null;

function scheduleSave(project: Project): void {
  pendingSave = project;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (pendingSave) void storage.saveProject(pendingSave);
    pendingSave = null;
    saveTimer = null;
  }, 600);
}

function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingSave) {
    void storage.saveProject(pendingSave);
    pendingSave = null;
  }
}

interface KastorState {
  projects: Project[];
  current: Project | null;
  busy: boolean;
  progress: AnalysisProgress | null;
  error: string | null;

  init: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  openProject: (id: string) => void;
  closeProject: () => void;
  removeProject: (id: string) => Promise<void>;
  setModel: (model: string) => void;

  addFiles: (files: File[]) => Promise<void>;
  removePage: (pageId: string) => void;
  setPageLevel: (pageId: string, levelId: string | null) => void;
  setCalibration: (pageId: string, cal: Calibration | null) => void;
  /** Calibration exacte par échelle nominale (PDF vectoriels uniquement). */
  setPageScale: (pageId: string, denominator: number) => void;

  runFullAnalysis: () => Promise<void>;
  runOverview: () => Promise<void>;
  runLayersForPage: (pageId: string) => Promise<void>;
  runLayer: (pageId: string, articleId: string) => Promise<void>;
  /** Passe de vérification : le sous-agent critique les éléments actuels du calque. */
  verifyLayer: (pageId: string, articleId: string) => Promise<void>;
  /** Jonctions déduites algorithmiquement du réseau linéaire (sf → jonction_angle, ch → jonction_ch). */
  deriveJunctionLayer: (pageId: string, junctionArticleId: string) => void;

  addElement: (pageId: string, articleId: string, points: Pt[], label?: string) => void;
  updateElementPoints: (pageId: string, articleId: string, elementId: string, points: Pt[]) => void;
  deleteElement: (pageId: string, articleId: string, elementId: string) => void;

  clearError: () => void;
}

function touch(project: Project): Project {
  return { ...project, updatedAt: Date.now() };
}

export const useKastor = create<KastorState>((set, get) => {
  /** Applique une mutation au projet courant, la persiste (différé) et met à jour la liste. */
  function mutate(fn: (p: Project) => Project): void {
    const current = get().current;
    if (!current) return;
    const next = touch(fn(current));
    set({
      current: next,
      projects: get().projects.map((p) => (p.id === next.id ? next : p)),
    });
    scheduleSave(next);
  }

  function mutateLayer(pageId: string, articleId: string, fn: (l: Layer) => Layer): void {
    mutate((p) => {
      const existing = findLayer(p, pageId, articleId);
      const base: Layer =
        existing ?? { pageId, articleId, elements: [], status: "done" };
      const nextLayer = fn(base);
      const others = p.layers.filter((l) => !(l.pageId === pageId && l.articleId === articleId));
      return { ...p, layers: [...others, nextLayer] };
    });
  }

  /**
   * Raffinage déterministe des détections d'un calque :
   * - polylignes (ml) accrochées aux lignes vectorielles exactes du PDF ;
   * - ancres textuelles (repères) fusionnées : label exact récupéré, repère
   *   sans détection ajouté comme élément (le plan fait foi) ;
   * - dédoublonnage des éléments ponctuels.
   */
  function refineElements(
    article: ArticleDef,
    page: ProjectPage,
    elements: LayerElement[],
  ): LayerElement[] {
    let els = elements;
    const lines = page.vectorLines ?? [];
    if (article.unit === "ml" && lines.length > 0) {
      els = els.map((el) =>
        el.source === "ia" ? { ...el, points: snapPolyline(el.points, lines, SNAP_TOL) } : el,
      );
    }
    if (article.unit === "u") {
      const seeds = findSeeds(article, page.vectorText ?? []);
      els = mergeSeedsWithElements("u", els, seeds, SEED_MATCH_TOL);
      els = dedupeUnitElements(els, DEDUPE_TOL);
    }
    return els;
  }

  async function analyzeOnePage(pageId: string, articleIds: string[]): Promise<void> {
    const { current } = get();
    if (!current) return;
    const page = current.pages.find((pg) => pg.id === pageId);
    if (!page) return;

    const analyzeOneArticle = async (articleId: string): Promise<void> => {
      const article = getArticle(articleId);
      if (!article) return;
      const prog = get().progress;
      if (prog) {
        set({ progress: { ...prog, label: `${page.name} — ${article.label}` } });
      }
      mutateLayer(pageId, articleId, (l) => ({ ...l, status: "running", error: undefined }));
      try {
        const seeds = findSeeds(article, page.vectorText ?? []);
        const res = await analyzeLayer({
          pageId,
          imageDataUrl: page.imageDataUrl,
          articleId,
          levelId: page.levelId,
          context: buildContext(page),
          seeds: seeds.length ? seeds : undefined,
          model: get().current?.model,
        });
        mutateLayer(pageId, articleId, (l) => ({
          ...l,
          elements: refineElements(article, page, res.elements),
          notes: res.notes,
          status: "done",
          error: undefined,
        }));
      } catch (err) {
        mutateLayer(pageId, articleId, (l) => ({
          ...l,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      }
      const p2 = get().progress;
      if (p2) set({ progress: { ...p2, done: p2.done + 1 } });
    };

    // Pool de sous-agents en parallèle (borné pour ménager l'API).
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(LAYER_CONCURRENCY, articleIds.length) }, async () => {
        while (next < articleIds.length) {
          const id = articleIds[next++];
          await analyzeOneArticle(id);
        }
      }),
    );
  }

  return {
    projects: [],
    current: null,
    busy: false,
    progress: null,
    error: null,

    init: async () => {
      const projects = await storage.loadProjects();
      set({ projects });
    },

    createProject: async (name) => {
      const project: Project = {
        id: crypto.randomUUID(),
        name: name.trim() || "Nouveau chantier",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        pages: [],
        layers: [],
      };
      await storage.saveProject(project);
      set({ projects: [project, ...get().projects], current: project });
    },

    openProject: (id) => {
      flushSave();
      const project = get().projects.find((p) => p.id === id) ?? null;
      set({ current: project, error: null });
    },

    closeProject: () => {
      flushSave();
      set({ current: null, error: null });
    },

    removeProject: async (id) => {
      if (pendingSave?.id === id) {
        pendingSave = null;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
      }
      await storage.deleteProject(id);
      set({
        projects: get().projects.filter((p) => p.id !== id),
        current: get().current?.id === id ? null : get().current,
      });
    },

    setModel: (model) => mutate((p) => ({ ...p, model: model.trim() || undefined })),

    addFiles: async (files) => {
      set({ busy: true, error: null });
      try {
        for (const file of files) {
          const rendered = await fileToPages(file);
          for (const r of rendered) {
            // Voie automatique optimale : si le document n'a pas (ou peu) de
            // contenu vectoriel natif (scan, photo, PDF scanné), on le
            // VECTORISE : détection de lignes par contours + OCR des repères.
            let vectorText = r.vectorText;
            let vectorLines = r.vectorLines;
            const needOcr = vectorText.length < 5;
            const needLines = vectorLines.length < 30;
            if (needOcr || needLines) {
              set({
                progress: {
                  stage: "import",
                  label: `Vectorisation de ${r.name}${needOcr ? " (OCR des repères en cours, ~10-30 s)" : ""}…`,
                  done: 0,
                  total: 1,
                },
              });
              const enriched = await extractRasterData(r.imageDataUrl, {
                lines: needLines,
                ocr: needOcr,
              });
              if (needLines) vectorLines = [...vectorLines, ...enriched.lines];
              if (needOcr) vectorText = [...vectorText, ...enriched.text];
            }
            // Calibration exacte immédiate si le PDF est vectoriel et que
            // l'échelle nominale est lisible dans son texte (ex. « 1/50 »).
            const denom = detectScaleDenominator(vectorText);
            const calibration: Calibration | null =
              denom && r.renderScale
                ? {
                    kind: "scale",
                    denominator: denom,
                    metersPerPx: metersPerPdfPoint(denom) / r.renderScale,
                    source: "auto",
                  }
                : null;
            const page: ProjectPage = {
              id: crypto.randomUUID(),
              name: r.name,
              imageDataUrl: r.imageDataUrl,
              width: r.width,
              height: r.height,
              renderScale: r.renderScale,
              vectorText,
              vectorLines,
              levelId: null,
              calibration,
            };
            mutate((p) => ({ ...p, pages: [...p.pages, page] }));
          }
        }
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ busy: false, progress: null });
      }
    },

    removePage: (pageId) =>
      mutate((p) => ({
        ...p,
        pages: p.pages.filter((pg) => pg.id !== pageId),
        layers: p.layers.filter((l) => l.pageId !== pageId),
      })),

    setPageLevel: (pageId, levelId) =>
      mutate((p) => ({
        ...p,
        pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, levelId } : pg)),
      })),

    setCalibration: (pageId, cal) =>
      mutate((p) => ({
        ...p,
        pages: p.pages.map((pg) => (pg.id === pageId ? { ...pg, calibration: cal } : pg)),
      })),

    setPageScale: (pageId, denominator) =>
      mutate((p) => ({
        ...p,
        pages: p.pages.map((pg) => {
          if (pg.id !== pageId || !pg.renderScale || denominator <= 0) return pg;
          return {
            ...pg,
            calibration: {
              kind: "scale",
              denominator,
              metersPerPx: metersPerPdfPoint(denominator) / pg.renderScale,
              source: "manuel",
            },
          };
        }),
      })),

    runOverview: async () => {
      const { current } = get();
      if (!current || current.pages.length === 0) return;
      // Découpage automatique en lots : aucun plafond sur la taille du dossier.
      const batches: ProjectPage[][] = [];
      for (let i = 0; i < current.pages.length; i += OVERVIEW_BATCH_SIZE) {
        batches.push(current.pages.slice(i, i + OVERVIEW_BATCH_SIZE));
      }
      set({
        busy: true,
        error: null,
        progress: {
          stage: "overview",
          label: "Analyse générale du dossier…",
          done: 0,
          total: batches.length,
        },
      });
      try {
        const overviews: PageOverview[] = [];
        const remarks: string[] = [];
        for (let i = 0; i < batches.length; i++) {
          if (batches.length > 1) {
            set({
              progress: {
                stage: "overview",
                label: `Analyse générale — lot ${i + 1}/${batches.length}`,
                done: i,
                total: batches.length,
              },
            });
          }
          const res = await analyzeOverview({
            pages: batches[i].map((p) => ({
              pageId: p.id,
              name: p.name,
              imageDataUrl: p.imageDataUrl,
            })),
            model: current.model,
          });
          overviews.push(...res.pages);
          if (res.globalRemarks) remarks.push(res.globalRemarks);
        }
        mutate((p) => ({
          ...p,
          globalRemarks: remarks.length ? remarks.join("\n") : undefined,
          pages: p.pages.map((pg) => {
            const ov = overviews.find((o) => o.pageId === pg.id);
            if (!ov) return pg;
            return {
              ...pg,
              overview: ov,
              // Le niveau proposé par l'IA ne remplace pas un choix déjà fait par l'utilisateur.
              levelId: pg.levelId ?? ov.levelId,
              // La calibration ne remplace jamais une calibration existante
              // (vectorielle auto ou manuelle). Par ordre de fiabilité :
              // échelle nominale lue (exacte si PDF), sinon cote repérée par l'IA.
              calibration: pg.calibration ?? calibrationFromOverview(pg, ov),
            };
          }),
        }));
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ busy: false, progress: null });
      }
    },

    deriveJunctionLayer: (pageId, junctionArticleId) => {
      const { current } = get();
      const page = current?.pages.find((pg) => pg.id === pageId);
      if (!current || !page) return;
      const sourceArticleId = junctionArticleId === "jonction_ch" ? "ch" : "sf";
      const sourceArticle = getArticle(sourceArticleId);
      const sourceLayer = findLayer(current, pageId, sourceArticleId);
      if (!sourceArticle || !sourceLayer || sourceLayer.elements.length === 0) {
        set({
          error: `Analysez (ou tracez) d'abord le calque « ${sourceArticle?.label ?? sourceArticleId} » sur cette page : les jonctions en sont déduites algorithmiquement.`,
        });
        return;
      }
      const polylines = sourceLayer.elements
        .map((el) => el.points)
        .filter((pts) => pts.length >= 2);
      const nodes = deriveJunctions(polylines);
      const existingLayer = findLayer(current, pageId, junctionArticleId);
      const manual = (existingLayer?.elements ?? []).filter((e) => e.source === "manuel");
      const derived: LayerElement[] = nodes.map((pt) => ({
        id: crypto.randomUUID(),
        points: [pt],
        source: "vecteur",
      }));
      mutateLayer(pageId, junctionArticleId, (l) => ({
        ...l,
        elements: dedupeUnitElements([...manual, ...derived], DEDUPE_TOL),
        status: "done",
        error: undefined,
        notes: `${nodes.length} jonction(s) déduites algorithmiquement du réseau « ${sourceArticle.label} » (angles, T, croisements) — recalculées à la demande via ⚙.`,
      }));
    },

    verifyLayer: async (pageId, articleId) => {
      const { current } = get();
      const page = current?.pages.find((pg) => pg.id === pageId);
      const article = getArticle(articleId);
      if (!current || !page || !article) return;
      const layer = findLayer(current, pageId, articleId);
      const existing = (layer?.elements ?? []).map((e) => ({ label: e.label, points: e.points }));
      set({
        busy: true,
        error: null,
        progress: {
          stage: "layers",
          label: `Vérification — ${article.label}`,
          done: 0,
          total: 1,
        },
      });
      mutateLayer(pageId, articleId, (l) => ({ ...l, status: "running", error: undefined }));
      try {
        const seeds = findSeeds(article, page.vectorText ?? []);
        const res = await analyzeLayer({
          pageId,
          imageDataUrl: page.imageDataUrl,
          articleId,
          levelId: page.levelId,
          context: buildContext(page),
          seeds: seeds.length ? seeds : undefined,
          mode: "verify",
          existing,
          model: current.model,
        });
        // Les éléments manuels sont conservés tels quels : la vérification IA
        // ne peut pas défaire une correction humaine (le dédoublonnage les
        // privilégie en cas de recouvrement).
        const manual = (layer?.elements ?? []).filter((e) => e.source === "manuel");
        mutateLayer(pageId, articleId, (l) => ({
          ...l,
          elements: refineElements(article, page, [...manual, ...res.elements]),
          notes: res.notes,
          status: "done",
          error: undefined,
        }));
      } catch (err) {
        mutateLayer(pageId, articleId, (l) => ({
          ...l,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        set({ busy: false, progress: null });
      }
    },

    runLayersForPage: async (pageId) => {
      const { current } = get();
      const page = current?.pages.find((pg) => pg.id === pageId);
      if (!current || !page) return;
      const articleIds = articlesToAnalyze(page);
      set({
        busy: true,
        error: null,
        progress: { stage: "layers", label: page.name, done: 0, total: articleIds.length },
      });
      try {
        await analyzeOnePage(pageId, articleIds);
      } finally {
        set({ busy: false, progress: null });
      }
    },

    runLayer: async (pageId, articleId) => {
      set({ busy: true, error: null, progress: { stage: "layers", label: "", done: 0, total: 1 } });
      try {
        await analyzeOnePage(pageId, [articleId]);
      } finally {
        set({ busy: false, progress: null });
      }
    },

    runFullAnalysis: async () => {
      const { current, runOverview } = get();
      if (!current || current.pages.length === 0) return;
      await runOverview();
      if (get().error) return;
      const project = get().current;
      if (!project) return;
      // Seules les pages rattachées à un niveau sont décortiquées : les coupes,
      // détails et nomenclatures (non rattachés) ne déclenchent pas d'appels inutiles.
      const perPage = project.pages
        .filter((pg) => pg.levelId !== null)
        .map((pg) => ({ pageId: pg.id, articleIds: articlesToAnalyze(pg) }));
      const total = perPage.reduce((acc, p) => acc + p.articleIds.length, 0);
      set({ busy: true, progress: { stage: "layers", label: "Analyse des calques…", done: 0, total } });
      try {
        for (const { pageId, articleIds } of perPage) {
          await analyzeOnePage(pageId, articleIds);
        }
      } finally {
        set({ busy: false, progress: null });
      }
    },

    addElement: (pageId, articleId, points, label) =>
      mutateLayer(pageId, articleId, (l) => ({
        ...l,
        status: l.status === "pending" ? "done" : l.status,
        elements: [
          ...l.elements,
          { id: crypto.randomUUID(), points, label, source: "manuel" as const },
        ],
      })),

    updateElementPoints: (pageId, articleId, elementId, points) =>
      mutateLayer(pageId, articleId, (l) => ({
        ...l,
        elements: l.elements.map((el) => (el.id === elementId ? { ...el, points } : el)),
      })),

    deleteElement: (pageId, articleId, elementId) =>
      mutateLayer(pageId, articleId, (l) => ({
        ...l,
        elements: l.elements.filter((el) => el.id !== elementId),
      })),

    clearError: () => set({ error: null }),
  };
});

/**
 * Articles à analyser pour une page : ceux détectés par l'orchestrateur,
 * complétés (union) par les articles attendus du niveau — un article attendu
 * mais non détecté vaut une vérification par son sous-agent.
 */
function articlesToAnalyze(page: ProjectPage): string[] {
  const expected = articlesForLevel(page.levelId).map((a) => a.id);
  const detected = page.overview?.articleIds ?? [];
  return [...new Set([...detected.filter((id) => expected.includes(id)), ...expected])];
}

/**
 * Calibration proposée par l'analyse générale, par ordre de fiabilité :
 * échelle nominale lue dans le cartouche (exacte pour un PDF vectoriel),
 * sinon cote repérée visuellement par l'IA (approximative).
 */
function calibrationFromOverview(page: ProjectPage, ov: PageOverview): Calibration | null {
  if (ov.scaleText && page.renderScale) {
    const m = /1\s*[:/-]\s*(\d{1,4})/.exec(ov.scaleText);
    const denom = m ? Number(m[1]) : NaN;
    if (Number.isFinite(denom) && denom >= 5 && denom <= 1000) {
      return {
        kind: "scale",
        denominator: denom,
        metersPerPx: metersPerPdfPoint(denom) / page.renderScale,
        source: "auto",
      };
    }
  }
  if (ov.scaleHint) {
    return { a: ov.scaleHint.a, b: ov.scaleHint.b, meters: ov.scaleHint.meters, source: "ia" };
  }
  return null;
}

function buildContext(page: ProjectPage): string | undefined {
  const parts: string[] = [];
  if (page.overview?.planType) parts.push(`Type de plan : ${page.overview.planType}.`);
  if (page.overview?.scaleText) parts.push(`Échelle du cartouche : ${page.overview.scaleText}.`);
  if (page.overview?.legendNotes) parts.push(`Légende : ${page.overview.legendNotes}`);
  if (page.overview?.remarks) parts.push(`Remarques : ${page.overview.remarks}`);
  return parts.length ? parts.join("\n") : undefined;
}

export type { LayerElement };
