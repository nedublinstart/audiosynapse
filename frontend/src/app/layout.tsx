import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Onest } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const display = Source_Serif_4({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
  style: ["normal", "italic"],
});

const sans = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Synapse — конспекты без шума",
  description:
    "Аудиолекции и материалы превращаются в спокойные, методологически выверенные конспекты.",
  appleWebApp: {
    capable: true,
    title: "Synapse",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ece8e1" },
    { media: "(prefers-color-scheme: dark)", color: "#121410" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark" suppressHydrationWarning>
      <body className={`${display.variable} ${sans.variable} antialiased`}>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
