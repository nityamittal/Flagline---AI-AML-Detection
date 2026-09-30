// With AUTH_SECRET or the GitHub OAuth variables missing, the app runs as a guest-only demo:
// nobody is admin, Auth.js is never called (it would throw), and the sign-in endpoints answer 404.
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(async () => {
    throw new Error("MissingSecret: Please define a `secret`");
  }),
  handlers: { GET: jest.fn(), POST: jest.fn() },
}));
jest.mock("@/lib/db", () => ({
  db: { user: { findUnique: jest.fn() }, upload: { create: jest.fn() } },
}));

import type { NextRequest } from "next/server";
import { GET as authGet, POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { POST as importUpload } from "@/app/api/uploads/route";
import { auth, handlers } from "@/lib/auth";
import { authEnabled } from "@/lib/auth-config";
import { getAdmin } from "@/lib/authz";
import { db } from "@/lib/db";

const ENV_KEYS = ["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"] as const;
const configure = (vars: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, vars);
};
const ALL = { AUTH_SECRET: "s", AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "gs" };

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("authEnabled", () => {
  it("needs the secret and both GitHub OAuth variables", () => {
    expect(authEnabled(ALL)).toBe(true);
    expect(authEnabled({ ...ALL, AUTH_SECRET: "" })).toBe(false);
    expect(authEnabled({ ...ALL, AUTH_GITHUB_ID: undefined })).toBe(false);
    expect(authEnabled({ AUTH_SECRET: "s" })).toBe(false);
    expect(authEnabled({})).toBe(false);
  });
});

describe.each([
  ["nothing configured", {}],
  ["no AUTH_SECRET", { AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "gs" }],
  ["no GitHub OAuth app", { AUTH_SECRET: "s" }],
])("with %s", (_, vars) => {
  beforeEach(() => configure(vars));

  it("getAdmin returns null without touching Auth.js", async () => {
    await expect(getAdmin()).resolves.toBeNull();
    expect(auth).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("the upload endpoint answers 403 instead of crashing", async () => {
    const body = new FormData();
    body.append("file", new File(["x"], "a.csv"));
    const response = await importUpload(
      new Request("http://localhost/api/uploads", { method: "POST", body }),
    );

    expect(response.status).toBe(403);
    expect(db.upload.create).not.toHaveBeenCalled();
  });

  it("the Auth.js endpoints answer 404", async () => {
    const request = new Request("http://localhost/api/auth/session") as unknown as NextRequest;

    expect((await authGet(request)).status).toBe(404);
    expect((await authPost(request)).status).toBe(404);
    expect(handlers.GET).not.toHaveBeenCalled();
  });
});

it("fails closed if Auth.js throws even though it is configured", async () => {
  configure(ALL);

  await expect(getAdmin()).resolves.toBeNull();
  expect(auth).toHaveBeenCalled();
});
