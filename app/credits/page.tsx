import type { Metadata } from "next";
import { CreditsPage } from "@/components/CreditsPage";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — crédits photos`,
};

export default function Credits() {
  return <CreditsPage />;
}
