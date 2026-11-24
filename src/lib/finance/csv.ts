/**
 * RFC 4180 CSV parsing/serialisation. Handles quoted fields, embedded newlines,
 * escaped quotes, CRLF, a UTF-8 BOM, and auto-detects , ; or TAB delimiters.
 * Serialisation guards against spreadsheet formula injection.
 */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

export function parseCSV(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCell(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Neutralise spreadsheet formulas, but leave plain numbers (e.g. -125.50) intact.
  if (FORMULA_START.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Serialise rows to CSV with a UTF-8 BOM so Excel opens Indian-rupee text correctly. */
export function toCSV(header: string[], rows: unknown[][], bom = true): string {
  const lines = [header.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))];
  return (bom ? "﻿" : "") + lines.join("\r\n") + "\r\n";
}
