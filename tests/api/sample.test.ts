import { GET } from "@/app/sample.csv/route";
import { REQUIRED_COLUMNS, validateCsv } from "@/lib/uploads/validate";

it("serves data/demo.csv as a downloadable CSV that passes upload validation", async () => {
  const response = await GET();
  const csv = await response.text();

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toMatch(/^text\/csv/);
  expect(response.headers.get("content-disposition")).toMatch(/attachment/);
  expect(csv.split("\n")[0].trim()).toBe(REQUIRED_COLUMNS.join(","));

  const result = validateCsv(csv);
  expect(result.errorCount).toBe(0);
  expect(result.rowCount).toBeGreaterThan(19_000);
});
