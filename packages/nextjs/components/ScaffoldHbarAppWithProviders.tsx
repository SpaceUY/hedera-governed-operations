"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProgressBar as ProgressBar } from "next-nprogress-bar";
import { Toaster } from "react-hot-toast";
import { WagmiProvider } from "wagmi";
import { Header } from "~~/components/Header";
import { BurnerSignerProvider } from "~~/services/web3/BurnerSignerProvider";
import { NativeTransactionSignerBridge } from "~~/services/web3/NativeTransactionSignerBridge";
import { HederaWalletConnectProvider } from "~~/services/web3/hederaWalletConnect";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";

const ScaffoldHbarApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <Header />
        <main className="relative flex flex-col flex-1 min-h-0">{children}</main>
      </div>
      <Toaster />
    </>
  );
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * No wallet goes through wagmi (HashPack signs over WalletConnect), but `@scaffold-hbar-ui` needs its
 * provider: `HbarInput`'s price lookup calls wagmi's `usePublicClient`, which throws without one.
 */
export const ScaffoldHbarAppWithProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <HederaWalletConnectProvider>
          <BurnerSignerProvider>
            <NativeTransactionSignerBridge>
              <ProgressBar height="3px" color="#2299dd" />
              <ScaffoldHbarApp>{children}</ScaffoldHbarApp>
            </NativeTransactionSignerBridge>
          </BurnerSignerProvider>
        </HederaWalletConnectProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
