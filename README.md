# ArcProof — Digital Service Delivery Escrow

ArcProof is a polished frontend and Solidity prototype for digital-service escrow on **Arc Testnet**. It gives a client and provider a clear lifecycle:

```text
Create agreement → approve USDC → fund escrow → submit delivery proof → approve → release USDC
```

It includes a dispute state and an arbiter-controlled split settlement.

> **Safety status:** This repository is a prototype. It is not audited and must not be used with real funds.

## What is included

- React + TypeScript + Vite dashboard
- Wallet connection and Arc Testnet network switching
- Demo mode that works without a deployed contract
- Live mode using a deployed `ArcProofEscrow` contract
- USDC approval and funding flow
- Deliverable proof hashing via `keccak256`
- Client/evaluator release and arbiter dispute resolution
- Foundry deployment script for Arc Testnet

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Open the local address printed by Vite, usually `http://127.0.0.1:5173`.

Without `VITE_ARCPROOF_ESCROW_ADDRESS`, the application operates in **Demo mode**. It stores workflow data in your browser's local storage and does not send a wallet transaction.

## Enable Arc Testnet settlement

1. Deploy the contract from [`contracts/README.md`](./contracts/README.md).
2. Add your deployed contract to the root `.env`:

```env
VITE_ARCPROOF_ESCROW_ADDRESS=0xYourDeployedContract
```

3. Restart `npm run dev`.
4. Click **Connect wallet**. The app requests Arc Testnet:

```text
Network: Arc Testnet
Chain ID: 5042002
RPC: https://rpc.testnet.arc.network
Explorer: https://testnet.arcscan.app
Gas token: USDC
```

## Workflow and permissions

| Action | Who can call it |
|---|---|
| Create job | Client |
| Approve + fund USDC | Client |
| Submit delivery hash | Provider |
| Release payment | Client or evaluator |
| Open dispute | Client or provider |
| Resolve dispute | Arbiter set at deployment |
| Refund expired funded job | Client |

## Important Arc USDC note

Arc's optional ERC-20 USDC interface is used for `approve`, `transferFrom`, and balance reads. It uses **6 decimals**. Arc's native USDC gas token uses **18 decimals**. This project deliberately uses the ERC-20 interface for all escrow amounts.

## Suggested next upgrades

- Replace manual `provider` input with a public provider profile and reputation layer.
- Add IPFS / encrypted evidence upload.
- Add transaction event indexing with a backend and database.
- Add a multi-arbiter or UMA/optimistic-dispute module.
- Add milestones instead of a single release.
- Add ERC-8004 agent identity for AI providers.
