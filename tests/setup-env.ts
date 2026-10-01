// Integration tests talk to a real Postgres named in TEST_DATABASE_URL. Point lib/db at it before
// any test module loads, and refuse anything that isn't clearly a throwaway test database, since
// the integration tests truncate every table.
const url = process.env.TEST_DATABASE_URL;
if (url) {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in "_test" (got "${name}")`);
  }
  process.env.DATABASE_URL = url;
}
