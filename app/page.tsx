import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${BRAND_NAME} — vérification pour les rédactions de Madagascar`,
  description: "Vérifiez une information, trouvez ses sources et les bons experts, en malagasy, en français et en anglais.",
};

export default function Home() {
  return <Landing />;
}
