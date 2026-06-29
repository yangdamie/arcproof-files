# ArcProof Escrow Contract

This is a compact escrow contract for **digital-service agreements**. It implements a clear lifecycle:

```text
Open → Funded → Delivered → Completed
                   ↘ Disputed → Resolved
Funded + expiry → Refunded
```

## Contract roles

- **Client** — creates a job, funds USDC, and can approve a completed delivery.
- **Provider** — submits a `bytes32` hash of the delivery reference.
- **Evaluator** — optional second address that can approve a delivery.
- **Arbiter** — resolves disputes by splitting escrow using basis points.

## Deploy to Arc Testnet

1. Install Foundry.
2. In `contracts/`, run:

```bash
forge install foundry-rs/forge-std --no-commit
cp .env.example .env
```

3. Fill in `PRIVATE_KEY` with a **dedicated Arc Testnet** wallet that has faucet USDC.
4. Deploy:

```bash
source .env
forge script script/DeployArcProof.s.sol:DeployArcProof \
  --rpc-url arc_testnet \
  --broadcast \
  --private-key "$PRIVATE_KEY"
```

5. Copy the deployed `ArcProofEscrow` address to the web app root `.env` file:

```env
VITE_ARCPROOF_ESCROW_ADDRESS=0xYourDeployedContract
```

6. Restart the Vite server.

## Security notes

- This code is a prototype, **not an audited production contract**.
- Use testnet USDC only.
- The provider and evaluator are fixed at creation. The arbiter is fixed at deployment.
- Evidence itself should be stored privately or on a content-addressed network; this contract stores only a hash.
- The Arc USDC ERC-20 interface uses 6 decimals. Do not mix it with Arc native gas units.
