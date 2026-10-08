import type { NextConfig } from "next";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["lunar-javascript"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "same-origin" },
    ] }];
  },
};
export default config;
