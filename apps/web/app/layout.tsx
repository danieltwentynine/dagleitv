import type { ReactNode } from "react";
import "./globals.css";

// Runs before first paint: apply a saved theme. Night is the product default;
// an older "light" choice maps to paper.
const themeScript = `(function(){try{var t=localStorage.getItem("dagleitv.theme");if(t==="paper"||t==="light")document.documentElement.setAttribute("data-theme","paper")}catch(e){}})()`;

export const metadata = {
  title: "Daglei TV",
  description: "Private watch-together screen sharing",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="night" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
