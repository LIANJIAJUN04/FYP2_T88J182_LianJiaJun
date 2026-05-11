import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediSync Admin",
  description: "Cloud-based patient monitoring — admin portal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ background: "#060d1a", color: "#f0f6ff" }}>
        {children}
      </body>
    </html>
  );
}
