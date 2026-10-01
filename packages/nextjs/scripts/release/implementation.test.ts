import { implementationFromDeployments } from "./implementation";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("implementationFromDeployments", () => {
  let dir: string;
  const record = (file: string, body: unknown) => writeFileSync(join(dir, file), JSON.stringify(body));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "deployments-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the implementation behind a proxy, not the proxy", () => {
    record("AcmeVault.json", { address: "0xproxy" });
    record("AcmeVault_Implementation.json", { address: "0xv1" });
    expect(implementationFromDeployments("AcmeVault", dir)).toBe("0xv1");
  });

  it("reads a contract deployed on its own under its name", () => {
    record("AcmeVault_Implementation.json", { address: "0xv1" });
    record("AcmeVaultV2.json", { address: "0xv2" });
    expect(implementationFromDeployments("AcmeVaultV2", dir)).toBe("0xv2");
  });

  it("names both files it looked for when neither exists", () => {
    expect(() => implementationFromDeployments("AcmeVaultV3", dir)).toThrow(
      /AcmeVaultV3_Implementation\.json and .*AcmeVaultV3\.json/,
    );
  });

  it("refuses a record without an address", () => {
    record("AcmeVaultV2.json", {});
    expect(() => implementationFromDeployments("AcmeVaultV2", dir)).toThrow(/carries no address/);
  });
});
