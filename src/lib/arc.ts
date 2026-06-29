import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hash,
} from "viem";
import { arcProofEscrowAbi, usdcAbi } from "./abi";

export const ARC_USDC: Address = "0x3600000000000000000000000000000000000000";
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";
export const USDC_DECIMALS = 6;

export const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
  blockExplorers: { default: { name: "Arcscan", url: ARC_EXPLORER_URL } },
  testnet: true,
});

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });

export const configuredEscrowAddress = (import.meta.env.VITE_ARCPROOF_ESCROW_ADDRESS || "") as Address;

function getProvider() {
  const provider = (window as Window & { ethereum?: unknown }).ethereum;
  if (!provider) throw new Error("No injected wallet found. Install MetaMask, Rabby, or Coinbase Wallet.");
  return provider as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
}

export async function connectArcWallet(): Promise<Address> {
  const provider = getProvider();
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const account = accounts[0] as Address | undefined;
  if (!account) throw new Error("Wallet did not return an account.");

  const wantedChainHex = `0x${arcTestnet.id.toString(16)}`;
  const currentChainHex = (await provider.request({ method: "eth_chainId" })) as string;
  if (currentChainHex.toLowerCase() !== wantedChainHex.toLowerCase()) {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: wantedChainHex }] });
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: wantedChainHex,
            chainName: "Arc Testnet",
            rpcUrls: [ARC_RPC_URL],
            blockExplorerUrls: [ARC_EXPLORER_URL],
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          },
        ],
      });
    }
  }
  return account;
}

async function walletClient() {
  const provider = getProvider();
  const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
  const account = accounts[0] as Address | undefined;
  if (!account) throw new Error("Connect your wallet before submitting a transaction.");
  return createWalletClient({ account, chain: arcTestnet, transport: custom(provider) });
}

function requireEscrow(): Address {
  if (!configuredEscrowAddress || configuredEscrowAddress.length !== 42) {
    throw new Error("No escrow contract is configured. Add VITE_ARCPROOF_ESCROW_ADDRESS to .env after deployment.");
  }
  return configuredEscrowAddress;
}

export const shortAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Not connected";

export const toChainHash = (value: string): Hash => keccak256(toHex(value));

export async function readUsdcBalance(address: Address): Promise<string> {
  const raw = await publicClient.readContract({
    address: ARC_USDC,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(formatUnits(raw, USDC_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

async function waitFor(hash: Hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

export async function createOnchainJob(input: {
  provider: Address;
  evaluator: Address;
  amount: string;
  deadline: Date;
  description: string;
}) {
  const client = await walletClient();
  const escrow = requireEscrow();
  const hash = await client.writeContract({
    address: escrow,
    abi: arcProofEscrowAbi,
    functionName: "createJob",
    args: [
      input.provider,
      input.evaluator,
      parseUnits(input.amount, USDC_DECIMALS),
      BigInt(Math.floor(input.deadline.getTime() / 1000)),
      toChainHash(input.description),
    ],
  });
  await waitFor(hash);
  return hash;
}

export async function fundOnchainJob(jobId: number, amount: string) {
  const client = await walletClient();
  const escrow = requireEscrow();
  const amountRaw = parseUnits(amount, USDC_DECIMALS);
  const approvalHash = await client.writeContract({
    address: ARC_USDC,
    abi: usdcAbi,
    functionName: "approve",
    args: [escrow, amountRaw],
  });
  await waitFor(approvalHash);
  const fundHash = await client.writeContract({
    address: escrow,
    abi: arcProofEscrowAbi,
    functionName: "fundJob",
    args: [BigInt(jobId)],
  });
  await waitFor(fundHash);
  return { approvalHash, fundHash };
}

export async function submitOnchainDeliverable(jobId: number, deliverable: string) {
  const client = await walletClient();
  const escrow = requireEscrow();
  const hash = await client.writeContract({
    address: escrow,
    abi: arcProofEscrowAbi,
    functionName: "submitDeliverable",
    args: [BigInt(jobId), toChainHash(deliverable)],
  });
  await waitFor(hash);
  return hash;
}

export async function completeOnchainJob(jobId: number) {
  const client = await walletClient();
  const escrow = requireEscrow();
  const hash = await client.writeContract({
    address: escrow,
    abi: arcProofEscrowAbi,
    functionName: "completeJob",
    args: [BigInt(jobId)],
  });
  await waitFor(hash);
  return hash;
}

export async function disputeOnchainJob(jobId: number) {
  const client = await walletClient();
  const escrow = requireEscrow();
  const hash = await client.writeContract({
    address: escrow,
    abi: arcProofEscrowAbi,
    functionName: "openDispute",
    args: [BigInt(jobId)],
  });
  await waitFor(hash);
  return hash;
}
