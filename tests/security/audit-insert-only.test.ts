// The audit log is append-only in code: no source file may update or delete AuditLog rows.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOTS = ["app", "lib", "scripts", "proxy.ts"];

function sourceFiles(entry: string): string[] {
  if (statSync(entry).isFile()) return /\.(ts|tsx)$/.test(entry) ? [entry] : [];
  return readdirSync(entry).flatMap((name) => sourceFiles(path.join(entry, name)));
}

it("has no update or delete path for AuditLog", () => {
  const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
    /auditLog\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b|"AuditLog"[^;]*\b(UPDATE|DELETE|TRUNCATE)\b|\b(UPDATE|DELETE FROM|TRUNCATE)\s+"AuditLog"/.test(
      readFileSync(file, "utf8"),
    ),
  );

  expect(offenders).toEqual([]);
});
