"""One-off live GenLayer feasibility test. No mocks or local response fixtures."""

import json

from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded
from gltest.types import TransactionStatus

CREATOR_COPY = "Folate plays a part in cell division."


def _receipt_summary(receipt):
    consensus = receipt.get("consensus_data", {})
    return {
        "hash": receipt.get("hash"),
        "status_name": receipt.get("status_name"),
        "result_name": receipt.get("result_name"),
        "num_of_rounds": receipt.get("num_of_rounds"),
        "validator_votes": consensus.get("votes", {}),
    }


def test_live_dg_sante_then_product_only_after_success():
    factory = get_contract_factory("HealthClaimSpike")
    contract = factory.deploy(
        args=[],
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_interval=1000,
        wait_retries=240,
    )

    dg_receipt = contract.evaluate_claim(args=[CREATOR_COPY]).transact(
        consensus_max_rotations=3,
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_interval=1000,
        wait_retries=240,
    )
    print("DG_RECEIPT_SUMMARY=" + json.dumps(_receipt_summary(dg_receipt), sort_keys=True))
    assert tx_execution_succeeded(dg_receipt), (
        "DG SANTE Intelligent Contract transaction did not finalize successfully; "
        "product page was intentionally not tested. Receipt: "
        + repr(dg_receipt)
    )

    dg_result = json.loads(contract.get_claim_result().call())
    print("DG_SANTE_IC_RESULT=" + json.dumps(dg_result, sort_keys=True))
    assert dg_result["source_http_status"] in (None, 200)
    assert dg_result["source_json_parsed"] is True
    assert dg_result["claim_code"] == "POL-HC-6377"
    assert dg_result["normalized_record_count"] == 1
    assert dg_result["verdict"] in ("CLEARED", "FLAGGED", "INCONCLUSIVE")
    assert dg_result["not_legal_approval"] is True

    # The product-page request is deliberately sequenced after a finalized
    # DG SANTE IC request and a successfully parsed, normalized source record.
    product_receipt = contract.inspect_product_page().transact(
        consensus_max_rotations=3,
        wait_transaction_status=TransactionStatus.FINALIZED,
        wait_interval=1000,
        wait_retries=240,
    )
    print("PRODUCT_RECEIPT_SUMMARY=" + json.dumps(_receipt_summary(product_receipt), sort_keys=True))
    assert tx_execution_succeeded(product_receipt), (
        "Product-page IC transaction did not finalize successfully. Receipt: "
        + repr(product_receipt)
    )

    product_result = json.loads(contract.get_product_result().call())
    print("PRODUCT_PAGE_IC_RESULT=" + json.dumps(product_result, sort_keys=True))
    assert isinstance(product_result["accessible"], bool)
