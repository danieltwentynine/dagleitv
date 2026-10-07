import type { ReactNode } from "react";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// Runs before first paint: apply a saved theme choice (else CSS follows the system).
const themeScript = `(function(){try{var t=localStorage.getItem("dagleitv.theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = { title: "Daglei TV", description: "Private watch-together screen sharing" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
