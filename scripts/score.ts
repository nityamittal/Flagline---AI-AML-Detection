// Scores the rules against data/labels.csv: precision and recall per rule and recall per
// typology, counted per transaction. Usage: npm run score [-- --upload <uploadId>]
// (default: the latest successful upload of demo.csv). Prints Markdown tables for the README.
import { readFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { RULES } from "@/lib/rules";

type Label = { is_laundering: string; typology: string };

const pct = (num: number, den: number) => (den === 0 ? "–" : `${((100 * num) / den).toFixed(1)}%`);
const table = (header: string[], rows: (string | number)[][]) =>
  [header, header.map(() => "---"), ...rows.map((r) => r.map(String))]
    .map((r) => `| ${r.join(" | ")} |`)
    .join("\n");

async function main() {
  const flagIndex = process.argv.indexOf("--upload");
  const upload = await db.upload.findFirst({
    where:
      flagIndex > -1
        ? { id: process.argv[flagIndex + 1] }
        : { fileName: "demo.csv", status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!upload) throw new Error("No upload to score. Run `npm run seed` first.");

  const csv = await readFile(path.join(process.cwd(), "data", "labels.csv"), "utf8");
  const labels = new Map(
    Papa.parse<Label & { external_id: string }>(csv, {
      header: true,
      skipEmptyLines: true,
    }).data.map((l) => [l.external_id, l]),
  );

  const txns = await db.transaction.findMany({
    where: { uploadId: upload.id },
    select: { id: true, externalId: true, flags: { select: { ruleId: true } } },
  });

  const positives = txns.filter((t) => labels.get(t.externalId)?.is_laundering === "1");
  const isPositive = (t: (typeof txns)[number]) => labels.get(t.externalId)?.is_laundering === "1";
  const firedBy = (t: (typeof txns)[number], ruleId?: string) =>
    ruleId ? t.flags.some((f) => f.ruleId === ruleId) : t.flags.length > 0;

  const ruleRows = [
    ...RULES.map((r) => ({ id: r.id, name: r.name })),
    { id: undefined, name: "**Any rule**" },
  ].map(({ id, name }) => {
    const flagged = txns.filter((t) => firedBy(t, id));
    const hits = flagged.filter(isPositive).length;
    return [name, flagged.length, hits, pct(hits, flagged.length), pct(hits, positives.length)];
  });

  const typologies = new Map<string, typeof txns>();
  for (const t of positives) {
    const typology = labels.get(t.externalId)?.typology || "(not in a sampled attempt)";
    typologies.set(typology, [...(typologies.get(typology) ?? []), t]);
  }
  const typologyRows = [...typologies.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([typology, group]) => [
      typology,
      group.length,
      ...RULES.map((r) => pct(group.filter((t) => firedBy(t, r.id)).length, group.length)),
      pct(group.filter((t) => firedBy(t)).length, group.length),
    ]);

  console.log(
    `Upload ${upload.id} (${upload.fileName}): ${txns.length} transactions, ${positives.length} labeled laundering (${pct(positives.length, txns.length)}).\n`,
  );
  console.log("Per rule (a transaction counts once per rule, however many flags it has):\n");
  console.log(table(["Rule", "Flagged", "Laundering", "Precision", "Recall"], ruleRows));
  console.log("\nRecall per typology:\n");
  console.log(
    table(["Typology", "Laundering txns", ...RULES.map((r) => r.name), "Any rule"], typologyRows),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
