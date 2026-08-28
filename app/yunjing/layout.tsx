"use client";

import { LibraryProvider } from "@/components/LibraryProvider";
import type { ReactNode } from "react";

export default function YunjingLayout({ children }: { children: ReactNode }) {
  return <LibraryProvider>{children}</LibraryProvider>;
}
