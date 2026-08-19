import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { AuthTokenSync } from "@/components/auth-token-sync";
import { NativeShareBridge } from "@/components/native-share-bridge";
import { RegisterServiceWorker } from "@/components/register-sw";
import "./globals.css";

const fontSerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const fontSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Reelish — Save a viral recipe. Make it fit you.",
  description:
    "Turn social media recipes into personalized meals for your diet and goals.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Reelish",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1A1614",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* suppressHydrationWarning on <html>: extensions may inject attrs (e.g. data-phia-extension-fonts-loaded). */
  return (
    <html lang="en" className={`dark ${fontSerif.variable} ${fontSans.variable}`} suppressHydrationWarning>
      <body className="font-sans min-h-screen">
        <NativeShareBridge />
        <AuthTokenSync />
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
