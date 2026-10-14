import type { Metadata } from "next";
import "./globals.css";
import { LangProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Grandmaster Gambit — Uno Chess",
  description: "Chess where every turn is decided by an Uno card",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script
          // Applies the saved colour mode before first paint to avoid a flash of the wrong theme.
          dangerouslySetInnerHTML={{
            __html: `try{var p=JSON.parse(localStorage.getItem("uno-chess:profile")||"{}");var m=p.mode||"system";if(m==="system")m=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.mode=m}catch(e){}`,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;1,700&display=swap"
        />
      </head>
      <body><LangProvider>{children}</LangProvider></body>
    </html>
  );
}
