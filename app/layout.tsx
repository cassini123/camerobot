import type { Metadata } from "next";
import { IBM_Plex_Sans, Syne } from "next/font/google";
import "./globals.css";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const plex = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

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
      <body className={`${syne.variable} ${plex.variable}`}>
        {children}
      </body>
    </html>
  );
}
