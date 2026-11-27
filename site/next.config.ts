import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  agentRules: false,
  redirects: async () => [
    { source: "/features/ghosts", destination: "/features", permanent: true },
    { source: "/roadmap", destination: "/", permanent: true },
  ],
};

export default nextConfig;

import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());
