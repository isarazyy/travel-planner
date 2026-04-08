import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 避免开发环境里 localhost / 127.0.0.1 混用触发 HMR 跨域拦截，导致页面空白或打不开。
   */
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

export default nextConfig;
