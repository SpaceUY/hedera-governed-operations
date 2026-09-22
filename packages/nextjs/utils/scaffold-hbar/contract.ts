import { Abi, Address } from "viem";
import deployedContractsData from "~~/contracts/deployedContracts";

export type GenericContract = {
  address: Address;
  abi: Abi;
  inheritedFunctions?: Record<string, string>;
  external?: true;
  deployedOnBlock?: number;
  /** Native `0.0.x` id, recorded by the Hedera deploys: a token key or a scheduled call needs it. */
  hederaContractId?: string;
};

export type GenericContractsDeclaration = {
  [chainId: number]: {
    [contractName: string]: GenericContract;
  };
};

export const contracts = deployedContractsData as GenericContractsDeclaration | null;
