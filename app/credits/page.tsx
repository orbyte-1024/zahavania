import type { Metadata } from "next";
import { CreditsPage } from "@/components/CreditsPage";

export const metadata: Metadata = {
  title: "Checkeko — crédits photos",
};

export default function Credits() {
  return <CreditsPage />;
}
