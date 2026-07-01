---
name: Drizzle column-array typing & XLSX buffer read
description: Two non-obvious gotchas hit while building list-of-columns helpers and importing .xlsx files
---

## Array of heterogeneous Drizzle columns

When building `const X = [{ label, col: table.someCol }, ...]`, do NOT annotate
`col` as `typeof table.someCol` — that narrows to that ONE column's literal
`name`, so every other column fails to assign ("Type '\"unimed\"' is not
assignable to type '\"diesel_rs\"'").

**Fix:** annotate as `AnyPgColumn` from `drizzle-orm/pg-core`:
`const X: Array<{ label: string; col: AnyPgColumn }> = [...]`.

**Why:** the first element's inferred type becomes the required type for the
whole array unless widened.

## Reading .xlsx from attached_assets

`XLSX.readFile(path)` from the ESM build (`xlsx/xlsx.mjs`) throws
"Cannot access file <path>" even when the file exists and is readable.

**Fix:** read the bytes yourself and use `XLSX.read(buf, { type: "buffer" })`:
```js
import { readFileSync } from "node:fs";
const wb = XLSX.read(readFileSync(path), { type: "buffer" });
```

**How to apply:** any time you parse an Excel file server-side / in a script
in this repo, prefer buffer read over `readFile`.
