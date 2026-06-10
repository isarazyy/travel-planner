import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async headers() {
    return [
      {
        // 页面 HTML 不做长期共享缓存，每次访问校验最新版，
        // 避免部署后边缘/浏览器缓存旧 HTML 指向已不存在的旧 JS 导致白屏点不动。
        // 带哈希的 /_next/static 资源不受影响，仍由 Next 设为长期 immutable 缓存。
        source: '/:path((?!_next/|api/).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
