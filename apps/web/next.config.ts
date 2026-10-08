import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TS source; let Next compile them.
  transpilePackages: ["@dagleitv/protocol", "@dagleitv/rtc-core"],
  // The dev badge sits on the room's control strip; errors still surface in the overlay.
  devIndicators: false,
};

export default config;
