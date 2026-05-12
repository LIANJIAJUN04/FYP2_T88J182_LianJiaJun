import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediSync Bedside",
  description: "Real-time patient health monitoring — bedside station",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased" style={{ background: "#131315", color: "#e4e2e4" }}>
        {children}
      </body>
    </html>
  );
}
