import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Checkeko — vérification pour les rédactions de Madagascar",
  description: "Vérifiez une information, trouvez ses sources et les bons experts, en malagasy, en français et en anglais.",
};

export default function Home() {
  return <Landing />;
}
