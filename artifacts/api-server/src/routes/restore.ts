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
import { db, fretesTable, abastecimentosTable, despesasTable } from "@workspace/db";
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
      // New column order (after removing mes/ano):
      // [0]=Requisição, [1]=Posto, [2]=Data, [3]=Placa,
      // [4]=Litros, [5]=Preço/L, [6]=Total Pago,
      // [7]=KM Início, [8]=KM Final, [9]=KM Percorrido, [10]=Média
      const data  = parseDate(r[2]);
      const placa = toStr(r[3]);

      if (!data || !placa) continue;

      abastRows.push({
        requisicao:   toStr(r[0])  || null,
        posto:        toStr(r[1])  || null,
        data,
        placa,
        litros:       toNum(r[4]),
        precoLitro:   toNum(r[5]),
        totalPago:    toNum(r[6]),
        kmInicio:     r[7]  !== "" ? toNum(r[7])  : null,
        kmFinal:      r[8]  !== "" ? toNum(r[8])  : null,
        kmPercorrido: r[9]  !== "" ? toNum(r[9])  : null,
        media:        r[10] !== "" ? toNum(r[10]) : null,
      });
    }

    // ── Parse Despesas sheet ───────────────────────────────────────────────
    // Column order matches backup.ts Sheet 3:
    // [0]=Data, [1]=Frota, [2]=Cidade, [3]=Motorista (Nome), [4]=Ajudante (Nome),
    // [5]=Frete, [6]=KM, [7]=Diesel LT, [8]=Diesel R$,
    // [9]=DAS, [10]=Motorista, [11]=Almoço, [12]=Ajudante, [13]=Pedágio,
    // [14]=Unimed, [15]=Seguro, [16]=Gasto, [17]=Rastreador,
    // [18]=INSS, [19]=Escritório, [20]=IPVA, [21]=Bsoft,
    // [22]=Total Despesa (computed — skip), [23]=Lucro, [24]=Parcela Troca Óleo, [25]=Obs
    const despesasSheet = wb.Sheets["Despesas"];
    type NewDespesa = typeof despesasTable.$inferInsert;
    const despesasRows: NewDespesa[] = [];

    if (despesasSheet) {
      const despesasAoa = XLSX.utils.sheet_to_json<unknown[]>(despesasSheet, {
        header: 1,
        defval: "",
      });
      for (let i = 1; i < despesasAoa.length; i++) {
        const r = despesasAoa[i] as unknown[];
        const data  = parseDate(r[0]);
        const frota = toStr(r[1]);
        const cidade = toStr(r[2]);
        if (!data || !frota || !cidade) continue;

        despesasRows.push({
          data,
          frota,
          cidade,
          motoristaNome:    toStr(r[3])  || undefined,
          ajudanteNome:     toStr(r[4])  || undefined,
          frete:            toNum(r[5]),
          km:               toNum(r[6]),
          dieselLt:         toNum(r[7]),
          dieselRs:         toNum(r[8]),
          das:              toNum(r[9]),
          motorista:        toNum(r[10]),
          almoco:           toNum(r[11]),
          ajudante:         toNum(r[12]),
          pedagio:          toNum(r[13]),
          unimed:           toNum(r[14]),
          seguro:           toNum(r[15]),
          gasto:            toNum(r[16]),
          rastreador:       toNum(r[17]),
          inss:             toNum(r[18]),
          escritorio:       toNum(r[19]),
          ipva:             toNum(r[20]),
          bsoft:            toNum(r[21]),
          // [22] = Total Despesa (computed) — skip
          lucro:            toNum(r[23]),
          trocaOleoParcela: toStr(r[24]) || undefined,
          obs:              toStr(r[25]) || null,
        });
      }
    }

    // ── Validate we have something to restore ──────────────────────────────
    if (fretesRows.length === 0 && abastRows.length === 0 && despesasRows.length === 0) {
      res.status(400).json({ error: "Nenhum dado válido encontrado no arquivo" });
      return;
    }

    req.log.info(
      { fretes: fretesRows.length, abastecimentos: abastRows.length, despesas: despesasRows.length },
      "Iniciando restauração de backup…",
    );

    // ── Replace all data in a transaction ──────────────────────────────────
    await db.transaction(async (tx) => {
      await tx.delete(fretesTable);
      await tx.delete(abastecimentosTable);
      await tx.delete(despesasTable);

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
      if (despesasRows.length > 0) {
        for (let i = 0; i < despesasRows.length; i += 500) {
          await tx.insert(despesasTable).values(despesasRows.slice(i, i + 500));
        }
      }
    });

    req.log.info(
      { fretes: fretesRows.length, abastecimentos: abastRows.length, despesas: despesasRows.length },
      "Restauração concluída",
    );

    res.json({
      fretes: fretesRows.length,
      abastecimentos: abastRows.length,
      despesas: despesasRows.length,
      message: "Dados restaurados com sucesso",
    });
  },
);

export default router;
