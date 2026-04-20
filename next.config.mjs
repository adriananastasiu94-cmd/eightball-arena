import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.resolve(process.cwd())
};

export default nextConfig;