import nextJest from "next/jest.js";

// next/jest compiles TypeScript with the Next.js compiler and loads .env files.
const createJestConfig = nextJest({ dir: "./" });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
};

export default createJestConfig(config);
