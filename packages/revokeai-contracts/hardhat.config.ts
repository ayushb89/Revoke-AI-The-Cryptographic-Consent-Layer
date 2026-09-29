import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// MST Testnet — from the ethereum-lists chain registry (eip155-91562037).
// Explorer: https://testnet.mstscan.com · Faucet: https://faucet.mstblockchain.com
const MST_TESTNET_CHAIN_ID = 91562037;
const MST_TESTNET_RPC_URL = process.env.MST_TESTNET_RPC_URL ?? "https://testnetrpc.mstblockchain.com";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.28",
    // MST Testnet verified to execute Cancun opcodes (PUSH0, MCOPY, TSTORE).
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    mstTestnet: {
      type: "http",
      chainType: "l1",
      chainId: MST_TESTNET_CHAIN_ID,
      url: MST_TESTNET_RPC_URL,
      // Resolved at deploy time from the encrypted Hardhat keystore
      // (`npx hardhat keystore set MST_DEPLOYER_PRIVATE_KEY`) or the env var
      // of the same name. Never written to this file.
      accounts: [configVariable("MST_DEPLOYER_PRIVATE_KEY")],
    },
  },
});
