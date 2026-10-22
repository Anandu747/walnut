/** @type {import('next').NextConfig} */
// NEXT_DIST_DIR lets a production build run alongside `next dev` without sharing .next.
const nextConfig = { eslint: { ignoreDuringBuilds: true }, distDir: process.env.NEXT_DIST_DIR || '.next' };
export default nextConfig;
