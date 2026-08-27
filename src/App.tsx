import { useEffect, useState } from "react";
import AnalysisPanel from "./components/AnalysisPanel";
import ProjectHome from "./components/ProjectHome";
import TablePanel from "./components/TablePanel";
import ViewerPanel from "./components/ViewerPanel";
import { useKastor } from "./state/store";

type Tab = "analyse" | "plan" | "tableau";

export default function App() {
  const { current, closeProject, init, error, clearError, progress } = useKastor();
  const [tab, setTab] = useState<Tab>("analyse");

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    // Retour à l'onglet analyse quand on change de projet.
    setTab("analyse");
  }, [current?.id]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" onClick={closeProject} role="button" title="Accueil">
          <span className="brand-icon">🦫</span>
          <span className="brand-name">Kastor</span>
          <span className="brand-sub">décorticage de plans d'armature</span>
        </div>
        {current && (
          <nav className="tabs">
            <button className={tab === "analyse" ? "tab active" : "tab"} onClick={() => setTab("analyse")}>
              1. Documents &amp; analyse
            </button>
            <button className={tab === "plan" ? "tab active" : "tab"} onClick={() => setTab("plan")}>
              2. Plan par calques
            </button>
            <button className={tab === "tableau" ? "tab active" : "tab"} onClick={() => setTab("tableau")}>
              3. Tableau des métrés
            </button>
          </nav>
        )}
        {current && <div className="project-name">{current.name}</div>}
      </header>

      {progress && (
        <div className="progress-banner">
          <div className="spinner" />
          <span>
            {progress.stage === "import"
              ? "Import et vectorisation : "
              : progress.stage === "overview"
                ? "Agent d'analyse générale : "
                : "Sous-agents de calque : "}
            {progress.label}
            {progress.total > 1 ? ` (${progress.done}/${progress.total})` : ""}
          </span>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={clearError}>Fermer</button>
        </div>
      )}

      <main className="content">
        {!current ? (
          <ProjectHome />
        ) : tab === "analyse" ? (
          <AnalysisPanel />
        ) : tab === "plan" ? (
          <ViewerPanel />
        ) : (
          <TablePanel />
        )}
      </main>
    </div>
  );
}
