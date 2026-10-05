import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./flyvision.css";

export const metadata: Metadata = {
  title: "Flyvision",
  description: "上传参考图，电脑摄像头或 ESP32-CAM 对照。YOLOv8 + 占位伺服。",
};

export default function FlyvisionLayout({ children }: { children: ReactNode }) {
  return children;
}
