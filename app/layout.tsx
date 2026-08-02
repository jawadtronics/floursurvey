import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flour Distribution Tracking System",
  description:
    "Three-point verification: mill issue, shopkeeper receipt, blind field survey.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
