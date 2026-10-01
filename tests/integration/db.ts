import { db } from "@/lib/db";
import { validateCsv } from "@/lib/uploads/validate";
import { importRows } from "@/lib/uploads/import";

/** Integration suites run only when a test database is configured (always in CI). */
export const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;

export async function resetDb() {
  await db.$executeRawUnsafe(
    'TRUNCATE "AuditLog", "Decision", "Flag", "Transaction", "Upload", "GuestSession", "User", "RateLimit" CASCADE',
  );
}

export const HEADER = "external_id,timestamp,from_account,to_account,amount,currency,payment_type";

/** Two identical payments 30 minutes apart: the duplicate rule flags the second one. */
export const SMALL_CSV = [
  HEADER,
  "1,2022-09-01T10:00:00Z,001-AAAAA1,002-BBBBB2,250.00,US Dollar,ACH",
  "2,2022-09-01T10:30:00Z,001-AAAAA1,002-BBBBB2,250.00,US Dollar,ACH",
  "3,2022-09-01T11:00:00Z,003-CCCCC3,004-DDDDD4,99.99,Euro,Wire",
].join("\n");

export async function createAdmin(login = "the-admin") {
  return db.user.create({ data: { githubId: `gh-${login}`, githubLogin: login, role: "ADMIN" } });
}

export async function seedSmallUpload() {
  const admin = await createAdmin("seed-admin");
  const { rows } = validateCsv(SMALL_CSV);
  return importRows(admin, "small.csv", rows);
}
