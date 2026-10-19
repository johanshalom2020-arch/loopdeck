import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loopdeck — loop YouTube & local media",
  description:
    "A media player for looping YouTube videos, playlists and local files: A–B segment loops, speed control, volume boost, Picture-in-Picture and keyboard shortcuts.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0d" },
  ],
};

/**
 * Applies the persisted theme before first paint to avoid a flash of the
 * wrong color scheme. Mirrors the Zustand persist storage shape.
 */
const themeInitScript = `(function(){try{var raw=localStorage.getItem("loopdeck:settings");var state=raw?JSON.parse(raw).state||{}:{};var t=state.theme||"system";var dark=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var root=document.documentElement;root.classList.toggle("dark",dark);root.style.colorScheme=dark?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
