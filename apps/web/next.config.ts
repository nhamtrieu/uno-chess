import type { NextConfig } from "next";

const config: NextConfig = {
  // core is shipped as TypeScript source
  transpilePackages: ["@uno-chess/core"],
};

export default config;
