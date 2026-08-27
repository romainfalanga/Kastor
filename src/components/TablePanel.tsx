import { useMemo } from "react";
import { exportExcel, exportPdf, formatRowQuantity } from "../services/exports";
import { buildTable } from "../services/quantify";
import { useKastor } from "../state/store";

export default function TablePanel() {
  const { current } = useKastor();
  const rows = useMemo(() => (current ? buildTable(current) : []), [current]);

  if (!current) return null;

  if (rows.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          Le tableau se remplit dès qu'au moins une page est rattachée à un niveau et analysée
          (onglet « Documents &amp; analyse »).
        </p>
      </div>
    );
  }

  const hasUncalibrated = rows.some((r) => r.missingCalibration);

  return (
    <div className="card table-panel">
      <div className="row space-between">
        <h2>Liste métrée — {current.name}</h2>
        <div className="row">
          <button className="primary" onClick={() => exportExcel(current.name, rows)}>
            Exporter Excel
          </button>
          <button onClick={() => exportPdf(current.name, rows)}>Exporter PDF</button>
        </div>
      </div>
      {hasUncalibrated && (
        <p className="warn">
          ⚠ Certaines pages ne sont pas calibrées : les métrés en mL concernés sont vides. Utilisez
          l'outil 📏 dans « Plan par calques » pour calibrer chaque page sur une cote connue.
        </p>
      )}
      <table className="metres">
        <thead>
          <tr>
            <th>Niveau</th>
            <th>Article</th>
            <th>Repères</th>
            <th>Unité</th>
            <th className="num">Quantité</th>
            <th className="num">Éléments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const firstOfLevel = i === 0 || rows[i - 1].levelId !== r.levelId;
            return (
              <tr key={`${r.levelId}-${r.articleId}`} className={firstOfLevel ? "level-start" : ""}>
                <td>{firstOfLevel ? r.levelLabel : ""}</td>
                <td>{r.articleLabel}</td>
                <td className="muted">{r.codes}</td>
                <td>{r.unit === "ml" ? "mL" : "u"}</td>
                <td className="num">
                  {r.missingCalibration ? <span className="warn">à calibrer</span> : formatRowQuantity(r)}
                </td>
                <td className="num muted">{r.elementCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted small">
        Les quantités sont calculées algorithmiquement à partir des calques vectorisés (comptage pour
        les unités, longueur des polylignes × calibration pour les mètres linéaires). Corrigez les
        calques dans « Plan par calques » : le tableau se met à jour automatiquement.
      </p>
    </div>
  );
}
