import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TS source; let Next compile them.
  transpilePackages: ["@dagleitv/protocol", "@dagleitv/rtc-core"],
};

export default config;
