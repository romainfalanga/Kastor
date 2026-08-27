import { useMemo, useState } from "react";
import { articlesForLevel, getLevel, unitLabel } from "../../shared/catalog";
import { formatQuantity, layerQuantity } from "../../shared/geometry";
import type { Pt } from "../../shared/types";
import { findLayer } from "../state/model";
import { useKastor } from "../state/store";
import PlanViewer, { type ViewerTool } from "./PlanViewer";

export default function ViewerPanel() {
  const {
    current,
    busy,
    runLayer,
    addElement,
    updateElementPoints,
    deleteElement,
    setCalibration,
  } = useKastor();
  const [pageId, setPageId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [tool, setTool] = useState<ViewerTool>("pan");

  const page = useMemo(() => {
    if (!current) return null;
    return current.pages.find((p) => p.id === pageId) ?? current.pages[0] ?? null;
  }, [current, pageId]);

  if (!current || !page) {
    return (
      <div className="card">
        <p className="muted">Ajoutez d'abord des plans dans l'onglet « Documents &amp; analyse ».</p>
      </div>
    );
  }

  const articles = articlesForLevel(page.levelId);
  const dims = { width: page.width, height: page.height };
  const pageLayers = current.layers.filter((l) => l.pageId === page.id);
  const visible = new Set(articles.map((a) => a.id).filter((id) => !hidden.has(id)));

  function toggleArticle(id: string) {
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCalibrate(a: Pt, b: Pt) {
    const raw = prompt("Distance réelle entre les deux points (en mètres) :");
    if (!raw) return;
    const meters = Number(raw.replace(",", "."));
    if (!Number.isFinite(meters) || meters <= 0) {
      alert("Valeur invalide : entrez une distance en mètres, ex. 12.45");
      return;
    }
    setCalibration(page!.id, { a, b, meters, source: "manuel" });
    setTool("pan");
  }

  const toolButtons: { id: ViewerTool; label: string; title: string }[] = [
    { id: "pan", label: "✋", title: "Naviguer (molette pour zoomer)" },
    { id: "add", label: "＋", title: "Ajouter un élément au calque sélectionné" },
    { id: "edit", label: "✎", title: "Déplacer les points du calque sélectionné" },
    { id: "delete", label: "🗑", title: "Supprimer un élément (cliquer dessus)" },
    { id: "calibrate", label: "📏", title: "Calibrer l'échelle sur une cote connue" },
  ];

  return (
    <div className="viewer-layout">
      <aside className="layer-sidebar card">
        <label className="block">
          Page :
          <select value={page.id} onChange={(e) => setPageId(e.target.value)}>
            {current.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          Niveau : {getLevel(page.levelId)?.label ?? "non rattaché"}
          <br />
          Échelle :{" "}
          {page.calibration
            ? `calibrée (${page.calibration.meters} m de référence, ${page.calibration.source})`
            : "non calibrée — les métrés en mL resteront vides"}
        </p>

        <div className="row toolbar">
          {toolButtons.map((t) => (
            <button
              key={t.id}
              title={t.title}
              className={tool === t.id ? "tool-btn active" : "tool-btn"}
              onClick={() => setTool(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {(tool === "add" || tool === "edit") && !selectedArticleId && (
          <p className="warn small">Sélectionnez d'abord un calque ci-dessous.</p>
        )}

        <h3>Calques</h3>
        <ul className="layer-list">
          {articles.map((a) => {
            const layer = findLayer(current, page.id, a.id);
            const qty = layer
              ? layerQuantity(a.unit, layer.elements, page.calibration, dims)
              : null;
            const isSelected = selectedArticleId === a.id;
            return (
              <li key={a.id} className={isSelected ? "layer selected" : "layer"}>
                <input
                  type="checkbox"
                  checked={visible.has(a.id)}
                  onChange={() => toggleArticle(a.id)}
                  title="Afficher / masquer le calque"
                />
                <button
                  className="layer-name"
                  onClick={() => setSelectedArticleId(isSelected ? null : a.id)}
                  title={a.description}
                >
                  <span className="dot" style={{ background: a.color }} />
                  {a.label}
                </button>
                <span className="layer-qty">
                  {layer && layer.status === "running"
                    ? "…"
                    : layer && layer.elements.length > 0
                      ? `${formatQuantity(a.unit, qty)} ${a.unit === "ml" ? "mL" : "u"}`
                      : layer?.status === "error"
                        ? "erreur"
                        : "—"}
                </span>
                <button
                  className="ghost small-btn"
                  disabled={busy}
                  title={`Relancer le sous-agent « ${a.label} » sur cette page`}
                  onClick={() => void runLayer(page.id, a.id)}
                >
                  ↻
                </button>
              </li>
            );
          })}
        </ul>

        {selectedArticleId &&
          (() => {
            const layer = findLayer(current, page.id, selectedArticleId);
            if (!layer) return null;
            return (
              <div className="layer-notes">
                {layer.error && <p className="warn small">⚠ {layer.error}</p>}
                {layer.notes && (
                  <p className="muted small">
                    <strong>Notes du sous-agent :</strong> {layer.notes}
                  </p>
                )}
                <p className="muted small">
                  {layer.elements.length} élément{layer.elements.length > 1 ? "s" : ""} (
                  {unitLabel(articles.find((a) => a.id === selectedArticleId)?.unit ?? "u")})
                </p>
              </div>
            );
          })()}
      </aside>

      <PlanViewer
        page={page}
        layers={pageLayers}
        visible={visible}
        selectedArticleId={selectedArticleId}
        tool={tool}
        onAddElement={(points) => {
          if (selectedArticleId) addElement(page.id, selectedArticleId, points);
        }}
        onMovePoint={(articleId, elementId, index, pt) => {
          const layer = findLayer(current, page.id, articleId);
          const el = layer?.elements.find((e) => e.id === elementId);
          if (!el) return;
          const points = el.points.map((p, i) => (i === index ? pt : p));
          updateElementPoints(page.id, articleId, elementId, points);
        }}
        onDeleteElement={(articleId, elementId) => deleteElement(page.id, articleId, elementId)}
        onCalibrate={handleCalibrate}
      />
    </div>
  );
}
