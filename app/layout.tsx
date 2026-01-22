import "./globals.css";
import React from "react";

export const metadata = {
  title: "OG Minds — Dyeing Techniques Explorer",
  description: "Preview dyeing techniques on fabric images."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900">{children}</body>
    </html>
  );
}
