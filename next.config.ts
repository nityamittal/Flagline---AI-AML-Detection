import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() so admin pages answer a guest with a real 403 and app/forbidden.tsx.
    authInterrupts: true,
  },
};

export default nextConfig;
