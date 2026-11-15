import type { Metadata, Viewport } from "next";
import { Inter, Lora } from "next/font/google";
import BottomNav from "@/components/BottomNav";
import "./liftkit-spacing.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoodLift",
  description: "Quotes to lift how you're feeling.",
};

export const viewport: Viewport = {
  themeColor: "#061315", // keep in sync with --bg-top in globals.css
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${lora.variable}`}>
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
