import nextJest from "next/jest.js";

// next/jest compiles TypeScript with the Next.js compiler and loads .env files.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  // Integration suites share one test database, so run files one at a time.
  maxWorkers: process.env.TEST_DATABASE_URL ? 1 : "50%",
};

export default createJestConfig(config);
