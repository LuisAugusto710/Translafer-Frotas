/**
 * POST /api/backup/restore
 *
 * Accepts a raw Excel (.xlsx) blob (Content-Type: application/octet-stream).
 * Parses the "Fretes" and "Diesel" sheets, wipes both tables, and re-inserts
 * every row in a single transaction.
 *
 * Response: { fretes: number, abastecimentos: number }
 */

import { Router } from "express";
import * as XLSX from "xlsx";
import { db, fretesTable, abastecimentosTable } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Converts DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD. Returns null for blanks. */
function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // DD/MM/YYYY
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return null;
}

function toNum(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? "0" : String(n);
}

function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post(
  "/backup/restore",
  // Parse raw binary body — overrides the global express.json() for this route
  (req, res, next) => {
    let chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).rawBody = Buffer.concat(chunks);
      next();
    });
    req.on("error", next);
  },
  async (req, res) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: Buffer | undefined = (req as any).rawBody;
    if (!raw || raw.length === 0) {
      res.status(400).json({ error: "Corpo vazio — envie o arquivo .xlsx" });
      return;
    }

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(raw, { type: "buffer" });
    } catch {
      res.status(400).json({ error: "Arquivo inválido ou corrompido" });
      return;
    }

    // ── Parse Fretes sheet ─────────────────────────────────────────────────
    const fretesSheet = wb.Sheets["Fretes"];
    if (!fretesSheet) {
      res.status(400).json({ error: "Sheet 'Fretes' não encontrado no arquivo" });
      return;
    }

    // aoa = array-of-arrays, first row is header
    const fretesAoa = XLSX.utils.sheet_to_json<unknown[]>(fretesSheet, {
      header: 1,
      defval: "",
    });

    type NewFrete = typeof fretesTable.$inferInsert;
    const fretesRows: NewFrete[] = [];

    for (let i = 1; i < fretesAoa.length; i++) {
      const r = fretesAoa[i] as unknown[];
      const dataCte = parseDate(r[0]);
      const frota   = toStr(r[3]);
      const origem  = toStr(r[1]);
      const cliente = toStr(r[5]);
      const cidade  = toStr(r[6]);

      // Skip completely empty rows or rows missing required fields
      if (!dataCte || !frota || !origem || !cliente || !cidade) continue;

      fretesRows.push({
        dataCte,
        origem,
        transporte:  toStr(r[2])  || null,
        frota,
        transp:      toStr(r[4])  || null,
        cliente,
        cidade,
        cteNf:       toStr(r[7])  || null,
        peso:        toNum(r[8]),
        frete:       toNum(r[9]),
        pedagio:     toNum(r[10]),
        // r[11] is computed "Total Frete" — skip
        dtaFrete:    parseDate(r[12]),
        vencimento:  parseDate(r[13]),
        obs:         toStr(r[14]) || null,
      });
    }

    // ── Parse Diesel sheet ─────────────────────────────────────────────────
    const dieselSheet = wb.Sheets["Diesel"];
    if (!dieselSheet) {
      res.status(400).json({ error: "Sheet 'Diesel' não encontrado no arquivo" });
      return;
    }

    const dieselAoa = XLSX.utils.sheet_to_json<unknown[]>(dieselSheet, {
      header: 1,
      defval: "",
    });

    type NewAbast = typeof abastecimentosTable.$inferInsert;
    const abastRows: NewAbast[] = [];

    for (let i = 1; i < dieselAoa.length; i++) {
      const r = dieselAoa[i] as unknown[];
      const data  = parseDate(r[4]);
      const placa = toStr(r[5]);
      const mes   = toStr(r[0]);
      const anoRaw = Number(r[1]);

      if (!data || !placa || !mes || isNaN(anoRaw)) continue;

      abastRows.push({
        mes,
        ano:          anoRaw,
        requisicao:   toStr(r[2])  || null,
        posto:        toStr(r[3])  || null,
        data,
        placa,
        litros:       toNum(r[6]),
        precoLitro:   toNum(r[7]),
        totalPago:    toNum(r[8]),
        kmInicio:     r[9]  !== "" ? toNum(r[9])  : null,
        kmFinal:      r[10] !== "" ? toNum(r[10]) : null,
        kmPercorrido: r[11] !== "" ? toNum(r[11]) : null,
        media:        r[12] !== "" ? toNum(r[12]) : null,
      });
    }

    // ── Validate we have something to restore ──────────────────────────────
    if (fretesRows.length === 0 && abastRows.length === 0) {
      res.status(400).json({ error: "Nenhum dado válido encontrado no arquivo" });
      return;
    }

    req.log.info(
      { fretes: fretesRows.length, abastecimentos: abastRows.length },
      "Iniciando restauração de backup…",
    );

    // ── Replace all data in a transaction ──────────────────────────────────
    await db.transaction(async (tx) => {
      await tx.delete(fretesTable);
      await tx.delete(abastecimentosTable);

      if (fretesRows.length > 0) {
        // Insert in batches of 500 to stay within pg parameter limits
        for (let i = 0; i < fretesRows.length; i += 500) {
          await tx.insert(fretesTable).values(fretesRows.slice(i, i + 500));
        }
      }
      if (abastRows.length > 0) {
        for (let i = 0; i < abastRows.length; i += 500) {
          await tx.insert(abastecimentosTable).values(abastRows.slice(i, i + 500));
        }
      }
    });

    req.log.info(
      { fretes: fretesRows.length, abastecimentos: abastRows.length },
      "Restauração concluída",
    );

    res.json({
      fretes: fretesRows.length,
      abastecimentos: abastRows.length,
      message: "Dados restaurados com sucesso",
    });
  },
);

export default router;
