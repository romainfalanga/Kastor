import { useRef } from "react";
import { getArticle, LEVELS } from "../../shared/catalog";
import { useKastor } from "../state/store";

export default function AnalysisPanel() {
  const {
    current,
    addFiles,
    removePage,
    setPageLevel,
    runFullAnalysis,
    runOverview,
    runLayersForPage,
    busy,
    setModel,
  } = useKastor();
  const fileInput = useRef<HTMLInputElement>(null);

  if (!current) return null;

  return (
    <div className="analysis">
      <section className="card">
        <div className="row space-between">
          <h2>Documents du dossier</h2>
          <div className="row">
            <input
              className="model-input"
              defaultValue={current.model ?? ""}
              placeholder="Modèle OpenRouter (défaut serveur)"
              title="Identifiant de modèle OpenRouter, ex. google/gemini-2.5-pro"
              onBlur={(e) => setModel(e.target.value)}
            />
            <button onClick={() => fileInput.current?.click()} disabled={busy}>
              + Ajouter des plans (PDF, JPEG, PNG)
            </button>
          </div>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="application/pdf,image/*"
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void addFiles(files);
            e.target.value = "";
          }}
        />

        {current.pages.length === 0 ? (
          <p className="muted">
            Ajoutez d'abord les plans du chantier : plan de fondations, plans de coffrage des
            planchers… Chaque page de PDF devient une page analysable.
          </p>
        ) : (
          <div className="pages-grid">
            {current.pages.map((page) => (
              <div className="page-card" key={page.id}>
                <img src={page.imageDataUrl} alt={page.name} />
                <div className="page-meta">
                  <strong title={page.name}>{page.name}</strong>
                  <label>
                    Niveau :
                    <select
                      value={page.levelId ?? ""}
                      onChange={(e) => setPageLevel(page.id, e.target.value || null)}
                    >
                      <option value="">— non rattaché —</option>
                      {LEVELS.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {page.overview && (
                    <div className="overview-info">
                      <span className="badge">{page.overview.planType}</span>
                      {page.overview.scaleText && <span className="badge">éch. {page.overview.scaleText}</span>}
                      {page.calibration ? (
                        <span className="badge ok">calibrée ({page.calibration.source})</span>
                      ) : (
                        <span className="badge warn">à calibrer</span>
                      )}
                      {page.overview.articleIds.length > 0 && (
                        <p className="muted small">
                          Articles détectés :{" "}
                          {page.overview.articleIds
                            .map((id) => getArticle(id)?.label ?? id)
                            .join(", ")}
                        </p>
                      )}
                      {page.overview.remarks && <p className="muted small">{page.overview.remarks}</p>}
                    </div>
                  )}
                  <div className="row">
                    <button
                      disabled={busy || !page.levelId}
                      title={!page.levelId ? "Rattachez d'abord la page à un niveau" : ""}
                      onClick={() => void runLayersForPage(page.id)}
                    >
                      Analyser les calques
                    </button>
                    <button className="danger ghost" disabled={busy} onClick={() => removePage(page.id)}>
                      Retirer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Pipeline d'analyse</h2>
        <ol className="pipeline">
          <li>
            <strong>Agent orchestrateur</strong> : lit cartouche, légende et nomenclatures de chaque
            page, identifie le type de plan, le niveau, l'échelle (avec une cote de calibration) et
            la liste des articles présents.
          </li>
          <li>
            <strong>Sous-agents de calque</strong> : un agent spécialisé par type d'article vectorise
            ses éléments (polylignes pour les métrés en mL, points pour les unités).
          </li>
          <li>
            <strong>Calcul algorithmique</strong> : les quantités sont calculées par le code à partir
            de la géométrie et de la calibration — pas par l'IA.
          </li>
        </ol>
        <div className="row">
          <button
            className="primary"
            disabled={busy || current.pages.length === 0}
            onClick={() => void runFullAnalysis()}
          >
            ⚡ Analyser tout le dossier
          </button>
          <button disabled={busy || current.pages.length === 0} onClick={() => void runOverview()}>
            Analyse générale seule
          </button>
        </div>
        {current.globalRemarks && (
          <p className="muted">
            <strong>Synthèse de l'orchestrateur :</strong> {current.globalRemarks}
          </p>
        )}
      </section>
    </div>
  );
}
