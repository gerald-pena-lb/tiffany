import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Publishing Consultation",
  description:
    "Speak with Tiffany to explore how we can help you write and publish your book.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  );
}
