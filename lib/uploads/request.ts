import { MAX_UPLOAD_BYTES } from "@/lib/uploads/validate";

// Room for the multipart boundary and headers around the file itself.
const MULTIPART_OVERHEAD = 64 * 1024;

/** Reads the `file` field of a multipart upload, or returns the error Response to send instead. */
export async function readCsvUpload(
  request: Request,
): Promise<{ fileName: string; csv: string } | { error: Response }> {
  const tooLarge = () => ({
    error: Response.json({ error: "The file is larger than 5 MB." }, { status: 413 }),
  });

  // Reject oversized bodies before buffering them.
  const length = Number(request.headers.get("content-length"));
  if (length > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD) return tooLarge();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return {
      error: Response.json({ error: "Expected a multipart form upload." }, { status: 400 }),
    };
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { error: Response.json({ error: "Attach a CSV file as `file`." }, { status: 400 }) };
  }
  if (file.size > MAX_UPLOAD_BYTES) return tooLarge();
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { error: Response.json({ error: "Only .csv files are accepted." }, { status: 400 }) };
  }

  return { fileName: file.name, csv: await file.text() };
}
