// API Kastor — Worker Cloudflare (Hono).
// Deux endpoints d'analyse : l'orchestrateur (vue d'ensemble du dossier)
// et les sous-agents de calque (vectorisation d'un type d'article sur une page).

import { Hono } from "hono";
import { getArticle, getLevel } from "../shared/catalog";
import type {
  AnalyzeLayerRequest,
  AnalyzeLayerResponse,
  AnalyzeOverviewRequest,
  AnalyzeOverviewResponse,
  LayerElement,
  PageOverview,
  Pt,
} from "../shared/types";
import {
  callVisionModel,
  DEFAULT_MODEL,
  extractJson,
  OpenRouterError,
  type Env,
} from "./openrouter";
import {
  layerSystemPrompt,
  layerUserPrompt,
  overviewSystemPrompt,
  overviewUserPrompt,
} from "./prompts";

const app = new Hono<{ Bindings: Env }>();

const MAX_PAGES_PER_OVERVIEW = 12;

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    hasKey: Boolean(c.env.OPENROUTER_API_KEY),
    defaultModel: c.env.OPENROUTER_MODEL || DEFAULT_MODEL,
  }),
);

app.post("/api/analyze/overview", async (c) => {
  const body = (await c.req.json().catch(() => null)) as AnalyzeOverviewRequest | null;
  if (!body || !Array.isArray(body.pages) || body.pages.length === 0) {
    return c.json({ error: "Requête invalide : liste de pages attendue." }, 400);
  }
  if (body.pages.length > MAX_PAGES_PER_OVERVIEW) {
    return c.json(
      { error: `Trop de pages (${body.pages.length}) : maximum ${MAX_PAGES_PER_OVERVIEW} par analyse.` },
      400,
    );
  }
  for (const p of body.pages) {
    if (!p.pageId || typeof p.imageDataUrl !== "string" || !p.imageDataUrl.startsWith("data:image/")) {
      return c.json({ error: "Requête invalide : chaque page doit avoir pageId et imageDataUrl (data:image/...)." }, 400);
    }
  }

  try {
    const raw = await callVisionModel(
      c.env,
      body.model,
      overviewSystemPrompt(),
      overviewUserPrompt(body.pages.map((p) => ({ pageId: p.pageId, name: p.name }))),
      body.pages.map((p) => p.imageDataUrl),
    );
    const parsed = extractJson<{ pages?: unknown; globalRemarks?: string }>(raw);
    const pages = sanitizeOverviewPages(parsed.pages, body.pages.map((p) => p.pageId));
    const response: AnalyzeOverviewResponse = {
      pages,
      globalRemarks: typeof parsed.globalRemarks === "string" ? parsed.globalRemarks : undefined,
    };
    return c.json(response);
  } catch (err) {
    return errorResponse(c, err);
  }
});

app.post("/api/analyze/layer", async (c) => {
  const body = (await c.req.json().catch(() => null)) as AnalyzeLayerRequest | null;
  if (
    !body ||
    !body.pageId ||
    !body.articleId ||
    typeof body.imageDataUrl !== "string" ||
    !body.imageDataUrl.startsWith("data:image/")
  ) {
    return c.json({ error: "Requête invalide : pageId, articleId et imageDataUrl requis." }, 400);
  }
  const article = getArticle(body.articleId);
  if (!article) {
    return c.json({ error: `Article inconnu : ${body.articleId}` }, 400);
  }

  try {
    const raw = await callVisionModel(
      c.env,
      body.model,
      layerSystemPrompt(article),
      layerUserPrompt(article, getLevel(body.levelId)?.label ?? null, body.context),
      [body.imageDataUrl],
    );
    const parsed = extractJson<{ elements?: unknown; notes?: string }>(raw);
    const elements = sanitizeElements(parsed.elements, article.unit);
    const response: AnalyzeLayerResponse = {
      articleId: article.id,
      pageId: body.pageId,
      elements,
      notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
    };
    return c.json(response);
  } catch (err) {
    return errorResponse(c, err);
  }
});

// ---------------------------------------------------------------------------
// Validation / nettoyage des sorties de modèle
// ---------------------------------------------------------------------------

function toPt(value: unknown): Pt | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as { x?: unknown; y?: unknown };
  const x = Number(v.x);
  const y = Number(v.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.min(1000, Math.max(0, x)), y: Math.min(1000, Math.max(0, y)) };
}

function sanitizeElements(value: unknown, unit: "ml" | "u"): LayerElement[] {
  if (!Array.isArray(value)) return [];
  const out: LayerElement[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const el = item as { label?: unknown; points?: unknown };
    const pts = Array.isArray(el.points)
      ? el.points.map(toPt).filter((p): p is Pt => p !== null)
      : [];
    // Un article en unités = 1 point ; un article métré = polyligne d'au moins 2 points.
    const points = unit === "u" ? pts.slice(0, 1) : pts;
    if (unit === "u" && points.length !== 1) continue;
    if (unit === "ml" && points.length < 2) continue;
    out.push({
      id: crypto.randomUUID(),
      label: typeof el.label === "string" && el.label.trim() ? el.label.trim() : undefined,
      points,
      source: "ia",
    });
  }
  return out;
}

function sanitizeOverviewPages(value: unknown, knownPageIds: string[]): PageOverview[] {
  const known = new Set(knownPageIds);
  if (!Array.isArray(value)) return [];
  const out: PageOverview[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as Record<string, unknown>;
    const pageId = typeof p.pageId === "string" ? p.pageId : "";
    if (!known.has(pageId)) continue;

    const levelId = typeof p.levelId === "string" && getLevel(p.levelId) ? p.levelId : null;
    const articleIds = Array.isArray(p.articleIds)
      ? p.articleIds.filter((id): id is string => typeof id === "string" && Boolean(getArticle(id)))
      : [];

    let scaleHint: PageOverview["scaleHint"];
    if (typeof p.scaleHint === "object" && p.scaleHint !== null) {
      const h = p.scaleHint as Record<string, unknown>;
      const a = toPt(h.a);
      const b = toPt(h.b);
      const meters = Number(h.meters);
      if (a && b && Number.isFinite(meters) && meters > 0) {
        scaleHint = {
          a,
          b,
          meters,
          description: typeof h.description === "string" ? h.description : undefined,
        };
      }
    }

    out.push({
      pageId,
      planType: typeof p.planType === "string" ? p.planType : "plan",
      levelId,
      scaleText: typeof p.scaleText === "string" ? p.scaleText : undefined,
      articleIds: [...new Set(articleIds)],
      scaleHint,
      legendNotes: typeof p.legendNotes === "string" ? p.legendNotes : undefined,
      remarks: typeof p.remarks === "string" ? p.remarks : undefined,
    });
  }
  return out;
}

function errorResponse(c: { json: (obj: object, status: 400 | 401 | 402 | 500 | 502) => Response }, err: unknown): Response {
  if (err instanceof OpenRouterError) {
    const status = err.status === 401 || err.status === 402 || err.status === 500 ? err.status : 502;
    return c.json({ error: err.message }, status as 401 | 402 | 500 | 502);
  }
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: `Échec de l'analyse : ${message}` }, 502);
}

export default app;
