# EU Health-Claim Campaign Escrow — Studionet build

A testnet-only single-campaign Intelligent Contract for one creator, one brand, one fixed EU health claim (`POL-HC-6377`), one fixed public seller product page, text-only copy, and at most one revision. The responsive evidence-workspace frontend is in `frontend/`; escrow, live evidence retrieval, bounded decision, and settlement remain inside the IC. There is no off-chain adjudication backend.

See [`CAMPAIGN.md`](CAMPAIGN.md) for the state machine, rubric, limitations, security notes, and exact test commands. The required disclaimer is: **This application is an evidence-based campaign settlement mechanism, not legal advice or legal certification.**

## Project files

- `contracts/HealthClaimCampaignEscrow.py` — campaign, funding, evidence review, deadlines, revision, payout/refund, and compact evidence metadata.
- `tests/test_live_campaign.py` — no-mock end-to-end Studionet tests using real Web Access, GenLayer semantic evaluation/validators, and finalized external value-transfer children.
- `tests/test_campaign_direct.py` — clearly marked synthetic Direct Mode tests for branch logic and validator comparison; these are not live-evidence or payment proofs.
- `requirements-test.txt` — pinned test tooling (`genlayer-test==0.29.2`, `genlayer-py==0.16.3`, `pytest==9.1.1`).
- `IMPLEMENTATION_REPORT.md` — as-built test and deployment report.
- `frontend/` — responsive React/Vite workspace for live Studionet reads, wallet-gated IC actions, evidence/consensus display, transaction receipts, and campaign creation/open-by-address.

## Frontend quick start

```sh
cd frontend
npm install
npm run dev
```

The production check is `npm run build`. The frontend uses the official `genlayer-js` client and reads public finalized contract state without a wallet; a wallet on Studionet (chain 61999) is required for writes. No production deployment URL is configured.

## Quick start

From this directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-test.txt

gltest --network studionet --contracts-dir contracts \
  --artifacts-dir /tmp/eu-health-claim-escrow-artifacts \
  tests/test_live_campaign.py -v -s

python -m pytest tests/test_campaign_direct.py -v
```

The live suite uses 0.001 GEN per campaign, creates temporary Studionet contracts, waits for finalized child transfers, and may take several minutes. Direct Mode uses synthetic source/page/LLM fixtures; it does not prove consensus or settlement. First-run Direct Mode may download its runner artifact.

## Preserved feasibility spike

The original proven probe remains alongside the escrow implementation and was not rewritten:

- `contracts/HealthClaimSpike.py` — the original DG SANTE retrieval/normalization, GenLayer prompt, validator comparison, and product-page retrieval path.
- `tests/test_live_spike.py` — the original no-mock Studionet probe. It requests the product page only after the live DG SANTE result has been parsed and normalized successfully.
- `RESULTS.md` — the recorded original live result.

To rerun only that earlier probe:

```sh
gltest --network studionet --contracts-dir contracts \
  --artifacts-dir /tmp/genlayer-feasibility-artifacts \
  tests/test_live_spike.py -v -s
```
