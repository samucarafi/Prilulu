import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prilulu Festas | Pegue e monte",
  description: "Sua festa linda, leve e do seu jeitinho. Kits pegue e monte com carinho.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
