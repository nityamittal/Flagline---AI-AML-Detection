import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flagline",
  description: "Review rule-flagged transactions from a synthetic AML dataset.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <div className="bg-muted text-muted-foreground border-b px-4 py-1.5 text-center text-xs">
          Demo mode: synthetic IBM AML data. Your decisions are only visible to you.
        </div>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="text-muted-foreground border-t px-4 py-3 text-xs">
          Data: Altman et al., &ldquo;Realistic Synthetic Financial Transactions for Anti-Money
          Laundering Models&rdquo;, NeurIPS 2023.
        </footer>
      </body>
    </html>
  );
}
