import { forbiddenResponse, getAdmin } from "@/lib/authz";
import { importRows } from "@/lib/uploads/import";
import { readCsvUpload } from "@/lib/uploads/request";
import { validateCsv } from "@/lib/uploads/validate";

// Admin only. Validates the whole file again (never trusts the preview) and imports it only if
// every row is valid; any error rejects the file and nothing is saved.
export async function POST(request: Request) {
  const admin = await getAdmin();
  if (!admin) return forbiddenResponse();

  const upload = await readCsvUpload(request);
  if ("error" in upload) return upload.error;

  const { rows, errors, errorCount } = validateCsv(upload.csv);
  if (errorCount > 0) {
    return Response.json(
      { error: "The file has errors; nothing was imported.", errors, errorCount },
      { status: 422 },
    );
  }

  const result = await importRows(admin, upload.fileName, rows);
  return Response.json(result, { status: 201 });
}
