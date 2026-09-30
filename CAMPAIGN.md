# Campaign contract: scope and operation

## Product boundary

This build is a **Studionet-only, single-campaign** Intelligent Contract. Each deployment permits one brand, one named creator, one claim (`POL-HC-6377`), one fixed public product page, plain-text copy up to 2,000 characters, and at most one revision. The chain-ID guard rejects deployment outside Studionet chain ID `61999`.

The IC itself performs the trust-critical work: campaign state and access control, exact-value GEN funding, live DG SANTE retrieval and normalization, semantic evaluation through GenLayer, validator comparison, evidence storage, deadline enforcement, and settlement. There is no frontend or separate backend adjudicator.

**This application is an evidence-based campaign settlement mechanism, not legal advice or legal certification.**

## Why GenLayer is in the trust path

The decision combines live off-chain evidence (the official claim register and the named seller's product page) with interpretation of untrusted advertising copy. If a conventional server fetched those sources and selected a verdict, the parties would have to trust that server operator to retrieve the right pages and apply the agreed rubric. Here the IC makes the requests and computes the bounded result in a GenLayer nondeterministic workflow; validators re-run the retrieval/evaluation path and compare stable structured fields before the contract advances escrow. Deterministic state checks then enforce the participants, deadline, revision limit, and settlement. The GenLayer workflow is not a legal authority and cannot make the underlying seller evidence independent or complete.

## Fixed evidence and decision rubric

1. The IC performs the proven spike's real `gl.nondet.web.get` request to the DG SANTE v2.0 details endpoint for `POL-HC-6377`.
2. It normalizes the stable claim fields and deduplicates repeated rows. More than one distinct normalized record, missing/malformed data, unavailable source, or unknown claim status fails closed.
3. If the live record is `Authorised` and complete, the IC calls `gl.nondet.exec_prompt`. The submitted copy is JSON-encoded as untrusted data; the fixed prompt asks only for `MATCH`, `OVERCLAIM`, or `UNCLEAR`. Copy text cannot set policy, participants, claim/product, state, or settlement.
4. Only a `MATCH` causes the IC to render the fixed VitaminExpress product page through `gl.nondet.web.render`. Page prose is not passed to the LLM. A small, code-defined extraction checks for the seller page's folate, 400 µg, and 200% NRV markers.
5. `CLEARED` requires all of: one unconflicted live authorised record, semantic `MATCH`, and all three product-page markers. An `OVERCLAIM` or explicitly non-authorised claim is `FLAGGED`. Missing, conflicting, unavailable, incomplete, or semantically unclear evidence is `INCONCLUSIVE`.
6. `gl.vm.run_nondet_unsafe` re-runs the retrieval/evaluation path for validators and compares stable source fields, evidence digests, semantic enum, condition status, verdict, and reason code. Counts, rendered text length, and EFSA-reference multiplicity are observability only. A consensus failure/undetermined transaction does not advance escrow state; the contract remains reviewable/refundable only through its timeout rules.

The product markers are only **declared seller-page evidence**. They are not an assay, independent verification, or a determination that every legal condition is met. `SUPPORTED` means only that the narrow, pre-agreed campaign rubric found those markers. The official dataset/register is informational and may be incomplete or stale.

## State and methods

| Current state | Method / condition | Resulting state or action |
|---|---|---|
| `DRAFT` (before configuration) | Brand calls `create_campaign(creator_address, reward_wei, submission_window_seconds)` once | `DRAFT` with fixed claim/product and immutable campaign terms |
| `DRAFT` | Brand calls payable `fund_campaign` with exactly `reward_wei` before the submission deadline | `FUNDED` |
| Any `DRAFT` funding attempt with wrong caller, amount, state, or expired funding window | Attached value is **explicitly sent back** to its sender; campaign remains unchanged | No campaign funding; transfer child must finalize |
| `FUNDED` | Named creator submits non-empty copy within the submission window | `SUBMITTED` |
| `SUBMITTED` | Brand or creator calls `begin_review` | `REVIEWING` |
| `REVIEWING` | `review_campaign` obtains a consensus-backed `CLEARED` result | `PAID`; exact escrow reward is sent to creator |
| `REVIEWING` | `review_campaign` returns `FLAGGED` and no revision has been used | `REVISION_ALLOWED`; no payment |
| `REVISION_ALLOWED` | Named creator resubmits once before the submission deadline | `SUBMITTED`, `revision_count = 1` |
| `REVIEWING` | `review_campaign` returns `FLAGGED` after the single revision | `REFUNDED`; escrow is returned to brand |
| `REVIEWING` | `review_campaign` returns `INCONCLUSIVE` | `INCONCLUSIVE`; no payment, funds remain escrowed until timeout |
| `FUNDED` or `REVISION_ALLOWED` | Anyone calls `refund_after_timeout` after the submission deadline | `REFUNDED` to brand |
| `SUBMITTED`, `REVIEWING`, or `INCONCLUSIVE` | Anyone calls `refund_after_timeout` after the resolution deadline (submission deadline + 24 hours) | `REFUNDED` to brand |
| `PAYOUT_FAILED` / `REFUND_FAILED` | Anyone calls `retry_failed_settlement` | Retries the same fixed recipient and amount |

The submission window is set as a duration at campaign creation (minimum 60 seconds, maximum 30 days); the IC records the deadline from the pinned transaction timestamp. The extra 24-hour resolution grace avoids refunding a timely submitted copy merely because the submission window ended. A creator cannot submit or revise after the submission deadline.

All payouts use an EVM-interface `emit_transfer` child transaction. The live test waits for that child to finalize and checks `value_credited`, recipient, exact value, and account balance; it does not treat a scheduled transfer message alone as proof of settlement. The contract also implements `__on_errored_message__` and `retry_failed_settlement`; a deliberately failing child transfer was not induced in this test run, so that recovery branch remains unverified.

## Stored evidence and bounded output

The IC stores the campaign terms and copy text/hash, revision/review counts, state, latest verdict, and up to two compact review results. Each result uses the bounded verdict enum `CLEARED | FLAGGED | INCONCLUSIVE`, a stable `reason_code`, source status and normalized claim fields, product-page marker booleans, seller-page source label, `copy_sha256`, source/product/evidence SHA-256 digests, and `not_legal_approval: true`.

Raw DG SANTE response bodies and full rendered product-page text are not persisted. The digest covers compact normalized fields/markers, not a cryptographic snapshot of the entire external page. Repeated row/reference counts and product text length are informational, not settlement criteria. The result does not duplicate a retrieval timestamp; the `review_campaign` transaction/block timestamp provides the on-chain time reference for that evidence record.

## Security and limits

- `brand` is the deployer; campaign configuration/funding are brand-controlled, submissions are restricted to the named creator, and review start/evaluation are restricted to campaign parties.
- `fund_campaign` accepts only the exact agreed amount. A live test showed that a failed payable call can leave its attached value credited on Studionet; invalid funding therefore returns the value explicitly rather than raising after receipt. Tests confirm exact refund children for unauthorized funding and underpayment.
- The product URL and claim code are constants, not creator inputs. No uploads, images, multilingual support, other claims, generalized compliance engine, tokenomics, or DAO.
- Copy and all retrieved content are treated as data. Product-page prose is not executed or used as instructions; the classifier can only return a fixed enum.
- `CLEARED` never means legal approval. Unknown/conflicting evidence or validator disagreement fails closed. An inconclusive result is never paid automatically.

## Environment, deployment, and reproduction

The IC has no project-specific environment variables: the claim code, product URL, and testnet chain guard are contract constants. Tests use the pinned Python packages in `requirements-test.txt` and the `gltest` account/network configuration. The tested hosted setup selected Studionet through `--network studionet` and used the CLI defaults without a `gltest.config.yaml`. If your local `gltest` setup stores RPC or signing-account settings in `.env` or `gltest.config.yaml`, keep those files local and never commit private keys. The live test command deploys fresh campaign instances to Studionet; the addresses in `IMPLEMENTATION_REPORT.md` are test-run deployments.

From this directory, reproduce live retrieval and settlement with:

```sh
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-test.txt
gltest --network studionet --contracts-dir contracts \
  --artifacts-dir /tmp/eu-health-claim-escrow-artifacts \
  tests/test_live_campaign.py -v -s
```

The command deploys test contracts and performs live DG SANTE and product-page requests through the IC. It may take several minutes and each campaign uses 0.001 GEN. For synthetic branch coverage only, run `python -m pytest tests/test_campaign_direct.py -v`; those fixtures do not use live evidence or prove transfers. The original feasibility probe can be reproduced with the command in `README.md`.

## Tests

- `tests/test_live_campaign.py`: no-mock hosted Studionet integration. It covers live source and product retrieval, normalization, `MATCH → CLEARED`, real payout child/value credit, overclaim `FLAGGED`, one revision, final refund, caller/funding limits, submission timeout, and permissionless timeout refund. The review transactions run through live GenLayer consensus/validators.
- `tests/test_campaign_direct.py`: mocked Direct Mode policy/state checks using synthetic API rows, product text, and LLM enum responses. It covers source unavailability/conflict, incomplete seller markers, one-revision state, deadlines, and a validator callback rejecting a changed normalized snapshot. It is not evidence of live retrieval, consensus, or external settlement.
- `tests/test_live_spike.py` and `RESULTS.md`: original feasibility probe, retained unchanged.

For installation and run commands, see [`README.md`](README.md). The pinned target environment is `genlayer-test==0.29.2`, `genlayer-py==0.16.3`, hosted Studionet, chain ID `61999`.
