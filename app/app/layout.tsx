import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — outils`,
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
