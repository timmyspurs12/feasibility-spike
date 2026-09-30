"""No-mock Studionet integration tests for the campaign escrow.

These tests deploy real contracts and use live DG SANTE/product-page Web Access,
GenLayer semantic evaluation, validators, payable funding, and external transfers.
They need a working `gltest --network studionet` setup and can take several
minutes because the validators re-fetch evidence.
"""

import json
import time

from gltest import (
    get_accounts,
    get_contract_factory,
    get_default_account,
    get_gl_client,
)
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus
from gltest.utils import extract_contract_address


REWARD_WEI = 10**15  # 0.001 GEN per test campaign
MATCHING_COPY = "Folate plays a part in cell division."
OVERCLAIM_COPY = "Folate cures cancer, prevents every disease, and guarantees perfect health."
OVERCLAIM_REVISION = "Folate cures all illnesses and ensures nobody gets sick."
WAIT_RETRIES = 300


def _receipt_summary(receipt):
    consensus = receipt.get("consensus_data") or {}
    return {
        "hash": receipt.get("hash"),
        "status_name": receipt.get("status_name"),
        "result_name": receipt.get("result_name"),
        "num_of_rounds": receipt.get("num_of_rounds"),
        "validator_votes": consensus.get("votes", {}),
        "triggered_transactions": receipt.get("triggered_transactions", []),
        "from_address": receipt.get("from_address"),
        "to_address": receipt.get("to_address"),
        "value": receipt.get("value"),
        "value_credited": receipt.get("value_credited"),
    }


def _print_receipt(label, receipt):
    print(label + "=" + json.dumps(_receipt_summary(receipt), sort_keys=True))


def _wait_for_finalized(client, tx_hash, label):
    """Poll one known tx hash; retry transient non-JSON/502 RPC responses."""
    last_error = None
    for attempt in range(WAIT_RETRIES):
        try:
            receipt = client.get_transaction(tx_hash)
            if receipt and receipt.get("status_name") == "FINALIZED":
                return receipt
        except Exception as error:
            last_error = error
            if attempt in (0, 4, 19, 59, 119, 199):
                print(
                    f"TRANSIENT_RPC_RETRY label={label} attempt={attempt + 1} "
                    f"error={type(error).__name__}"
                )
        time.sleep(1)
    raise TimeoutError(
        f"{label} did not finalize after {WAIT_RETRIES} polls; "
        f"last RPC error={last_error!r}"
    )


def _expect_success(label, receipt):
    _print_receipt(label, receipt)
    assert tx_execution_succeeded(receipt), (
        f"{label} did not execute successfully: {_receipt_summary(receipt)}"
    )
    assert receipt.get("status_name") == "FINALIZED", (
        f"{label} did not reach FINALIZED: {_receipt_summary(receipt)}"
    )


def _expect_failure(label, receipt):
    _print_receipt(label, receipt)
    assert not tx_execution_succeeded(receipt), (
        f"{label} unexpectedly succeeded: {_receipt_summary(receipt)}"
    )


def _deploy_campaign():
    accounts = get_accounts()
    brand = get_default_account()
    creator = accounts[1]
    unrelated = accounts[2]
    factory = get_contract_factory("HealthClaimCampaignEscrow")
    client = get_gl_client()

    deployment_hash = client.deploy_contract(
        code=factory.contract_code,
        account=brand,
        leader_only=False,
    )
    deployment = _wait_for_finalized(client, deployment_hash, "DEPLOY")
    _expect_success("DEPLOY_RECEIPT", deployment)
    address = extract_contract_address(deployment)
    print("DEPLOY_ADDRESS=" + str(address))
    contract = factory.build_contract(contract_address=address, account=brand)
    return contract, brand, creator, unrelated, deployment


def _write(contract, method_name, args=None, value=0, wait_for_children=False):
    client = get_gl_client()
    tx_hash = client.write_contract(
        address=contract.address,
        function_name=method_name,
        account=contract.account,
        value=value,
        consensus_max_rotations=3,
        leader_only=False,
        args=args,
    )
    receipt = _wait_for_finalized(client, tx_hash, method_name)

    if wait_for_children:
        try:
            children = receipt.get("triggered_transactions") or []
            if not children:
                children = client.get_triggered_transaction_ids(tx_hash) or []
        except Exception:
            children = []
        receipt["triggered_transactions"] = children
        for child in children:
            _wait_for_finalized(client, child, method_name + " child")
    return receipt


def _create_and_fund(contract, creator, window_seconds=3600):
    receipt = _write(
        contract,
        "create_campaign",
        args=[creator.address, REWARD_WEI, window_seconds],
    )
    _expect_success("CREATE_CAMPAIGN", receipt)
    receipt = _write(
        contract,
        "fund_campaign",
        value=REWARD_WEI,
    )
    _expect_success("FUND_CAMPAIGN", receipt)
    state = json.loads(contract.get_campaign_state().call())
    assert state["status"] == "FUNDED"
    assert int(state["escrow_wei"]) == REWARD_WEI
    assert int(contract.get_contract_balance().call()) == REWARD_WEI
    return state


def _triggered_children(receipt):
    children = receipt.get("triggered_transactions") or []
    if not children:
        children = get_gl_client().get_triggered_transaction_ids(receipt["hash"])
    return children or []


def _assert_settlement_child_finalized(
    receipt,
    label,
    expected_recipient,
    expected_value,
):
    children = _triggered_children(receipt)
    print(label + "_CHILD_IDS=" + json.dumps(children))
    assert children, f"{label} finalized without an external transfer child transaction"
    client = get_gl_client()
    for child in children:
        child_receipt = _wait_for_finalized(client, child, label + " child")
        _print_receipt(label + "_CHILD_RECEIPT", child_receipt)
        assert child_receipt.get("status_name") == "FINALIZED", (
            f"{label} transfer child did not finalize: {_receipt_summary(child_receipt)}"
        )
        assert child_receipt.get("value_credited") is True, (
            f"{label} transfer was not credited on the chain layer: "
            f"{_receipt_summary(child_receipt)}"
        )
        assert str(child_receipt.get("to_address", "")).lower() == str(
            expected_recipient
        ).lower()
        assert int(child_receipt.get("value", 0)) == expected_value


def test_live_clear_pays_creator_and_enforces_access_and_funding():
    """Real positive path plus brand/creator/exact-value access checks."""
    contract, brand, creator, unrelated, deployment = _deploy_campaign()
    unrelated_contract = contract.connect(unrelated)
    creator_contract = contract.connect(creator)

    # Only the deployer/brand may create the one campaign.
    failed = _write(
        unrelated_contract,
        "create_campaign",
        args=[creator.address, REWARD_WEI, 3600],
    )
    _expect_failure("UNAUTHORIZED_CREATE", failed)
    state = json.loads(contract.get_campaign_state().call())
    assert state["campaign_created"] is False

    receipt = _write(
        contract,
        "create_campaign",
        args=[creator.address, REWARD_WEI, 3600],
    )
    _expect_success("CREATE_CAMPAIGN", receipt)

    # Invalid payable calls are accepted only to return the attached GEN; they
    # must not revert with value stranded in the contract or count as funding.
    unexpected = _write(
        unrelated_contract,
        "fund_campaign",
        value=REWARD_WEI,
        wait_for_children=True,
    )
    _expect_success("UNAUTHORIZED_FUND_REFUNDED", unexpected)
    _assert_settlement_child_finalized(
        unexpected,
        "UNAUTHORIZED_FUND_REFUND",
        unrelated.address,
        REWARD_WEI,
    )
    assert int(contract.get_contract_balance().call()) == 0

    underpayment = _write(
        contract,
        "fund_campaign",
        value=REWARD_WEI - 1,
        wait_for_children=True,
    )
    _expect_success("UNDERPAYMENT_REFUNDED", underpayment)
    _assert_settlement_child_finalized(
        underpayment,
        "UNDERPAYMENT_REFUND",
        brand.address,
        REWARD_WEI - 1,
    )
    assert int(contract.get_contract_balance().call()) == 0

    receipt = _write(contract, "fund_campaign", value=REWARD_WEI)
    _expect_success("FUND_CAMPAIGN", receipt)
    state = json.loads(contract.get_campaign_state().call())
    assert state["status"] == "FUNDED"
    assert int(state["escrow_wei"]) == REWARD_WEI
    assert int(contract.get_contract_balance().call()) == REWARD_WEI

    # The brand cannot impersonate the named creator.
    failed = _write(contract, "submit_copy", args=[MATCHING_COPY])
    _expect_failure("UNAUTHORIZED_SUBMISSION", failed)

    receipt = _write(creator_contract, "submit_copy", args=[MATCHING_COPY])
    _expect_success("CREATOR_SUBMISSION", receipt)
    failed = _write(unrelated_contract, "begin_review")
    _expect_failure("UNAUTHORIZED_BEGIN_REVIEW", failed)
    receipt = _write(contract, "begin_review")
    _expect_success("BEGIN_REVIEW", receipt)

    client = get_gl_client()
    creator_balance_before = int(client.get_balance(creator.address))
    review = _write(
        creator_contract,
        "review_campaign",
        wait_for_children=True,
    )
    _expect_success("LIVE_REVIEW_AND_PAYOUT", review)
    _assert_settlement_child_finalized(
        review,
        "PAYOUT",
        creator.address,
        REWARD_WEI,
    )

    result_list = json.loads(contract.get_review_results().call())
    assert len(result_list) == 1
    result = result_list[0]
    print("LIVE_REVIEW_RESULT=" + json.dumps(result, sort_keys=True))
    assert result["source_http_status"] == 200
    assert result["source_json_parsed"] is True
    assert result["claim_code"] == "POL-HC-6377"
    assert result["normalized_record_count"] == 1
    assert result["semantic_alignment"] == "MATCH"
    assert result["condition_status"] == "SUPPORTED"
    assert result["product_page_accessible"] is True
    assert result["product_evidence"] == {
        "mentions_folate": True,
        "mentions_400_ug": True,
        "mentions_200_percent_nrv": True,
    }
    assert result["verdict"] == "CLEARED"
    assert result["not_legal_approval"] is True
    assert len(result["evidence_digest"]) == 64

    state = json.loads(contract.get_campaign_state().call())
    assert state["status"] == "PAID"
    assert state["last_verdict"] == "CLEARED"
    assert int(state["escrow_wei"]) == 0
    assert int(contract.get_contract_balance().call()) == 0
    creator_balance_after = int(client.get_balance(creator.address))
    print(
        "PAYOUT_BALANCE_CHECK="
        + json.dumps(
            {
                "creator_before": creator_balance_before,
                "creator_after": creator_balance_after,
                "delta": creator_balance_after - creator_balance_before,
                "reward_wei": REWARD_WEI,
            },
            sort_keys=True,
        )
    )
    assert creator_balance_after - creator_balance_before == REWARD_WEI, (
        "Creator's Studionet EVM balance did not increase by exactly the escrowed reward"
    )
    print("CAMPAIGN_ADDRESS=" + str(contract.address))
    print("DEPLOYMENT_HASH=" + str(deployment.get("hash")))


def test_live_overclaim_revision_limit_and_final_refund():
    """Real validator judgment flags two strong overclaims; one revision only."""
    contract, brand, creator, unrelated, deployment = _deploy_campaign()
    creator_contract = contract.connect(creator)
    unrelated_contract = contract.connect(unrelated)
    _create_and_fund(contract, creator)

    receipt = _write(creator_contract, "submit_copy", args=[OVERCLAIM_COPY])
    _expect_success("OVERCLAIM_SUBMISSION", receipt)
    receipt = _write(contract, "begin_review")
    _expect_success("BEGIN_FIRST_REVIEW", receipt)
    receipt = _write(contract, "review_campaign")
    _expect_success("LIVE_FIRST_OVERCLAIM_REVIEW", receipt)

    first_results = json.loads(contract.get_review_results().call())
    assert len(first_results) == 1
    print("FIRST_FLAGGED_RESULT=" + json.dumps(first_results[0], sort_keys=True))
    assert first_results[0]["semantic_alignment"] == "OVERCLAIM"
    assert first_results[0]["verdict"] == "FLAGGED"
    state = json.loads(contract.get_campaign_state().call())
    assert state["status"] == "REVISION_ALLOWED"
    assert state["last_verdict"] == "FLAGGED"
    assert state["revision_count"] == 0
    assert int(contract.get_contract_balance().call()) == REWARD_WEI

    receipt = _write(creator_contract, "submit_copy", args=[OVERCLAIM_REVISION])
    _expect_success("SINGLE_REVISION_SUBMISSION", receipt)
    state = json.loads(contract.get_campaign_state().call())
    assert state["revision_count"] == 1
    assert state["status"] == "SUBMITTED"

    failed = _write(creator_contract, "submit_copy", args=[MATCHING_COPY])
    _expect_failure("SECOND_REVISION_REJECTED", failed)
    assert contract.get_submitted_copy().call() == OVERCLAIM_REVISION

    receipt = _write(unrelated_contract, "begin_review")
    _expect_failure("UNAUTHORIZED_SECOND_REVIEW_START", receipt)
    receipt = _write(creator_contract, "begin_review")
    _expect_success("BEGIN_SECOND_REVIEW", receipt)

    client = get_gl_client()
    brand_balance_before = int(client.get_balance(brand.address))
    review = _write(
        creator_contract,
        "review_campaign",
        wait_for_children=True,
    )
    _expect_success("LIVE_FINAL_FLAG_AND_REFUND", review)
    _assert_settlement_child_finalized(
        review,
        "REVISION_REFUND",
        brand.address,
        REWARD_WEI,
    )

    results = json.loads(contract.get_review_results().call())
    assert len(results) == 2
    print("SECOND_FLAGGED_RESULT=" + json.dumps(results[1], sort_keys=True))
    assert results[1]["semantic_alignment"] == "OVERCLAIM"
    assert results[1]["verdict"] == "FLAGGED"
    state = json.loads(contract.get_campaign_state().call())
    assert state["status"] == "REFUNDED"
    assert state["last_verdict"] == "FLAGGED"
    assert state["revision_count"] == 1
    assert int(state["escrow_wei"]) == 0
    assert int(contract.get_contract_balance().call()) == 0
    brand_balance_after = int(client.get_balance(brand.address))
    print(
        "REFUND_BALANCE_CHECK="
        + json.dumps(
            {
                "brand_before": brand_balance_before,
                "brand_after": brand_balance_after,
                "delta": brand_balance_after - brand_balance_before,
                "reward_wei": REWARD_WEI,
            },
            sort_keys=True,
        )
    )
    assert brand_balance_after - brand_balance_before == REWARD_WEI, (
        "Brand's Studionet EVM balance did not increase by exactly the escrowed reward"
    )
    print("CAMPAIGN_ADDRESS=" + str(contract.address))
    print("DEPLOYMENT_HASH=" + str(deployment.get("hash")))


def test_live_submission_deadline_and_permissionless_timeout_refund():
    """A funded campaign with no submission refunds only after its deadline."""
    contract, brand, creator, unrelated, deployment = _deploy_campaign()
    unrelated_contract = contract.connect(unrelated)
    creator_contract = contract.connect(creator)
    # A five-minute window tolerates Studionet finality latency before the
    # actual time-based refund check below.
    _create_and_fund(contract, creator, window_seconds=300)

    state = json.loads(contract.get_campaign_state().call())
    deadline = int(state["submission_deadline_ts"])
    brand_balance_before_refund = int(get_gl_client().get_balance(brand.address))

    failed = _write(unrelated_contract, "refund_after_timeout")
    _expect_failure("EARLY_TIMEOUT_REFUND_REJECTED", failed)
    assert json.loads(contract.get_campaign_state().call())["status"] == "FUNDED"

    now = int(contract.get_current_timestamp().call())
    remaining = max(0, deadline - now + 2)
    print(
        "WAITING_FOR_SUBMISSION_DEADLINE="
        + json.dumps({"now": now, "deadline": deadline, "sleep_seconds": remaining})
    )
    if remaining:
        time.sleep(remaining)
    now_after_wait = int(contract.get_current_timestamp().call())
    assert now_after_wait > deadline

    failed = _write(creator_contract, "submit_copy", args=[MATCHING_COPY])
    _expect_failure("LATE_SUBMISSION_REJECTED", failed)
    assert json.loads(contract.get_campaign_state().call())["status"] == "FUNDED"

    refund = _write(
        unrelated_contract,
        "refund_after_timeout",
        wait_for_children=True,
    )
    _expect_success("LIVE_TIMEOUT_REFUND", refund)
    _assert_settlement_child_finalized(
        refund,
        "TIMEOUT_REFUND",
        brand.address,
        REWARD_WEI,
    )

    state = json.loads(contract.get_campaign_state().call())
    assert state["status"] == "REFUNDED"
    assert state["last_verdict"] == "NONE"
    assert int(state["escrow_wei"]) == 0
    assert int(contract.get_contract_balance().call()) == 0
    brand_balance_after_refund = int(get_gl_client().get_balance(brand.address))
    print(
        "TIMEOUT_REFUND_BALANCE_CHECK="
        + json.dumps(
            {
                "brand_before": brand_balance_before_refund,
                "brand_after": brand_balance_after_refund,
                "delta": brand_balance_after_refund - brand_balance_before_refund,
                "reward_wei": REWARD_WEI,
            },
            sort_keys=True,
        )
    )
    assert brand_balance_after_refund - brand_balance_before_refund == REWARD_WEI
    print("CAMPAIGN_ADDRESS=" + str(contract.address))
    print("DEPLOYMENT_HASH=" + str(deployment.get("hash")))
