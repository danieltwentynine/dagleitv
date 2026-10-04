import type { ReactNode } from "react";

export const metadata = { title: "Daglei TV", description: "Private watch-together screen sharing" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0b0f", color: "#eee" }}>
        {children}
      </body>
    </html>
  );
}
