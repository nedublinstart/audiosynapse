import type { Metadata } from "next";
import { Literata, Source_Sans_3 } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const display = Literata({
  subsets: ["latin", "cyrillic"],
  variable: "--font-display",
});

const sans = Source_Sans_3({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Synapse — интеллектуальные конспекты",
  description:
    "Трансформируйте аудиолекции и материалы в методологически выверенные конспекты с ИИ-чатом.",
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
