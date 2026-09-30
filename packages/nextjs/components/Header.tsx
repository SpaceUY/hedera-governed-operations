"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { MirrorPollStatus } from "~~/components/MirrorPollStatus";
import { SwitchTheme } from "~~/components/SwitchTheme";
import { WalletConnectButton } from "~~/components/scaffold-hbar";
import { GOVERNANCE_ROUTES } from "~~/config/governanceConfig";
import { useOutsideClick, useTargetNetwork } from "~~/hooks/scaffold-hbar";

type HeaderMenuLink = {
  label: string;
  href: string;
};

export const menuLinks: HeaderMenuLink[] = [
  { label: "Live map", href: GOVERNANCE_ROUTES.home },
  { label: "Settings", href: GOVERNANCE_ROUTES.settings },
];

/** The live map owns `/` and every `/governance/…` route, so its link stays lit on a proposal or the wizard. */
export function isMenuLinkActive(href: string, pathname: string): boolean {
  if (href === GOVERNANCE_ROUTES.home) return pathname === href || pathname.startsWith("/governance/");
  return pathname === href;
}

export const HeaderMenuLinks = () => {
  const pathname = usePathname();

  return (
    <>
      {menuLinks.map(({ label, href }) => {
        const isActive = isMenuLinkActive(href, pathname);
        return (
          <li key={href}>
            <Link
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`${
                isActive ? "bg-hedera-smoke/15 text-base-content" : "text-base-content/60 hover:text-base-content"
              } rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </>
  );
};

/** The hashgraph glyph beside the product name: a circle around two rails and two ties. */
const BrandMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6 shrink-0 fill-none stroke-hedera-ultraviolet stroke-2">
    <circle cx="12" cy="12" r="9" />
    <path d="M7 9.5h10M7 14.5h10M9.5 6v12M14.5 6v12" />
  </svg>
);

/**
 * Site header
 */
export const Header = () => {
  const { targetNetwork } = useTargetNetwork();
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });

  return (
    <div className="sticky lg:static top-0 navbar h-16 min-h-0 py-0 bg-base-100/95 backdrop-blur shrink-0 justify-between z-20 border-b border-base-300 px-1 sm:px-2 lg:px-6">
      <div className="navbar-start w-auto lg:w-1/2 gap-1 lg:gap-7">
        <details className="dropdown lg:hidden" ref={burgerMenuRef}>
          <summary className="btn btn-ghost hover:bg-transparent">
            <Bars3Icon className="h-1/2" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-3 p-2 shadow-sm bg-base-100 rounded-box w-52"
            onClick={() => {
              burgerMenuRef?.current?.removeAttribute("open");
            }}
          >
            <HeaderMenuLinks />
          </ul>
        </details>
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-full text-base font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <BrandMark />
          <span className="sr-only sm:not-sr-only">Governed Operations</span>
        </Link>
        <ul className="hidden lg:flex items-center gap-1">
          <HeaderMenuLinks />
        </ul>
      </div>
      <div className="navbar-end grow mr-2 gap-3 lg:mr-0">
        <div className="hidden md:flex">
          <MirrorPollStatus />
        </div>
        <span className="hidden sm:inline-flex items-center rounded-full border border-base-content/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-base-content/60">
          {targetNetwork.name}
        </span>
        <SwitchTheme />
        <WalletConnectButton />
      </div>
    </div>
  );
};
