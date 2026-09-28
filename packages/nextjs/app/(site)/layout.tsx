import type { ReactNode } from "react";
import { Footer } from "~~/components/Footer";

/** The Proof Wall pages and the explorer: a page that scrolls, with the footer after it. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col">{children}</div>
      <Footer />
    </>
  );
}
