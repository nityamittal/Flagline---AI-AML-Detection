import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import type { ValidRow } from "@/lib/uploads/validate";

const CHUNK = 1_000;

/**
 * Saves already-validated rows as one Upload. The transactions go in inside a single database
 * transaction, so a failure leaves no partial import: the Upload row is marked FAILED instead.
 */
export async function importRows(admin: User, fileName: string, rows: ValidRow[]) {
  const upload = await db.upload.create({
    data: { fileName, uploadedById: admin.id, status: "PROCESSING" },
  });

  try {
    await db.$transaction(
      async (tx) => {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.transaction.createMany({
            data: rows.slice(i, i + CHUNK).map((row) => ({ ...row, uploadId: upload.id })),
          });
        }
        await tx.upload.update({
          where: { id: upload.id },
          data: { status: "DONE", rowCount: rows.length },
        });
      },
      { timeout: 120_000 },
    );
  } catch (error) {
    await db.upload.update({ where: { id: upload.id }, data: { status: "FAILED" } });
    await audit(admin, "upload.failed", upload.id, { fileName });
    throw error;
  }

  await audit(admin, "upload.import", upload.id, { fileName, rowCount: rows.length });
  return { uploadId: upload.id, rowCount: rows.length };
}

function audit(admin: User, action: string, uploadId: string, metadata: Prisma.InputJsonObject) {
  return db.auditLog.create({
    data: {
      actorType: "ADMIN",
      actorId: admin.id,
      action,
      entityType: "Upload",
      entityId: uploadId,
      metadata,
    },
  });
}
