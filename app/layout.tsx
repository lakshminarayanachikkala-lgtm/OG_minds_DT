import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OG Minds — Dyeing Techniques Explorer",
  description: "Preview dyeing techniques on fabric images."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
