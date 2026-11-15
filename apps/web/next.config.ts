import type { NextConfig } from "next";

const config: NextConfig = {
  // Workspace packages ship TS source; let Next compile them.
  transpilePackages: ["@dagleitv/protocol", "@dagleitv/rtc-core"],
  // The dev badge sits on the room's control strip; errors still surface in the overlay.
  devIndicators: false,
  // The room link is the only secret: keep it out of Referer and out of frames.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default config;
