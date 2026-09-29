import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RevokeConsentRegistryModule", (m) => {
  const registry = m.contract("RevokeConsentRegistry");
  return { registry };
});
