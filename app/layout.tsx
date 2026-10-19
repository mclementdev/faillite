import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import "./globals.css";

const titre = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-titre", display: "swap" });
const texte = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-texte", display: "swap" });

export const metadata: Metadata = {
  title: "À vous l'Élysée !",
  description: "Un jeu de soirée : faites campagne, gouvernez la France ensemble et découvrez l'impact réel de vos décisions.",
};

export const viewport: Viewport = {
  themeColor: "#15131C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${titre.variable} ${texte.variable}`}>
      <body>{children}</body>
    </html>
  );
}
