import type { Metadata } from "next";
import { Workspace } from "@/components/workspace/Workspace";

export const metadata: Metadata = {
  title: "Checkeko — outils",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Workspace>{children}</Workspace>;
}
