/**
 * Deploy RevokeConsentRegistry with explicit EIP-1559 fees.
 *
 * Why not Ignition on MST: MST Testnet blocks report baseFeePerGas = 0, which
 * Ignition treats as a zero-fee chain and sends a 0 priority fee — but MST
 * nodes reject any tip below 1 gwei. Here we take the node's suggested tip
 * (eth_maxPriorityFeePerGas) and never go below MIN_PRIORITY_FEE.
 *
 *   npx hardhat run scripts/deploy.ts --network mstTestnet
 */
import { mkdir, writeFile } from "node:fs/promises";

import { network } from "hardhat";
import { formatEther, formatGwei, parseGwei } from "viem";

const MIN_PRIORITY_FEE = parseGwei("1");
const EXPLORERS: Record<number, string> = { 91562037: "https://testnet.mstscan.com" };

const { viem, networkName } = await network.getOrCreate();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const chainId = await publicClient.getChainId();
const block = await publicClient.getBlock();
const suggestedTip = await publicClient.estimateMaxPriorityFeePerGas();
const maxPriorityFeePerGas = suggestedTip > MIN_PRIORITY_FEE ? suggestedTip : MIN_PRIORITY_FEE;
const maxFeePerGas = (block.baseFeePerGas ?? 0n) * 2n + maxPriorityFeePerGas;

const balance = await publicClient.getBalance({ address: deployer.account.address });
console.log(`network   ${networkName} (chain ${chainId})`);
console.log(`deployer  ${deployer.account.address}  balance ${formatEther(balance)}`);
console.log(`fees      tip ${formatGwei(maxPriorityFeePerGas)} gwei, max ${formatGwei(maxFeePerGas)} gwei`);

const registry = await viem.deployContract("RevokeConsentRegistry", [], {
  maxPriorityFeePerGas,
  maxFeePerGas,
});

// Sanity check: the deployed code answers the gatekeeper's view call.
const probe = await registry.read.checkScopeAccess([`0x${"00".repeat(32)}`, `0x${"00".repeat(32)}`]);
if (probe !== false) throw new Error("unexpected checkScopeAccess result on fresh registry");

const record = {
  contract: "RevokeConsentRegistry",
  address: registry.address,
  chainId,
  network: networkName,
  deployer: deployer.account.address,
  deployedAtBlock: Number(await publicClient.getBlockNumber()),
  deployedAt: new Date().toISOString(),
};
console.log(`deployed  ${registry.address}`);
if (EXPLORERS[chainId]) console.log(`explorer  ${EXPLORERS[chainId]}/address/${registry.address}`);

await mkdir("deployments", { recursive: true });
await writeFile(`deployments/${chainId}.json`, JSON.stringify(record, null, 2) + "\n");
console.log(`saved     deployments/${chainId}.json`);
