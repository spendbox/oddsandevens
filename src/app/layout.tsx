import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * `interactive-widget=resizes-content` is the half of the keyboard problem a
 * browser can solve for us.
 *
 * By default an on-screen keyboard overlays the page: the layout viewport does
 * not change, so `100svh` still means the whole screen and a dialog's pinned
 * footer ends up behind the keys. This asks the browser to resize the content
 * instead, which fixes it outright on Chrome for Android. Safari ignores it, so
 * `useKeyboardInset` in `ui/modal.tsx` handles the rest.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://spendbox.site"),
  title: "Spendbox — guess the password, open the safe",
  description:
    "Every spendbox is a password and a prize. Guess it, and the money is yours. Playing is free.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
