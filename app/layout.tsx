import type { Metadata, Viewport } from "next";

import { APP_NAME } from "@shared/constants";
import "@shared/styles/global.scss";

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "A private operating system for your work. Every answer links to the source it came from.",
};

export const viewport: Viewport = {
  themeColor: "#f6f7f8",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f%5B%5D=general-sans@400,500,600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
