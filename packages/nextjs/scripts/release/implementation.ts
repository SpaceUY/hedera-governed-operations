import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The address `hardhat-deploy` recorded for the code a release vouches for. A proxied contract
 * (`AcmeVault`) keeps it under `<contract>_Implementation`, next to the proxy's own record; a
 * contract deployed on its own (`AcmeVaultV2`, the implementation an upgrade points the proxy at)
 * is recorded under its name. The implementation record wins, since the proxy's address is never
 * what an upgrade proposal names.
 */
export function implementationFromDeployments(contract: string, deploymentsDir: string): string {
  const candidates = [`${contract}_Implementation.json`, `${contract}.json`].map(file => resolve(deploymentsDir, file));
  const path = candidates.find(candidate => existsSync(candidate));
  if (!path) {
    throw new Error(
      `No deployment of ${contract} in ${deploymentsDir} (looked for ${candidates.join(" and ")}). ` +
        "Pass --implementation, or deploy first with yarn hardhat:deploy.",
    );
  }

  try {
    const record = JSON.parse(readFileSync(path, "utf8")) as { address?: string };
    if (!record.address) throw new Error("the record carries no address");
    return record.address;
  } catch (error) {
    throw new Error(
      `Could not read the implementation address for ${contract} from ${path} (${(error as Error).message}). ` +
        "Pass --implementation, or deploy first with yarn hardhat:deploy.",
    );
  }
}
