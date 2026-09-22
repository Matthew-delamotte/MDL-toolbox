import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["@prisma/client", "pg"],
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  // Prisma runs its native Postgres engine: the wasm runtimes of other databases and edge builds
  // were traced into every function and multiplied Vercel's function storage.
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/@prisma/client/runtime/*.wasm*",
      "./node_modules/@prisma/client/runtime/*{cockroachdb,mysql,sqlserver,sqlite}*",
      "./node_modules/@prisma/client/runtime/{edge,wasm,react-native}*",
      "./node_modules/.prisma/client/*.tmp*",
    ],
  },
};
export default config;
