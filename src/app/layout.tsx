import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./workspace.css";
export const metadata: Metadata = { title: "CINEVA — Films Streaming", description: "Premium Streaming from Kigali, Rwanda." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
