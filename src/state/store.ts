// Store applicatif (zustand) : projets, pipeline d'analyse, édition des calques.

import { create } from "zustand";
import { articlesForLevel, getArticle } from "../../shared/catalog";
import type { Calibration, Layer, LayerElement, Pt } from "../../shared/types";
import { analyzeLayer, analyzeOverview } from "../services/api";
import { fileToPages } from "../services/pdf";
import * as storage from "../services/storage";
import { findLayer, type Project, type ProjectPage } from "./model";

export interface AnalysisProgress {
  stage: "overview" | "layers";
  label: string;
  done: number;
  total: number;
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

  runFullAnalysis: () => Promise<void>;
  runOverview: () => Promise<void>;
  runLayersForPage: (pageId: string) => Promise<void>;
  runLayer: (pageId: string, articleId: string) => Promise<void>;

  addElement: (pageId: string, articleId: string, points: Pt[], label?: string) => void;
  updateElementPoints: (pageId: string, articleId: string, elementId: string, points: Pt[]) => void;
  deleteElement: (pageId: string, articleId: string, elementId: string) => void;

  clearError: () => void;
}

function touch(project: Project): Project {
  return { ...project, updatedAt: Date.now() };
}

export const useKastor = create<KastorState>((set, get) => {
  /** Applique une mutation au projet courant, la persiste et met à jour la liste. */
  function mutate(fn: (p: Project) => Project): void {
    const current = get().current;
    if (!current) return;
    const next = touch(fn(current));
    set({
      current: next,
      projects: get().projects.map((p) => (p.id === next.id ? next : p)),
    });
    void storage.saveProject(next);
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

  async function analyzeOnePage(pageId: string, articleIds: string[]): Promise<void> {
    const { current } = get();
    if (!current) return;
    const page = current.pages.find((pg) => pg.id === pageId);
    if (!page) return;

    for (const articleId of articleIds) {
      const article = getArticle(articleId);
      if (!article) continue;
      const prog = get().progress;
      if (prog) {
        set({ progress: { ...prog, label: `${page.name} — ${article.label}` } });
      }
      mutateLayer(pageId, articleId, (l) => ({ ...l, status: "running", error: undefined }));
      try {
        const res = await analyzeLayer({
          pageId,
          imageDataUrl: page.imageDataUrl,
          articleId,
          levelId: page.levelId,
          context: buildContext(page),
          model: get().current?.model,
        });
        mutateLayer(pageId, articleId, (l) => ({
          ...l,
          elements: res.elements,
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
    }
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
      const project = get().projects.find((p) => p.id === id) ?? null;
      set({ current: project, error: null });
    },

    closeProject: () => set({ current: null, error: null }),

    removeProject: async (id) => {
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
            const page: ProjectPage = {
              id: crypto.randomUUID(),
              name: r.name,
              imageDataUrl: r.imageDataUrl,
              width: r.width,
              height: r.height,
              levelId: null,
              calibration: null,
            };
            mutate((p) => ({ ...p, pages: [...p.pages, page] }));
          }
        }
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        set({ busy: false });
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

    runOverview: async () => {
      const { current } = get();
      if (!current || current.pages.length === 0) return;
      set({
        busy: true,
        error: null,
        progress: { stage: "overview", label: "Analyse générale du dossier…", done: 0, total: 1 },
      });
      try {
        const res = await analyzeOverview({
          pages: current.pages.map((p) => ({
            pageId: p.id,
            name: p.name,
            imageDataUrl: p.imageDataUrl,
          })),
          model: current.model,
        });
        mutate((p) => ({
          ...p,
          globalRemarks: res.globalRemarks,
          pages: p.pages.map((pg) => {
            const ov = res.pages.find((o) => o.pageId === pg.id);
            if (!ov) return pg;
            return {
              ...pg,
              overview: ov,
              // Le niveau proposé par l'IA ne remplace pas un choix déjà fait par l'utilisateur.
              levelId: pg.levelId ?? ov.levelId,
              // Idem pour la calibration : l'indication IA n'écrase pas une calibration manuelle.
              calibration:
                pg.calibration ??
                (ov.scaleHint
                  ? { a: ov.scaleHint.a, b: ov.scaleHint.b, meters: ov.scaleHint.meters, source: "ia" }
                  : null),
            };
          }),
        }));
      } catch (err) {
        set({ error: err instanceof Error ? err.message : String(err) });
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
      const perPage = project.pages.map((pg) => ({ pageId: pg.id, articleIds: articlesToAnalyze(pg) }));
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

function buildContext(page: ProjectPage): string | undefined {
  const parts: string[] = [];
  if (page.overview?.planType) parts.push(`Type de plan : ${page.overview.planType}.`);
  if (page.overview?.scaleText) parts.push(`Échelle du cartouche : ${page.overview.scaleText}.`);
  if (page.overview?.legendNotes) parts.push(`Légende : ${page.overview.legendNotes}`);
  if (page.overview?.remarks) parts.push(`Remarques : ${page.overview.remarks}`);
  return parts.length ? parts.join("\n") : undefined;
}

export type { LayerElement };
