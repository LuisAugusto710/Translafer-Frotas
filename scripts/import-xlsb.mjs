/**
 * Import freight records from COCA sheet of the .xlsb file into the fretes table.
 * 
 * Column mapping (row 1 = header, row 2+ = data):
 *   Col 0: DATA CTE     → data_cte  (often null/merged; falls back to dta_frete)
 *   Col 1: ORIGEM       → origem
 *   Col 2: TRANSPORTE   → transporte
 *   Col 3: FROTA        → frota
 *   Col 4: TRANSP       → transp
 *   Col 5: CLIENTE      → cliente
 *   Col 6: CIDADE       → cidade
 *   Col 7: CTE/NF       → cte_nf
 *   Col 8: PESO         → peso
 *   Col 9: FRETE        → frete
 *   Col 10: PEDÁGIO     → pedagio
 *   Col 11: TOTAL       → (ignored — derived from frete + pedagio)
 *   Col 12: DTA FRETE   → dta_frete
 *   Col 13: VENCIMENTO  → vencimento
 *
 * Duplicate detection: primary = cte_nf uniqueness;
 * fallback = (transporte, frota, cliente, dta_frete) tuple.
 */

import XLSX from '/home/runner/workspace/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx/xlsx.js';
import pg from '/home/runner/workspace/node_modules/.pnpm/pg@8.22.0/node_modules/pg/lib/index.js';
import fs from 'fs';

const { Pool } = pg;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "M/D/YY" or "M/D/YYYY" → "YYYY-MM-DD", or return null. */
function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YY or M/D/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let [, mo, dy, yr] = m;
  if (yr.length === 2) yr = '20' + yr;
  return `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}`;
}

/** Strip "R$ ", commas, spaces and return a float string, or "0". */
function parseMoney(raw) {
  if (raw == null) return '0';
  const s = String(raw).replace(/R\$\s*/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? '0' : n.toFixed(2);
}

/** Strip thousands separators and return a float string, or "0". */
function parseNum(raw) {
  if (raw == null) return '0';
  // "2,919" → 2919 (comma is thousands sep in this sheet, not decimal)
  const s = String(raw).replace(/,/g, '').replace(/\s/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? '0' : n.toFixed(2);
}

// ── Read workbook ─────────────────────────────────────────────────────────────

const filePath = '/home/runner/workspace/attached_assets/COCA_GRACAS_A_DEUS_(1)_1782605071542.xlsb';
console.log('Reading workbook…');
const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf, { type: 'buffer', sheets: 'COCA', cellDates: true, dense: true });
const ws = wb.Sheets['COCA'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
console.log(`Total rows in sheet: ${rows.length}`);

// Row 1 = header, Row 2+ = data (Row 0 is empty/title)
const dataRows = rows.slice(2);

// ── Build records ─────────────────────────────────────────────────────────────

const records = [];
const skipped = [];

for (let i = 0; i < dataRows.length; i++) {
  const r = dataRows[i];
  const rowNum = i + 3; // 1-based Excel row number

  const rawDataCte   = r[0];
  const rawOrigem    = r[1];
  const rawTransp    = r[2];
  const rawFrota     = r[3];
  const rawTranspNm  = r[4];
  const rawCliente   = r[5];
  const rawCidade    = r[6];
  const rawCteNf     = r[7];
  const rawPeso      = r[8];
  const rawFrete     = r[9];
  const rawPedagio   = r[10];
  // col 11 = TOTAL FRETE (skipped — derived)
  const rawDtaFrete  = r[12];
  const rawVenc      = r[13];

  // Skip completely empty rows
  const hasAny = [rawOrigem, rawFrota, rawCliente, rawCidade, rawCteNf, rawDtaFrete].some(
    v => v !== null && String(v).trim() !== ''
  );
  if (!hasAny) {
    skipped.push({ rowNum, reason: 'empty row' });
    continue;
  }

  const dtaFrete  = parseDate(rawDtaFrete);
  const dataCte   = parseDate(rawDataCte) ?? dtaFrete; // fallback to dtaFrete (merged cell)
  const vencimento = parseDate(rawVenc);

  const origem    = rawOrigem   ? String(rawOrigem).trim()   : null;
  const transporte= rawTransp   ? String(rawTransp).trim()   : null;
  const frota     = rawFrota    ? String(rawFrota).trim()    : null;
  const transp    = rawTranspNm ? String(rawTranspNm).trim() : null;
  const cliente   = rawCliente  ? String(rawCliente).trim()  : null;
  const cidade    = rawCidade   ? String(rawCidade).trim()   : null;
  const cteNf     = rawCteNf    ? String(rawCteNf).trim()    : null;
  const peso      = parseNum(rawPeso);
  const frete     = parseMoney(rawFrete);
  const pedagio   = parseMoney(rawPedagio);

  // Required fields
  if (!dataCte || !origem || !frota || !cliente || !cidade) {
    skipped.push({ rowNum, reason: 'missing required field', data: { dataCte, origem, frota, cliente, cidade } });
    continue;
  }

  records.push({ dataCte, origem, transporte, frota, transp, cliente, cidade, cteNf, peso, frete, pedagio, dtaFrete, vencimento });
}

console.log(`Valid records parsed: ${records.length}`);
console.log(`Skipped rows: ${skipped.length}`);

// ── Connect to DB ─────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Load existing records for duplicate detection ─────────────────────────────

console.log('Loading existing records for duplicate detection…');
const existingRes = await pool.query(
  `SELECT cte_nf, transporte, frota, cliente, dta_frete::text FROM fretes`
);

const existingCteNf = new Set();
const existingTuples = new Set();

for (const row of existingRes.rows) {
  if (row.cte_nf) existingCteNf.add(row.cte_nf.trim());
  // tuple key: transporte|frota|cliente|dtaFrete
  const key = `${row.transporte ?? ''}|${row.frota ?? ''}|${row.cliente ?? ''}|${row.dta_frete ?? ''}`;
  existingTuples.add(key);
}

console.log(`Existing records in DB: ${existingRes.rows.length}`);

// ── Insert new records ────────────────────────────────────────────────────────

let inserted = 0;
let duplicates = 0;
const errors = [];

const client = await pool.connect();
try {
  await client.query('BEGIN');

  for (const rec of records) {
    // Check 1: by cte_nf
    if (rec.cteNf && existingCteNf.has(rec.cteNf)) {
      duplicates++;
      continue;
    }

    // Check 2: by (transporte, frota, cliente, dtaFrete)
    const tupleKey = `${rec.transporte ?? ''}|${rec.frota ?? ''}|${rec.cliente ?? ''}|${rec.dtaFrete ?? ''}`;
    if (existingTuples.has(tupleKey)) {
      duplicates++;
      continue;
    }

    try {
      await client.query(
        `INSERT INTO fretes
          (data_cte, origem, transporte, frota, transp, cliente, cidade,
           cte_nf, peso, frete, pedagio, dta_frete, vencimento)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          rec.dataCte, rec.origem, rec.transporte, rec.frota, rec.transp,
          rec.cliente, rec.cidade, rec.cteNf, rec.peso, rec.frete,
          rec.pedagio, rec.dtaFrete, rec.vencimento,
        ]
      );
      inserted++;

      // Register in sets so later rows in same batch don't duplicate
      if (rec.cteNf) existingCteNf.add(rec.cteNf);
      existingTuples.add(tupleKey);
    } catch (err) {
      errors.push({ rec, error: err.message });
    }
  }

  await client.query('COMMIT');
  console.log(`\n✅ Import complete`);
  console.log(`   Inserted:   ${inserted}`);
  console.log(`   Duplicates: ${duplicates}`);
  console.log(`   Skipped:    ${skipped.length}`);
  console.log(`   Errors:     ${errors.length}`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach(e => console.log(' -', e.error, JSON.stringify(e.rec).substring(0, 100)));
  }
  if (skipped.length > 0) {
    console.log('\nSkipped rows (first 10):');
    skipped.slice(0, 10).forEach(s => console.log(' -', JSON.stringify(s)));
  }
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Transaction failed, rolled back:', err.message);
} finally {
  client.release();
  await pool.end();
}
