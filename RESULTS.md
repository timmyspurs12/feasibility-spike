# Technical Feasibility Spike Report

**Overall: PASS WITH CAVEAT.** The real DG SANTE read, response normalization, bounded copy judgment, validator consensus, and gated product-page text retrieval all ran on hosted Studionet. The verdict is `INCONCLUSIVE`, not legal approval.

## Environment

The workspace had no project repository or `.git`, GenLayer CLI/runtime, Docker, or Podman. Found: Python 3.13.14, Node.js 20.20.2, npm 10.8.2. For the spike only, `genlayer-test==0.29.2` and `genlayer-py==0.16.3` were installed in a temporary `/tmp` virtual environment. The live run used Hosted Studionet (`https://studio.genlayer.com/api`, chain ID 61999), with real validators and no mocks, fixtures, or backend substitution.

## Results

| Check | Status | Evidence |
|---|---|---|
| Hosted GenLayer execution path | PASS WITH CAVEAT | Temporary SDK/test tooling was needed; no local runtime was present. Contract deployment and writes ran on Studionet. |
| DG SANTE request, parse, and normalization | PASS | In-contract HTTP status 200; six matching rows normalized to one stable record; two unique EFSA references. Final transaction: `MAJORITY_AGREE`, one round. Tx `0x46f5d906465fa9140015d65618748c7b55e24994b43673b857531b8e1562bf38`. |
| Creator-copy evaluation | PASS WITH CAVEAT | “Folate plays a part in cell division.” was judged `MATCH` to the authorised claim. Overall bounded verdict: **`INCONCLUSIVE`**, reason `CONDITION_OF_USE_UNVERIFIED`; product composition/serving evidence was not verified. `not_legal_approval=true`. |
| Validator/equivalence execution | PASS WITH CAVEAT | DG SANTE transaction finalized with `MAJORITY_AGREE` in one round (3 agree; 2 idle after quorum). Product-page transaction finalized with `MAJORITY_AGREE` in two rounds (3 agree; 2 idle). One successful copy case is not a reliability study. Product tx `0x6fe15447d9d3bb675e578ad9c4a4ffc12e07796f47d676c00707075a66fad14f`. |
| Product-page text retrieval (run only after DG SANTE succeeded) | PASS WITH CAVEAT | In-contract rendered text was accessible (5,949 characters); simple checks found “folate”, “400 µg”, and “200% NRV”. This is seller-page extraction, not independent product verification. |
| First unadjusted live attempt | FAIL | The current runtime `Response` had no `status_code` property. The leader errored and consensus ended `UNDETERMINED`; the product page was not tested on that attempt. The temporary probe was corrected to use the exposed status/body and rerun successfully. |
| Bradbury testnet and escrow/payment/revision logic | NOT TESTED | This spike stayed on Studionet and deliberately did not build the app or settlement flow. |

## Critical findings

- Runtime/API docs did not match the live `Response` object (`status` rather than `status_code`); the first live transaction failed closed. A non-ASCII source string also exposed a local schema-generation limitation in the test SDK, so the temporary contract source was kept ASCII.
- DG SANTE repeats this claim across six rows. The probe deduplicated the stable claim fields; validator comparison intentionally excludes row counts and EFSA-reference multiplicity, so those should not drive settlement.
- The copy is a semantic match, but `CLEARED` is not defensible without evidence that the product meets the “at least a source of folate” condition. The tested seller page is not independent composition evidence.
- Consensus passed on the final transactions, but only one copy case was tested. LLM disagreement, changing source data, or runtime errors can still yield `UNDETERMINED`; do not make payout depend on an untested happy path.

## Files created

- `feasibility-spike/contracts/HealthClaimSpike.py` — temporary Intelligent Contract probe.
- `feasibility-spike/tests/test_live_spike.py` — live, no-mock Studionet integration test.
- `feasibility-spike/README.md` — scope and reproduction command.
- `feasibility-spike/RESULTS.md` — this report.

## Next action

Repeat this same no-mock one-claim integration test on Bradbury using a disposable funded testnet account.
