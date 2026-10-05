import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "云径 CinePath | Spatial Cinematography",
  description:
    "把已写好的故事放进真实空间，用参考画面定义视觉语言，生成可执行摄影路径。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
