import { validateCsv } from "@/lib/uploads/validate";

const HEADER = "external_id,timestamp,from_account,to_account,amount,currency,payment_type";
const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");
const row = (overrides: Partial<Record<string, string>> = {}) => {
  const values = {
    external_id: "1",
    timestamp: "2022-09-01T05:14:00Z",
    from_account: "00952-8139F54E0",
    to_account: "01588-8006ECDD0",
    amount: "100.00",
    currency: "US Dollar",
    payment_type: "ACH",
    ...overrides,
  };
  return Object.values(values).join(",");
};

describe("validateCsv", () => {
  it("accepts a good row and keeps money as exact decimals", () => {
    const result = validateCsv(csv(row({ amount: "1234.56" })));

    expect(result.errorCount).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      externalId: "1",
      fromAccount: "00952-8139F54E0",
      currency: "US Dollar",
      paymentType: "ACH",
    });
    expect(result.rows[0].timestamp.toISOString()).toBe("2022-09-01T05:14:00.000Z");
    expect(result.rows[0].amount.toString()).toBe("1234.56");
    expect(result.rows[0].amountUsd.toString()).toBe("1234.56");
  });

  it.each([
    ["Yen", "100", "0.73"],
    ["Bitcoin", "0.000984", "19.68"],
    ["Euro", "10.005", "10.51"], // 10.50525 rounds half-up to cents
    ["Rupee", "0.01", "0"],
  ])("converts %s %s to %s USD", (currency, amount, usd) => {
    const result = validateCsv(csv(row({ currency, amount })));

    expect(result.errorCount).toBe(0);
    expect(result.rows[0].amount.toString()).toBe(amount);
    expect(result.rows[0].amountUsd.toString()).toBe(usd);
  });

  it("reads the IBM timestamp format as UTC", () => {
    const result = validateCsv(csv(row({ timestamp: "2022/08/09 05:14" })));

    expect(result.rows[0].timestamp.toISOString()).toBe("2022-08-09T05:14:00.000Z");
  });

  it("fails the file when a required column is missing", () => {
    const result = validateCsv("external_id,timestamp,amount\n1,2022-09-01T00:00:00Z,5");

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      {
        row: null,
        message: "Missing required column(s): from_account, to_account, currency, payment_type",
      },
    ]);
  });

  it("reports a bad number against its line and rejects the whole file", () => {
    const result = validateCsv(csv(row(), row({ external_id: "2", amount: "12,5" })));

    expect(result.rows).toEqual([]);
    expect(result.errors.some((e) => e.row === 3)).toBe(true);
  });

  it.each([
    ["amount", "-5", "amount is not a non-negative number"],
    ["amount", "1e5", "amount is not a non-negative number"],
    ["currency", "Doubloon", "currency has no rate in data/fx_rates.json"],
    ["timestamp", "yesterday", 'timestamp "yesterday" is not ISO 8601 UTC or YYYY/MM/DD HH:MM'],
    ["from_account", "", "from_account is required"],
  ])("rejects %s = %j", (column, value, message) => {
    const result = validateCsv(csv(row({ [column]: value })));

    expect(result.rows).toEqual([]);
    expect(result.errors).toContainEqual({ row: 2, message });
  });

  it("rejects a repeated external_id", () => {
    const result = validateCsv(csv(row(), row()));

    expect(result.errors).toEqual([{ row: 3, message: 'external_id "1" repeats line 2' }]);
  });

  it("rejects a header with no rows", () => {
    expect(validateCsv(HEADER).errors).toEqual([
      { row: null, message: "The file has a header but no rows" },
    ]);
  });

  it("previews the first 10 rows only", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ external_id: String(i + 1) }));
    const result = validateCsv(csv(...rows));

    expect(result.rowCount).toBe(12);
    expect(result.preview).toHaveLength(10);
    expect(result.preview[0].external_id).toBe("1");
  });
});
