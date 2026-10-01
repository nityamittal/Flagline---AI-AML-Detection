import { forbiddenResponse, getAdmin } from "@/lib/authz";
import { readCsvUpload } from "@/lib/uploads/request";
import { validateCsv } from "@/lib/uploads/validate";

// Admin only. Validates a CSV without saving anything and returns the first rows plus any errors.
export async function POST(request: Request) {
  if (!(await getAdmin())) return forbiddenResponse();

  const upload = await readCsvUpload(request);
  if ("error" in upload) return upload.error;

  const { rowCount, preview, errors, errorCount } = validateCsv(upload.csv);
  return Response.json({ fileName: upload.fileName, rowCount, preview, errors, errorCount });
}
