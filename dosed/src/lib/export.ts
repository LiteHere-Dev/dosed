import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import type { DoseLog, HealthLog, Pet } from "@/db/types";
import { sendVetSummary } from "./api";

type Row = DoseLog & { medicationName: string };

const HEALTH_LABELS: Record<HealthLog["type"], string> = {
  side_effect: "Side effect",
  mood: "Mood",
  weight: "Weight",
  stool: "Stool",
};

function buildHistoryHtml(pet: Pet, rows: Row[], healthLogs: HealthLog[], rangeLabel: string): string {
  const doseBody = rows
    .map(
      (r) => `<tr>
        <td>${new Date(r.scheduledAt).toLocaleString()}</td>
        <td>${escapeHtml(r.medicationName)}</td>
        <td>${r.status}</td>
        <td>${r.amountTaken ?? "—"}</td>
        <td>${escapeHtml(r.loggedByLabel ?? "—")}</td>
      </tr>`
    )
    .join("");

  const takenCount = rows.filter((r) => r.status === "taken").length;
  const adherencePct = rows.length ? Math.round((takenCount / rows.length) * 100) : null;

  const healthSection = healthLogs.length
    ? `
      <h2>Health Log</h2>
      <table>
        <thead><tr><th>When</th><th>Type</th><th>Value</th><th>Note</th></tr></thead>
        <tbody>${healthLogs
          .map(
            (h) => `<tr>
              <td>${new Date(h.occurredAt).toLocaleString()}</td>
              <td>${HEALTH_LABELS[h.type] ?? h.type}</td>
              <td>${escapeHtml(h.value)}</td>
              <td>${escapeHtml(h.note ?? "—")}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table>`
    : "";

  return `
    <html><head><meta charset="utf-8" />
    <style>
      body { font-family: Georgia, serif; color: #241F1B; padding: 24px; }
      h1 { font-size: 20px; margin-bottom: 0; }
      h2 { font-size: 15px; margin-top: 28px; }
      p.sub { color: #8A8078; margin-top: 4px; }
      p.stat { font-family: -apple-system, sans-serif; font-size: 13px; margin-top: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; font-family: -apple-system, sans-serif; font-size: 12px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E4DACC; }
      th { color: #8A8078; font-weight: 600; text-transform: uppercase; font-size: 10px; }
    </style></head>
    <body>
      <h1>${escapeHtml(pet.name)} — Medication History</h1>
      <p class="sub">${escapeHtml(rangeLabel)}${pet.weightKg ? ` · ${pet.weightKg} kg` : ""}</p>
      ${adherencePct != null ? `<p class="stat">Adherence: <strong>${adherencePct}%</strong> (${takenCount} of ${rows.length} doses given)</p>` : ""}
      <h2>Dose Log</h2>
      <table>
        <thead><tr><th>When</th><th>Medication</th><th>Status</th><th>Amount</th><th>Given by</th></tr></thead>
        <tbody>${doseBody}</tbody>
      </table>
      ${healthSection}
    </body></html>`;
}

export async function exportHistoryPdf(pet: Pet, rows: Row[], rangeLabel: string, healthLogs: HealthLog[] = []) {
  const html = buildHistoryHtml(pet, rows, healthLogs, rangeLabel);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
  return uri;
}

/**
 * Renders the same report as exportHistoryPdf, but emails it to a vet
 * instead of opening the share sheet — see server/src/routes/notify.ts,
 * which relays it through Resend/SMTP as a PDF attachment.
 */
export async function emailHistoryToVet(pet: Pet, rows: Row[], healthLogs: HealthLog[], rangeLabel: string, vetEmail: string) {
  const html = buildHistoryHtml(pet, rows, healthLogs, rangeLabel);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const pdfBase64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  await sendVetSummary({ petId: pet.id, vetEmail, petName: pet.name, rangeLabel, pdfBase64 });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
