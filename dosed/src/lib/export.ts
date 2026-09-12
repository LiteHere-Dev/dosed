import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { DoseLog, Pet } from "@/db/types";

type Row = DoseLog & { medicationName: string };

export async function exportHistoryPdf(pet: Pet, rows: Row[], rangeLabel: string) {
  const body = rows
    .map(
      (r) => `<tr>
        <td>${new Date(r.scheduledAt).toLocaleString()}</td>
        <td>${escapeHtml(r.medicationName)}</td>
        <td>${r.status}</td>
        <td>${r.amountTaken ?? "—"}</td>
      </tr>`
    )
    .join("");

  const html = `
    <html><head><meta charset="utf-8" />
    <style>
      body { font-family: Georgia, serif; color: #241F1B; padding: 24px; }
      h1 { font-size: 20px; margin-bottom: 0; }
      p.sub { color: #8A8078; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-family: -apple-system, sans-serif; font-size: 12px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E4DACC; }
      th { color: #8A8078; font-weight: 600; text-transform: uppercase; font-size: 10px; }
    </style></head>
    <body>
      <h1>${escapeHtml(pet.name)} — Medication History</h1>
      <p class="sub">${escapeHtml(rangeLabel)}${pet.weightKg ? ` · ${pet.weightKg} kg` : ""}</p>
      <table>
        <thead><tr><th>When</th><th>Medication</th><th>Status</th><th>Amount</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  return uri;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
