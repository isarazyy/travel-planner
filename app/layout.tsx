import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import GeneratingBanner from "@/components/GeneratingBanner";
import ChunkReloadGuard from "@/components/ChunkReloadGuard";

export const metadata: Metadata = {
  title: "旅行规划师 - 你的专属旅行定制工具",
  description: "输入目的地和偏好，AI为你生成个性化旅行方案，支持穷游、自驾、高铁、飞机多种模式对比。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased bg-gray-50 min-h-screen">
        <ChunkReloadGuard />
        <Header />
        <main>{children}</main>
        <GeneratingBanner />
      </body>
    </html>
  );
}
