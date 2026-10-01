import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /sample.csv reads data/demo.csv at runtime; make sure the file ships with that route.
  outputFileTracingIncludes: { "/sample.csv": ["./data/demo.csv"] },
  experimental: {
    // Enables forbidden() so admin pages answer a guest with a real 403 and app/forbidden.tsx.
    authInterrupts: true,
  },
};

export default nextConfig;
