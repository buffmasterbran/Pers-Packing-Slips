import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Packing Slips - Personalized Orders",
  description: "Filter and print packing slips for personalized orders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

