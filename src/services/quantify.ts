// Construction du tableau final des métrés : agrégation algorithmique
// des calques par niveau et par article, dans l'ordre de gestion des métrés.

import { articlesForLevel, LEVELS } from "../../shared/catalog";
import { layerQuantity } from "../../shared/geometry";
import type { Unit } from "../../shared/types";
import { findLayer, type Project } from "../state/model";

export interface TableRow {
  levelId: string;
  levelLabel: string;
  articleId: string;
  articleLabel: string;
  codes: string;
  unit: Unit;
  /** Quantité totale (unités ou mètres) ; null si un métré manque de calibration. */
  quantity: number | null;
  /** Nombre d'éléments vectorisés qui portent cette quantité. */
  elementCount: number;
  /** Vrai si au moins une page concernée n'est pas calibrée (métrés ml impossibles). */
  missingCalibration: boolean;
}

export function buildTable(project: Project): TableRow[] {
  const rows: TableRow[] = [];
  for (const level of LEVELS) {
    const pages = project.pages.filter((p) => p.levelId === level.id);
    if (pages.length === 0) continue;

    for (const article of articlesForLevel(level.id)) {
      let total = 0;
      let elementCount = 0;
      let missingCalibration = false;

      for (const page of pages) {
        const layer = findLayer(project, page.id, article.id);
        if (!layer || layer.elements.length === 0) continue;
        elementCount += layer.elements.length;
        const dims = { width: page.width, height: page.height };
        const qty = layerQuantity(article.unit, layer.elements, page.calibration, dims);
        if (qty === null) {
          missingCalibration = true;
        } else {
          total += qty;
        }
      }

      rows.push({
        levelId: level.id,
        levelLabel: level.label,
        articleId: article.id,
        articleLabel: article.label,
        codes: article.codes.join(", "),
        unit: article.unit,
        quantity: missingCalibration ? null : total,
        elementCount,
        missingCalibration,
      });
    }
  }
  return rows;
}
