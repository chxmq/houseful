import type { Metadata, Viewport } from "next";
import { Big_Shoulders, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  axes: ["opsz"],
});

const sans = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Houseful: tickets for people, not bots",
    template: "%s | Houseful",
  },
  description:
    "Find what is on in your city. Every ticket belongs to one verified person, sells at face value, and goes back to the waitlist if you cannot make it.",
  applicationName: "Houseful",
};

export const viewport: Viewport = {
  themeColor: "#f1ece2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="grain flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
