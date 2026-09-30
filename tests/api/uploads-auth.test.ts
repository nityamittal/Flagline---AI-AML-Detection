// A guest calling the upload endpoints directly gets 403 and nothing touches the database.
// Only the session (lib/auth) and the database are mocked; getAdmin and the routes are real.
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));
jest.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: jest.fn() },
    upload: { create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { POST as importUpload } from "@/app/api/uploads/route";
import { POST as previewUpload } from "@/app/api/uploads/preview/route";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const mockAuth = auth as unknown as jest.Mock;
const mockDb = db as unknown as {
  user: { findUnique: jest.Mock };
  upload: { create: jest.Mock };
  $transaction: jest.Mock;
};

const VALID_CSV = [
  "external_id,timestamp,from_account,to_account,amount,currency,payment_type",
  "1,2022-09-01T00:00:00Z,001-A,002-B,100.00,US Dollar,ACH",
].join("\n");

function uploadRequest(url: string, csv = VALID_CSV) {
  const body = new FormData();
  body.append("file", new File([csv], "demo.csv", { type: "text/csv" }));
  return new Request(url, { method: "POST", body });
}

const ADMIN = { id: "u1", githubId: "42", githubLogin: "the-admin", role: "ADMIN" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_GITHUB_USERNAMES = "the-admin";
  // Sign-in configured (lib/auth-config.ts); tests/auth/auth-disabled.test.ts covers the opposite.
  Object.assign(process.env, { AUTH_SECRET: "x", AUTH_GITHUB_ID: "x", AUTH_GITHUB_SECRET: "x" });
});

describe("upload endpoints as a guest", () => {
  beforeEach(() => mockAuth.mockResolvedValue(null));

  it("rejects the import with 403 and saves nothing", async () => {
    const response = await importUpload(uploadRequest("http://localhost/api/uploads"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Only the admin can do this." });
    expect(mockDb.upload.create).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("rejects the preview with 403", async () => {
    const response = await previewUpload(uploadRequest("http://localhost/api/uploads/preview"));

    expect(response.status).toBe(403);
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("upload endpoints with an admin session", () => {
  beforeEach(() => {
    mockAuth.mockResolvedValue({ user: { id: ADMIN.id, role: "ADMIN" } });
    mockDb.user.findUnique.mockResolvedValue(ADMIN);
  });

  it("returns 403 once the login is removed from ADMIN_GITHUB_USERNAMES", async () => {
    process.env.ADMIN_GITHUB_USERNAMES = "someone-else";

    const response = await importUpload(uploadRequest("http://localhost/api/uploads"));

    expect(response.status).toBe(403);
    expect(mockDb.upload.create).not.toHaveBeenCalled();
  });

  it("lets the admin preview a file", async () => {
    const response = await previewUpload(uploadRequest("http://localhost/api/uploads/preview"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rowCount: 1, errorCount: 0 });
  });

  it("rejects a file with errors with 422 and imports nothing", async () => {
    const bad = VALID_CSV.replace("100.00", "abc");

    const response = await importUpload(uploadRequest("http://localhost/api/uploads", bad));

    expect(response.status).toBe(422);
    expect(mockDb.upload.create).not.toHaveBeenCalled();
  });
});
