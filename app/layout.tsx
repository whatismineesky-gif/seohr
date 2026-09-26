import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "People OS | ระบบ HR แผนก SEO",
  description: "ระบบจัดการพนักงาน MEMBER การลาออก และข้อมูลเงินเดือนสำหรับแผนก SEO",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="antialiased">{children}</body>
    </html>
  );
}
