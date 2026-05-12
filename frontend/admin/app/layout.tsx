import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MediSync Admin",
  description: "Cloud-based patient monitoring — admin portal",
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
