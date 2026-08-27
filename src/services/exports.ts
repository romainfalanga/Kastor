// Exports du tableau des métrés : Excel (.xlsx) et PDF.

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatQuantity } from "../../shared/geometry";
import type { TableRow } from "./quantify";

const HEADERS = ["Niveau", "Article", "Repères", "Unité", "Quantité", "Éléments"];

function tableToRows(rows: TableRow[]): (string | number)[][] {
  return rows.map((r) => [
    r.levelLabel,
    r.articleLabel,
    r.codes,
    r.unit === "ml" ? "mL" : "u",
    r.quantity === null ? "à calibrer" : r.unit === "ml" ? Number(r.quantity.toFixed(2)) : Math.round(r.quantity),
    r.elementCount,
  ]);
}

export function exportExcel(projectName: string, rows: TableRow[]): void {
  const wb = XLSX.utils.book_new();
  const data: (string | number)[][] = [
    [`Kastor — Liste métrée : ${projectName}`],
    [`Exporté le ${new Date().toLocaleDateString("fr-FR")}`],
    [],
    HEADERS,
    ...tableToRows(rows),
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 34 }, { wch: 28 }, { wch: 22 }, { wch: 8 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws, "Métrés");
  XLSX.writeFile(wb, `${sanitize(projectName)}_metres.xlsx`);
}

export function exportPdf(projectName: string, rows: TableRow[]): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(16);
  doc.text(`Kastor — Liste métrée : ${projectName}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Exporté le ${new Date().toLocaleDateString("fr-FR")}`, 14, 25);

  autoTable(doc, {
    startY: 32,
    head: [HEADERS],
    body: tableToRows(rows).map((r) => r.map(String)),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175] },
    didParseCell: (hook) => {
      // Regroupe visuellement par niveau : première colonne en gras au changement de niveau.
      if (hook.section === "body" && hook.column.index === 0) {
        const prev = hook.row.index > 0 ? rows[hook.row.index - 1] : null;
        const cur = rows[hook.row.index];
        if (cur && (!prev || prev.levelId !== cur.levelId)) {
          hook.cell.styles.fontStyle = "bold";
        } else if (hook.cell.text.join("") === cur?.levelLabel) {
          hook.cell.text = [""];
        }
      }
    },
  });

  doc.save(`${sanitize(projectName)}_metres.pdf`);
}

function sanitize(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "kastor";
}

export function formatRowQuantity(row: TableRow): string {
  return formatQuantity(row.unit, row.quantity);
}
