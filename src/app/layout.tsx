import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["500"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Leash",
  description: "An AI agent that runs your PayPal money tasks within rules you set.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${hankenGrotesk.variable} ${newsreader.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[var(--color-page)] text-[var(--color-ink)] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
