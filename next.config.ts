import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CLAUDE.md is the hackathon build doc; keep next dev from appending to it.
  agentRules: false,
};

export default nextConfig;
