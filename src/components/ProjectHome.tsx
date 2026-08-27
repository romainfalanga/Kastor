import { useState } from "react";
import { useKastor } from "../state/store";

export default function ProjectHome() {
  const { projects, createProject, openProject, removeProject } = useKastor();
  const [name, setName] = useState("");

  return (
    <div className="home">
      <section className="card">
        <h2>Nouveau chantier</h2>
        <p className="muted">
          Créez un chantier, ajoutez les plans (PDF ou images), lancez l'analyse : Kastor reconstruit
          le plan en calques d'articles et calcule la liste métrée.
        </p>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void createProject(name);
            setName("");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du chantier, ex. Villa Falanga — Lot armature"
          />
          <button type="submit" className="primary">
            Créer
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Chantiers</h2>
        {projects.length === 0 ? (
          <p className="muted">Aucun chantier pour l'instant.</p>
        ) : (
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <button className="project-open" onClick={() => openProject(p.id)}>
                  <strong>{p.name}</strong>
                  <span className="muted">
                    {p.pages.length} page{p.pages.length > 1 ? "s" : ""} — modifié le{" "}
                    {new Date(p.updatedAt).toLocaleDateString("fr-FR")}
                  </span>
                </button>
                <button
                  className="danger ghost"
                  title="Supprimer ce chantier"
                  onClick={() => {
                    if (confirm(`Supprimer définitivement « ${p.name} » ?`)) {
                      void removeProject(p.id);
                    }
                  }}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
