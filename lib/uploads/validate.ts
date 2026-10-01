import { Prisma } from "@prisma/client";
import Papa from "papaparse";
import { z } from "zod";
import { isSupportedCurrency, toUsd } from "@/lib/uploads/fx";

export const REQUIRED_COLUMNS = [
  "external_id",
  "timestamp",
  "from_account",
  "to_account",
  "amount",
  "currency",
  "payment_type",
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 50_000;
const MAX_REPORTED_ERRORS = 100;
const PREVIEW_ROWS = 10;

export type RawRow = Record<(typeof REQUIRED_COLUMNS)[number], string>;

export type ValidRow = {
  externalId: string;
  timestamp: Date;
  fromAccount: string;
  toAccount: string;
  amount: Prisma.Decimal;
  currency: string;
  amountUsd: Prisma.Decimal;
  paymentType: string;
};

/** `row` is the line number in the file (the header is line 1), or null for file-level errors. */
export type RowError = { row: number | null; message: string };

export type CsvValidation = {
  rowCount: number;
  preview: RawRow[];
  rows: ValidRow[];
  errors: RowError[];
  /** Total error count; `errors` holds at most the first 100. */
  errorCount: number;
};

// ISO 8601 in UTC (what data/demo.csv uses), or the IBM file's "2022/08/09 05:14" read as UTC.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const IBM = /^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})$/;

function parseTimestamp(value: string): Date | null {
  let date: Date | null = null;
  if (ISO_UTC.test(value)) date = new Date(value);
  const ibm = IBM.exec(value);
  if (ibm) date = new Date(`${ibm[1]}-${ibm[2]}-${ibm[3]}T${ibm[4]}:${ibm[5]}:00Z`);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

const text = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is longer than ${max} characters`);

// Up to 16 integer digits and 8 decimals, matching the Decimal(24, 8) amount column.
const AMOUNT = /^\d{1,16}(\.\d{1,8})?$/;

const rowSchema = z
  .object({
    external_id: text("external_id", 64),
    timestamp: text("timestamp", 40).transform((value, ctx) => {
      const date = parseTimestamp(value);
      if (!date) {
        ctx.addIssue({
          code: "custom",
          message: `timestamp "${value}" is not ISO 8601 UTC or YYYY/MM/DD HH:MM`,
        });
        return z.NEVER;
      }
      return date;
    }),
    from_account: text("from_account", 64),
    to_account: text("to_account", 64),
    amount: text("amount", 40).regex(AMOUNT, "amount is not a non-negative number"),
    currency: text("currency", 40).refine(isSupportedCurrency, {
      message: "currency has no rate in data/fx_rates.json",
    }),
    payment_type: text("payment_type", 40),
  })
  .transform((r): ValidRow => {
    const amount = new Prisma.Decimal(r.amount);
    return {
      externalId: r.external_id,
      timestamp: r.timestamp,
      fromAccount: r.from_account,
      toAccount: r.to_account,
      amount,
      currency: r.currency,
      amountUsd: toUsd(amount, r.currency),
      paymentType: r.payment_type,
    };
  });

export function validateCsv(csv: string): CsvValidation {
  const errors: RowError[] = [];
  let errorCount = 0;
  const addError = (row: number | null, message: string) => {
    errorCount++;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push({ row, message });
  };
  const result = (rows: ValidRow[], preview: RawRow[], rowCount: number): CsvValidation => ({
    rowCount,
    preview,
    rows: errorCount === 0 ? rows : [],
    errors,
    errorCount,
  });

  const parsed = Papa.parse<Record<string, string>>(csv.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });

  const columns = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((column) => !columns.includes(column));
  if (missing.length > 0) {
    addError(null, `Missing required column(s): ${missing.join(", ")}`);
    return result([], [], parsed.data.length);
  }
  if (parsed.data.length === 0) {
    addError(null, "The file has a header but no rows");
    return result([], [], 0);
  }
  if (parsed.data.length > MAX_ROWS) {
    addError(
      null,
      `The file has ${parsed.data.length.toLocaleString("en-US")} rows; the limit is ${MAX_ROWS.toLocaleString("en-US")}`,
    );
    return result([], [], parsed.data.length);
  }

  // Papa's own errors (e.g. wrong field count), reported against the file's line number.
  for (const error of parsed.errors) {
    addError(error.row === undefined ? null : error.row + 2, error.message);
  }

  const rows: ValidRow[] = [];
  const seenIds = new Map<string, number>();
  parsed.data.forEach((record, index) => {
    const line = index + 2;
    const check = rowSchema.safeParse(record);
    if (!check.success) {
      for (const issue of check.error.issues) addError(line, issue.message);
      return;
    }
    const firstLine = seenIds.get(check.data.externalId);
    if (firstLine !== undefined) {
      addError(line, `external_id "${check.data.externalId}" repeats line ${firstLine}`);
      return;
    }
    seenIds.set(check.data.externalId, line);
    rows.push(check.data);
  });

  const preview = parsed.data
    .slice(0, PREVIEW_ROWS)
    .map((record) =>
      Object.fromEntries(REQUIRED_COLUMNS.map((column) => [column, record[column] ?? ""])),
    ) as RawRow[];

  return result(rows, preview, parsed.data.length);
}
