import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./flyvision.css";

export const metadata: Metadata = {
  title: "Flyvision",
  description: "上传参考图，摄像头对照。YOLOv8 + 空间距离。",
};

export default function FlyvisionLayout({ children }: { children: ReactNode }) {
  return children;
}
