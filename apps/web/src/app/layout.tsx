import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://houseful.ticket"),
  title: {
    default: "Houseful: tickets for people, not bots",
    template: "%s · Houseful",
  },
  description:
    "Find what is on in your city. Every ticket belongs to one verified person, sells at face value, and goes back to the waitlist if you cannot make it.",
  applicationName: "Houseful",
  openGraph: {
    type: "website",
    siteName: "Houseful",
    title: "Houseful: tickets for people, not bots",
    description:
      "Face-value tickets bound to one verified person. Hand them back to the waitlist if you cannot make it.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Houseful",
    description: "Tickets for people, not bots.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f1ece2",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-IN" className={`${sans.variable} ${mono.variable}`}>
      <head>
        {/* Loaded outside next/font: Big Shoulders has no size-adjust metrics and
            Turbopack printed that warning on every request. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders:opsz,wght@10..72,100..900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="grain flex min-h-dvh flex-col">{children}</body>
    </html>
  );
}
