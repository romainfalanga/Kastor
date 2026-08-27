import { useCallback, useEffect, useRef, useState } from "react";
import { getArticle } from "../../shared/catalog";
import { clampPt } from "../../shared/geometry";
import type { Layer, Pt } from "../../shared/types";
import type { ProjectPage } from "../state/model";

export type ViewerTool = "pan" | "add" | "edit" | "delete" | "calibrate";

interface Props {
  page: ProjectPage;
  layers: Layer[];
  visible: Set<string>;
  selectedArticleId: string | null;
  tool: ViewerTool;
  onAddElement: (points: Pt[]) => void;
  onMovePoint: (articleId: string, elementId: string, index: number, pt: Pt) => void;
  onDeleteElement: (articleId: string, elementId: string) => void;
  onCalibrate: (a: Pt, b: Pt) => void;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function PlanViewer({
  page,
  layers,
  visible,
  selectedArticleId,
  tool,
  onAddElement,
  onMovePoint,
  onDeleteElement,
  onCalibrate,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: page.width, h: page.height });
  const [draft, setDraft] = useState<Pt[]>([]);
  const [calPoints, setCalPoints] = useState<Pt[]>([]);
  const dragRef = useRef<
    | { kind: "pan"; startX: number; startY: number; view: View }
    | { kind: "vertex"; articleId: string; elementId: string; index: number }
    | null
  >(null);

  useEffect(() => {
    setView({ x: 0, y: 0, w: page.width, h: page.height });
    setDraft([]);
    setCalPoints([]);
  }, [page.id, page.width, page.height]);

  useEffect(() => {
    setDraft([]);
    setCalPoints([]);
  }, [tool, selectedArticleId]);

  const selectedArticle = selectedArticleId ? getArticle(selectedArticleId) : undefined;

  /** Coordonnées image (px) du pointeur. */
  const eventToImagePx = useCallback((e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    return { x: view.x + fx * view.w, y: view.y + fy * view.h };
  }, [view]);

  const pxToNorm = useCallback(
    (p: { x: number; y: number }): Pt =>
      clampPt({ x: (p.x / page.width) * 1000, y: (p.y / page.height) * 1000 }),
    [page.width, page.height],
  );

  const normToPx = useCallback(
    (p: Pt): { x: number; y: number } => ({
      x: (p.x / 1000) * page.width,
      y: (p.y / 1000) * page.height,
    }),
    [page.width, page.height],
  );

  // Zoom molette centré sur le curseur.
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const factor = Math.exp(e.deltaY * 0.0015);
      const cursor = eventToImagePx(e);
      setView((v) => {
        const w = Math.min(page.width * 4, Math.max(page.width / 40, v.w * factor));
        const h = (w / v.w) * v.h;
        return {
          x: cursor.x - ((cursor.x - v.x) / v.w) * w,
          y: cursor.y - ((cursor.y - v.y) / v.h) * h,
          w,
          h,
        };
      });
    },
    [eventToImagePx, page.width],
  );

  const finishDraft = useCallback(() => {
    setDraft((d) => {
      if (d.length >= 2) onAddElement(d);
      return [];
    });
  }, [onAddElement]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraft([]);
        setCalPoints([]);
      }
      if (e.key === "Enter") finishDraft();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finishDraft]);

  function onPointerDown(e: React.PointerEvent) {
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    const px = eventToImagePx(e);
    const norm = pxToNorm(px);

    // Bouton du milieu ou outil déplacer : pan.
    if (tool === "pan" || e.button === 1) {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view };
      return;
    }
    if (tool === "calibrate") {
      setCalPoints((pts) => {
        const next = [...pts, norm];
        if (next.length === 2) {
          onCalibrate(next[0], next[1]);
          return [];
        }
        return next;
      });
      return;
    }
    if (tool === "add" && selectedArticle) {
      if (selectedArticle.unit === "u") {
        onAddElement([norm]);
      } else {
        setDraft((d) => [...d, norm]);
      }
      return;
    }
    // Les outils edit/delete agissent via les handlers des éléments ; un clic
    // dans le vide avec ces outils fait un pan pour rester fluide.
    dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, view };
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = ((e.clientX - drag.startX) / rect.width) * drag.view.w;
      const dy = ((e.clientY - drag.startY) / rect.height) * drag.view.h;
      setView({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy });
    } else {
      const norm = pxToNorm(eventToImagePx(e));
      onMovePoint(drag.articleId, drag.elementId, drag.index, norm);
    }
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  // Taille écran constante des poignées/étiquettes quel que soit le zoom.
  const ux = view.w * 0.008;

  return (
    <div className="viewer-wrap">
      <svg
        ref={svgRef}
        className={`viewer tool-${tool}`}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={() => tool === "add" && finishDraft()}
      >
        <image href={page.imageDataUrl} x={0} y={0} width={page.width} height={page.height} />

        {layers
          .filter((l) => visible.has(l.articleId))
          .map((layer) => {
            const article = getArticle(layer.articleId);
            if (!article) return null;
            const isSelected = layer.articleId === selectedArticleId;
            return (
              <g key={layer.articleId} opacity={selectedArticleId && !isSelected ? 0.45 : 1}>
                {layer.elements.map((el) => {
                  const pts = el.points.map(normToPx);
                  const clickable = tool === "delete" || (tool === "edit" && isSelected);
                  const onElClick = () => {
                    if (tool === "delete") onDeleteElement(layer.articleId, el.id);
                  };
                  if (article.unit === "u" || pts.length === 1) {
                    const p = pts[0];
                    return (
                      <g key={el.id} className={clickable ? "clickable" : ""} onPointerDown={(e) => {
                        if (tool === "edit" && isSelected) {
                          e.stopPropagation();
                          dragRef.current = { kind: "vertex", articleId: layer.articleId, elementId: el.id, index: 0 };
                          svgRef.current?.setPointerCapture(e.pointerId);
                        } else if (tool === "delete") {
                          e.stopPropagation();
                          onElClick();
                        }
                      }}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={ux * 1.6}
                          fill={article.color}
                          fillOpacity={el.source === "vecteur" ? 0.55 : 0.85}
                          stroke="#fff"
                          strokeWidth={ux * 0.35}
                          strokeDasharray={el.source === "vecteur" ? `${ux * 0.7} ${ux * 0.5}` : undefined}
                        />
                        {el.label && (
                          <text x={p.x + ux * 2.2} y={p.y - ux} fontSize={ux * 3} fill={article.color} stroke="#ffffff" strokeWidth={ux * 0.5} paintOrder="stroke">
                            {el.label}
                          </text>
                        )}
                      </g>
                    );
                  }
                  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
                  return (
                    <g key={el.id} className={clickable ? "clickable" : ""}>
                      <path
                        d={path}
                        fill="none"
                        stroke={article.color}
                        strokeWidth={ux * 0.9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.9}
                        onPointerDown={(e) => {
                          if (tool === "delete") {
                            e.stopPropagation();
                            onElClick();
                          }
                        }}
                      />
                      {el.label && pts.length > 0 && (
                        <text x={pts[0].x + ux * 2} y={pts[0].y - ux} fontSize={ux * 3} fill={article.color} stroke="#ffffff" strokeWidth={ux * 0.5} paintOrder="stroke">
                          {el.label}
                        </text>
                      )}
                      {tool === "edit" && isSelected &&
                        pts.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={ux * 1.3}
                            fill="#ffffff"
                            stroke={article.color}
                            strokeWidth={ux * 0.5}
                            className="clickable"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              dragRef.current = { kind: "vertex", articleId: layer.articleId, elementId: el.id, index: i };
                              svgRef.current?.setPointerCapture(e.pointerId);
                            }}
                          />
                        ))}
                    </g>
                  );
                })}
              </g>
            );
          })}

        {/* Polyligne en cours de tracé */}
        {draft.length > 0 && selectedArticle && (
          <g>
            <path
              d={draft.map(normToPx).map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={selectedArticle.color}
              strokeWidth={ux * 0.9}
              strokeDasharray={`${ux * 2} ${ux * 1.2}`}
            />
            {draft.map(normToPx).map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={ux} fill={selectedArticle.color} />
            ))}
          </g>
        )}

        {/* Points de calibration en cours */}
        {calPoints.map((p, i) => {
          const px = normToPx(p);
          return <circle key={i} cx={px.x} cy={px.y} r={ux * 1.5} fill="none" stroke="#059669" strokeWidth={ux * 0.6} />;
        })}

        {/* Segment de calibration retenu */}
        {page.calibration && visible.has("__calibration__") && null}
      </svg>

      {tool === "add" && selectedArticle?.unit === "ml" && (
        <div className="viewer-hint">
          Tracez la polyligne point par point — double-clic ou Entrée pour terminer, Échap pour
          annuler ({draft.length} point{draft.length > 1 ? "s" : ""}).
        </div>
      )}
      {tool === "calibrate" && (
        <div className="viewer-hint">
          Cliquez les deux extrémités d'une cote connue du plan, la distance réelle vous sera
          demandée ({calPoints.length}/2).
        </div>
      )}
    </div>
  );
}
