import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";

export const metadata: Metadata = {
  title: "Whizzkids Academic Center",
  description: "Playgroup, Reading Programs and Academic Tutorials — online and face-to-face.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
