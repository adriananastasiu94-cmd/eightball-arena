import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eightball Arena",
  description: "Original realtime 8-ball multiplayer for web"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}