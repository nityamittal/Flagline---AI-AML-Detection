// Imports data/demo.csv as an upload, through the same validation and import code as the
// upload page. Usage: npm run seed [-- --force] (--force imports again even if already seeded).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { importRows } from "@/lib/uploads/import";
import { validateCsv } from "@/lib/uploads/validate";

const FILE = path.join(process.cwd(), "data", "demo.csv");

// Uploads need an owner. This placeholder admin cannot sign in: it has no GitHub account and
// its login is not on the allow list that lib/authz.ts checks on every request.
const SEED_USER = { githubId: "seed", githubLogin: "flagline-seed" };

async function main() {
  const force = process.argv.includes("--force");
  const admin = await db.user.upsert({
    where: { githubId: SEED_USER.githubId },
    create: { ...SEED_USER, role: "ADMIN" },
    update: {},
  });

  const existing = await db.upload.findFirst({
    where: { uploadedById: admin.id, fileName: "demo.csv", status: "DONE" },
  });
  if (existing && !force) {
    console.log(
      `Already seeded (upload ${existing.id}, ${existing.rowCount} rows). Use --force to import again.`,
    );
    return;
  }

  const { rows, errors, errorCount, rowCount } = validateCsv(await readFile(FILE, "utf8"));
  if (errorCount > 0) {
    for (const error of errors)
      console.error(`  ${error.row === null ? "file" : `row ${error.row}`}: ${error.message}`);
    throw new Error(`data/demo.csv has ${errorCount} error(s); nothing was imported.`);
  }

  const started = Date.now();
  const { uploadId } = await importRows(admin, "demo.csv", rows);
  console.log(
    `Imported ${rowCount} rows as upload ${uploadId} in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
