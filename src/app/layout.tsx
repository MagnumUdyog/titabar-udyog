import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Titabor Udyog - Inventory & Orders",
  description: "Multi-branch inventory and order management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
