"""Mocked Direct Mode tests for deterministic policy/state branches only.

These synthetic source, product-page, and LLM fixtures are NOT evidence of live
Web Access, validator consensus, or payment. The no-mock tests in
`test_live_campaign.py` independently exercise those paths on Studionet.
"""

import json

import pytest

from gltest.direct import VMContext, deploy_contract


CONTRACT_PATH = "contracts/HealthClaimCampaignEscrow.py"
# genlayer-test 0.29.2's Direct Mode currently requests an unavailable latest
# GenVM release. v0.2.12 is a published runner that loads this pinned contract.
DIRECT_SDK_VERSION = "v0.2.12"
BRAND = bytes.fromhex("11" * 20)
CREATOR = "0x" + "22" * 20
CREATOR_BYTES = bytes.fromhex("22" * 20)
OTHER = bytes.fromhex("33" * 20)
REWARD_WEI = 10**15

DG_URL_PATTERN = r"api\.datalake\.sante\.service\.ec\.europa\.eu/health-claims"
PRODUCT_URL_PATTERN = r"vitaminexpress\.org/en/bioactive-folate"


def _source_row(reference="EFSA-Q-2008-00001", claim=None):
    return {
        "policy_item_code": "POL-HC-6377",
        "nutrient_subst_food_no_html": "Folate",
        "claim_type": "Article 13.1",
        "claim_status": "Authorised",
        "claim": claim or "Folate has a role in the process of cell division",
        "condition_of_use": "At least a source of folate",
        "restrictions_of_use": "",
        "legislation_short": "Regulation (EU) No 432/2012",
        "efsa_question": reference,
    }


def _source_payload(conflict=False):
    rows = [
        _source_row(f"EFSA-Q-2008-{index:05d}")
        for index in range(6)
    ]
    if conflict:
        rows[-1] = _source_row(
            "EFSA-Q-2008-99999",
            claim="Folate cures cancer",
        )
    return {"value": rows}


def _set_liveish_mocks(vm, alignment, product_text=None, conflict=False):
    vm.mock_web(
        DG_URL_PATTERN,
        {
            "method": "GET",
            "status": 200,
            "body": json.dumps(_source_payload(conflict=conflict)),
        },
    )
    if product_text is not None:
        vm.mock_web(
            PRODUCT_URL_PATTERN,
            {"method": "GET", "status": 200, "body": product_text},
        )
    vm.mock_llm(
        "UNTRUSTED_JSON_DATA",
        json.dumps({"semantic_alignment": alignment}),
    )


def _deploy(vm):
    vm._chain_id = 61999
    vm.sender = BRAND
    return deploy_contract(
        CONTRACT_PATH,
        vm,
        sdk_version=DIRECT_SDK_VERSION,
    )


def _create_funded_submitted_reviewing(vm, contract, copy_text):
    vm.sender = BRAND
    contract.create_campaign(CREATOR, REWARD_WEI, 3600)
    vm.deal(vm._contract_address, REWARD_WEI)
    vm.value = REWARD_WEI
    contract.fund_campaign()
    vm.value = 0
    vm.sender = CREATOR_BYTES
    contract.submit_copy(copy_text)
    vm.sender = BRAND
    contract.begin_review()


def _state(contract):
    return json.loads(contract.get_campaign_state())


def test_direct_synthetic_clear_deduplicates_and_validates_equivalence():
    """Fixture-only: six duplicate rows normalize; seller markers allow clear."""
    vm = VMContext()
    vm.warp("2026-09-29T12:00:00Z")
    with vm.activate():
        contract = _deploy(vm)
        _create_funded_submitted_reviewing(
            vm,
            contract,
            "Folate plays a part in cell division.",
        )
        _set_liveish_mocks(
            vm,
            alignment="MATCH",
            product_text="Folate 400 \u00b5g per capsule; 200% NRV.",
        )

        contract.review_campaign()
        result = json.loads(contract.get_review_results())[0]
        assert result["source_http_status"] == 200
        assert result["source_row_count"] == 6
        assert result["matching_row_count"] == 6
        assert result["normalized_record_count"] == 1
        assert result["semantic_alignment"] == "MATCH"
        assert result["condition_status"] == "SUPPORTED"
        assert result["verdict"] == "CLEARED"
        assert result["not_legal_approval"] is True
        assert len(result["evidence_digest"]) == 64
        assert _state(contract)["status"] == "PAID"
        # Direct Mode logs EthSend but does not execute an EVM child transaction.
        assert any("EthSend" in trace for trace in vm._traces)
        assert vm.run_validator() is True


def test_direct_missing_or_conflicting_evidence_fails_closed():
    """Fixture-only unavailable/conflicting sources never produce a clear."""
    # Missing product markers after a semantic MATCH are INCONCLUSIVE.
    vm = VMContext()
    vm._chain_id = 61999
    vm.warp("2026-09-29T12:00:00Z")
    with vm.activate():
        contract = _deploy(vm)
        _create_funded_submitted_reviewing(
            vm,
            contract,
            "Folate plays a part in cell division.",
        )
        _set_liveish_mocks(
            vm,
            alignment="MATCH",
            product_text="The seller page mentions folate but omits the declared amount.",
        )
        contract.review_campaign()
        result = json.loads(contract.get_review_results())[0]
        assert result["semantic_alignment"] == "MATCH"
        assert result["condition_status"] == "UNVERIFIED"
        assert result["verdict"] == "INCONCLUSIVE"
        assert _state(contract)["status"] == "INCONCLUSIVE"
        assert int(_state(contract)["escrow_wei"]) == REWARD_WEI
        assert vm.run_validator() is True

    # Conflicting normalized rows produce INCONCLUSIVE before prompt/product use.
    vm = VMContext()
    vm._chain_id = 61999
    vm.warp("2026-09-29T12:00:00Z")
    with vm.activate():
        contract = _deploy(vm)
        _create_funded_submitted_reviewing(
            vm,
            contract,
            "Folate plays a part in cell division.",
        )
        vm.mock_web(
            DG_URL_PATTERN,
            {
                "method": "GET",
                "status": 200,
                "body": json.dumps(_source_payload(conflict=True)),
            },
        )
        contract.review_campaign()
        result = json.loads(contract.get_review_results())[0]
        assert result["reason_code"] == "SOURCE_ROW_CONFLICT"
        assert result["verdict"] == "INCONCLUSIVE"
        assert _state(contract)["status"] == "INCONCLUSIVE"


def test_direct_overclaim_gets_one_revision_then_refunds_state():
    """Fixture-only LLM outputs exercise FLAGGED -> revision -> REFUNDED state."""
    vm = VMContext()
    vm._chain_id = 61999
    vm.warp("2026-09-29T12:00:00Z")
    with vm.activate():
        contract = _deploy(vm)
        _create_funded_submitted_reviewing(
            vm,
            contract,
            "Folate cures cancer and prevents every disease.",
        )
        vm.mock_web(
            DG_URL_PATTERN,
            {"method": "GET", "status": 200, "body": json.dumps(_source_payload())},
        )
        vm.mock_llm("cures cancer", '{"semantic_alignment":"OVERCLAIM"}')
        vm.mock_llm("cures all illnesses", '{"semantic_alignment":"OVERCLAIM"}')

        contract.review_campaign()
        first = json.loads(contract.get_review_results())[0]
        assert first["verdict"] == "FLAGGED"
        assert first["semantic_alignment"] == "OVERCLAIM"
        assert _state(contract)["status"] == "REVISION_ALLOWED"
        assert _state(contract)["revision_count"] == 0
        assert vm.run_validator() is True

        vm.sender = CREATOR_BYTES
        contract.submit_copy("Folate cures all illnesses and prevents all disease.")
        assert _state(contract)["revision_count"] == 1
        with vm.expect_revert("not accepting a copy submission"):
            contract.submit_copy("Folate plays a part in cell division.")

        vm.sender = BRAND
        contract.begin_review()
        contract.review_campaign()
        results = json.loads(contract.get_review_results())
        assert len(results) == 2
        assert results[1]["verdict"] == "FLAGGED"
        assert _state(contract)["status"] == "REFUNDED"
        assert _state(contract)["revision_count"] == 1
        assert int(_state(contract)["escrow_wei"]) == 0
        assert vm.run_validator() is True
        # Synthetic Direct Mode logs but never proves/refers to a real refund.
        assert any("EthSend" in trace for trace in vm._traces)


def test_direct_access_deadline_and_timeout_guards():
    """Direct state checks; no live balances or external transfers are asserted."""
    vm = VMContext()
    vm._chain_id = 61999
    vm.warp("2026-09-29T12:00:00Z")
    vm.sender = OTHER
    with vm.activate():
        contract = _deploy(vm)
        vm.sender = OTHER
        with vm.expect_revert("Only the campaign brand"):
            contract.create_campaign(CREATOR, REWARD_WEI, 60)

        vm.sender = BRAND
        contract.create_campaign(CREATOR, REWARD_WEI, 60)
        vm.deal(vm._contract_address, REWARD_WEI)
        vm.value = REWARD_WEI
        contract.fund_campaign()
        vm.value = 0

        with vm.expect_revert("timeout has not expired"):
            contract.refund_after_timeout()

        deadline = int(contract.submission_deadline_ts)
        with vm.expect_revert("Submission deadline has passed"):
            vm.sender = CREATOR_BYTES
            vm.warp("2026-09-29T12:02:00Z")
            contract.submit_copy("Folate plays a part in cell division.")

        vm.sender = OTHER
        contract.refund_after_timeout()
        assert _state(contract)["status"] == "REFUNDED"
        assert deadline < int(contract.resolution_deadline_ts)


def test_direct_source_unavailable_is_inconclusive_and_keeps_escrow():
    """Synthetic HTTP failure follows the fail-closed INCONCLUSIVE path."""
    vm = VMContext()
    vm._chain_id = 61999
    vm.warp("2026-09-29T12:00:00Z")
    with vm.activate():
        contract = _deploy(vm)
        _create_funded_submitted_reviewing(
            vm,
            contract,
            "Folate plays a part in cell division.",
        )
        vm.mock_web(
            DG_URL_PATTERN,
            {"method": "GET", "status": 503, "body": "service unavailable"},
        )
        contract.review_campaign()
        result = json.loads(contract.get_review_results())[0]
        assert result["reason_code"] == "SOURCE_HTTP_ERROR"
        assert result["verdict"] == "INCONCLUSIVE"
        assert _state(contract)["status"] == "INCONCLUSIVE"
        assert int(_state(contract)["escrow_wei"]) == REWARD_WEI
        assert not any("EthSend" in trace for trace in vm._traces)
        assert vm.run_validator() is True


def test_direct_validator_rejects_a_different_normalized_source_snapshot():
    """Synthetic validator re-fetch mismatch is rejected by the stable-field check."""
    vm = VMContext()
    vm._chain_id = 61999
    vm.warp("2026-09-29T12:00:00Z")
    with vm.activate():
        contract = _deploy(vm)
        _create_funded_submitted_reviewing(
            vm,
            contract,
            "Folate plays a part in cell division.",
        )
        _set_liveish_mocks(
            vm,
            alignment="MATCH",
            product_text="Folate 400 \u00b5g per capsule; 200% NRV.",
        )
        contract.review_campaign()
        leader_result = json.loads(contract.get_review_results())[0]
        assert leader_result["verdict"] == "CLEARED"
        assert vm.run_validator() is True

        pattern, response = vm._web_mocks[0]
        response["body"] = json.dumps(_source_payload(conflict=True))
        vm._web_mocks[0] = (pattern, response)
        assert vm.run_validator() is False
        # Direct Mode has no network consensus engine; the test only verifies
        # that the validator callback rejects the synthetic evidence mismatch.
