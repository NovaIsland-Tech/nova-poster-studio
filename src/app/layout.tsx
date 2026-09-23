import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Nova · 灵感海报工作室",
  description: "从一张素材到一张好海报。Nova，邀请制 AI 海报创作工作台。",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
