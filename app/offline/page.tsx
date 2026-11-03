import type { Metadata } from "next";
import { OfflinePage } from "@/components/OfflinePage";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — hors ligne`,
  robots: { index: false },
};

export default function Offline() {
  return <OfflinePage />;
}
