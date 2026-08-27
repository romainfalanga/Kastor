// Client des endpoints d'analyse du Worker.

import type {
  AnalyzeLayerRequest,
  AnalyzeLayerResponse,
  AnalyzeOverviewRequest,
  AnalyzeOverviewResponse,
} from "../../shared/types";

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as (TRes & { error?: string }) | null;
  if (!res.ok || !data) {
    const detail = data?.error ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return data;
}

export function analyzeOverview(req: AnalyzeOverviewRequest): Promise<AnalyzeOverviewResponse> {
  return post("/api/analyze/overview", req);
}

export function analyzeLayer(req: AnalyzeLayerRequest): Promise<AnalyzeLayerResponse> {
  return post("/api/analyze/layer", req);
}

export async function health(): Promise<{ ok: boolean; hasKey: boolean; defaultModel: string }> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
