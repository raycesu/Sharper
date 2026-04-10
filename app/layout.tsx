import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sharper",
  description: "Crypto strategy backtester",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0d0d14]">
        <header className="border-b border-white/[0.07] px-6 py-3 flex items-center gap-8">
          <Link href="/" className="text-[#a89cf7] font-semibold tracking-tight text-base">
            Sharper
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/" className="text-white/40 hover:text-white transition-colors">
              Home
            </Link>
            <Link href="/backtest" className="text-white/40 hover:text-white transition-colors">
              Backtester
            </Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
