import { consensusName, formatGen, humanDate, isExactSettlementTransfer, shortAddress, statusName } from '../lib/genlayer';
import type { CampaignActivity, CampaignSnapshot, GenLayerTransaction } from '../lib/types';
import { Icon } from './Icons';

type ActiveTransaction = {
  hash: string;
  method: string;
  status: string;
  message?: string;
  tx?: GenLayerTransaction | null;
} | null;

type StageState = 'complete' | 'current' | 'pending' | 'evidence-gap' | 'failed';
type Stage = {
  number: string;
  title: string;
  state: StageState;
  detail: string;
  activity?: CampaignActivity;
  href?: string;
};

type Props = {
  snapshot: CampaignSnapshot | null;
  activeTransaction: ActiveTransaction;
  isLastStored: boolean;
  explorerTx: (hash: string) => string;
};

export function EvidenceTrail({ snapshot, activeTransaction, isLastStored, explorerTx }: Props) {
  const state = snapshot?.state;
  const storedReview = snapshot?.reviews.at(-1);
  const reviewTx = snapshot?.reviewTransaction;
  const currentStatus = state?.status ?? 'DRAFT';
  const locked = Boolean(state?.campaign_created);
  const copySubmitted = Boolean(snapshot?.copy);
  const terminalReviewStatuses = ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'];
  const latestReviewAttempt = [...(snapshot?.activities ?? [])].reverse().find((item) => item.method === 'review_campaign');
  const latestReviewAttemptFailed = latestReviewAttempt?.success === false;
  const latestSuccessfulReview = [...(snapshot?.activities ?? [])].reverse().find((item) => item.method === 'review_campaign' && item.success);
  const activeReview = activeTransaction?.method === 'review_campaign'
    ? activeTransaction
    : latestReviewAttempt
      ? {
          hash: latestReviewAttempt.hash,
          method: 'review_campaign',
          status: statusName(reviewTx) !== 'NOT_STARTED' ? statusName(reviewTx) : latestReviewAttempt.status ?? 'UNKNOWN',
          tx: reviewTx?.hash && String(reviewTx.hash).toLowerCase() === latestReviewAttempt.hash.toLowerCase() ? reviewTx : null,
        }
      : null;
  const storedReviewHash = latestSuccessfulReview?.hash ?? (!latestReviewAttemptFailed && storedReview && reviewTx?.hash ? String(reviewTx.hash) : undefined);
  const activeReviewIsLatest = Boolean(!activeReview || !storedReviewHash || activeReview.hash.toLowerCase() === storedReviewHash.toLowerCase());
  const review = isLastStored || activeReview && !activeReviewIsLatest ? undefined : storedReview;
  const reviewStatus = activeReview?.status ?? statusName(reviewTx);
  const reviewConsensus = reviewStatus === 'FINALIZED' ? consensusName(activeReview ? activeReview.tx : reviewTx) : null;
  const copyNeedsReview = Boolean(isLastStored && currentStatus === 'SUBMITTED');
  const reviewStarted = currentStatus === 'REVIEWING' || !isLastStored && (Boolean(storedReview) || Number(state?.review_count ?? 0) > 0);
  const reviewPending = Boolean(activeReview && !terminalReviewStatuses.includes(activeReview.status));
  const awaitingReviewCall = Boolean(currentStatus === 'REVIEWING' && storedReview && !reviewPending && activeReviewIsLatest && !latestReviewAttemptFailed);
  const reviewFailed = Boolean(activeReview && terminalReviewStatuses.includes(activeReview.status) && (latestReviewAttemptFailed || !activeReviewIsLatest || !storedReview));
  const currentReviewTx = activeReview ? activeReview.tx : reviewTx;
  const consensusKnown = Boolean(currentReviewTx && reviewStatus === 'FINALIZED' && reviewConsensus);
  const sourceAttempted = Boolean(review);
  const productAttempted = Boolean(review && review.product_page_reason_code !== 'NOT_REQUESTED');

  const event = (method: string) => snapshot?.activities.find((item) => item.method === method && item.success);
  const createEvent = event('create_campaign') ?? event('deploy');
  const submissionEvent = [...(snapshot?.activities ?? [])].reverse().find((item) => item.method === 'submit_copy' && item.success);
  const reviewEvent = latestSuccessfulReview;
  const reviewActivity: CampaignActivity | undefined = activeReview
    ? {
        hash: activeReview.hash,
        method: 'review_campaign',
        label: 'GENLAYER REVIEW',
        status: activeReview.status,
        timestamp: typeof activeReview.tx?.created_at === 'string' ? activeReview.tx.created_at : undefined,
        success: latestReviewAttempt?.hash.toLowerCase() === activeReview.hash.toLowerCase() ? latestReviewAttempt.success : undefined,
      }
    : reviewEvent;
  const settlementChild = snapshot?.settlementChildren.at(-1);
  const failedDepositRefundWei = String(state?.failed_refund_wei ?? '0');
  const hasFailedDepositRefund = isPositiveWei(failedDepositRefundWei);
  const depositRefundParent = currentStatus === 'DRAFT'
    ? [...(snapshot?.activities ?? [])].reverse().find((item) =>
        ['fund_campaign', 'retry_failed_settlement'].includes(item.method) &&
        item.status === 'FINALIZED' &&
        item.success !== false,
      )
    : undefined;
  const savedDepositRefundRecipient = String(state?.failed_refund_recipient ?? '');
  const depositRefundRecipient = savedDepositRefundRecipient && !/^0x0+$/i.test(savedDepositRefundRecipient)
    ? savedDepositRefundRecipient
    : state?.brand;
  const depositRefundTransferVerified = Boolean(
    depositRefundParent && settlementChild && statusName(settlementChild) === 'FINALIZED' && settlementChild.value_credited === true &&
    String(settlementChild.to_address ?? settlementChild.recipient ?? '').toLowerCase() === String(depositRefundRecipient ?? '').toLowerCase(),
  );
  const recoveredPendingActivity = [...(snapshot?.activities ?? [])].reverse().find((item) => {
    const status = item.status?.toUpperCase();
    return item.method !== 'other' && Boolean(status) && !['UNKNOWN', 'NOT_STARTED', 'FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(status ?? '');
  });
  const transactionForRibbon: ActiveTransaction = activeTransaction ?? (recoveredPendingActivity
    ? { hash: recoveredPendingActivity.hash, method: recoveredPendingActivity.method, status: recoveredPendingActivity.status ?? 'PENDING', message: recoveredPendingActivity.label }
    : null);
  const transactionForRibbonTerminal = Boolean(transactionForRibbon && ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(transactionForRibbon.status));
  const expectedSettlementRecipient = currentStatus === 'PAID'
    ? state?.creator
    : currentStatus === 'REFUNDED' ? state?.brand : undefined;
  const campaignSettlementTransferVerified = isExactSettlementTransfer(
    settlementChild,
    expectedSettlementRecipient,
    String(state?.reward_wei ?? '0'),
  );
  const settlementTransferVerified = campaignSettlementTransferVerified || depositRefundTransferVerified;
  const childStatus = statusName(settlementChild);
  const childTerminal = ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(childStatus);

  const stages: Stage[] = [
    {
      number: '01',
      title: 'CAMPAIGN LOCKED',
      state: locked ? 'complete' : activeTransaction?.method === 'deploy' ? 'current' : 'pending',
      detail: locked
        ? `Fixed to ${state?.claim_code ?? 'POL-HC-6377'} · ${formatGen(state?.reward_wei)} GEN`
        : 'Contract terms have not been written.',
      activity: createEvent,
    },
    {
      number: '02',
      title: 'CREATOR SUBMISSION',
      state: copySubmitted ? 'complete' : currentStatus === 'FUNDED' ? 'current' : 'pending',
      detail: copySubmitted
        ? `${snapshot?.copy.length.toLocaleString()} characters · ${shortAddress(state?.copy_sha256, 10, 7)}`
        : currentStatus === 'FUNDED' ? 'Awaiting the named creator.' : 'No copy on record.',
      activity: submissionEvent,
    },
    {
      number: '03',
      title: 'OFFICIAL CLAIM RETRIEVED',
      state: copyNeedsReview ? 'pending' : reviewPending || awaitingReviewCall ? 'current' : reviewFailed ? 'failed' : sourceAttempted
        ? review?.source_json_parsed ? 'complete' : 'evidence-gap'
        : reviewStarted ? 'current' : 'pending',
      detail: copyNeedsReview
        ? 'The current copy has not been reviewed. A fresh DG SANTE retrieval runs in the next review call.'
        : awaitingReviewCall
        ? 'Review was opened on-chain; the next review call retrieves the official register record.'
        : reviewPending
          ? 'The Intelligent Contract is retrieving the official DG SANTE record.'
          : reviewFailed
            ? `${reviewStatus} · ${reviewConsensus ?? 'NO CONSENSUS RESULT'} · no new evidence record stored.`
            : review
              ? review.source_json_parsed
                ? `${review.source_http_status ?? '—'} · ${review.matching_row_count ?? 0} matches / ${review.normalized_record_count ?? 0} normalized`
                : `${review.reason_code ?? 'SOURCE_UNAVAILABLE'} · no parsed register record`
              : 'DG SANTE is queried by the Intelligent Contract at review.',
      activity: copyNeedsReview ? undefined : reviewActivity,
    },
    {
      number: '04',
      title: 'PRODUCT EVIDENCE RETRIEVED',
      state: copyNeedsReview ? 'pending' : reviewPending || awaitingReviewCall ? 'current' : reviewFailed ? 'failed' : productAttempted
        ? review?.product_page_accessible ? 'complete' : 'evidence-gap'
        : reviewStarted ? 'current' : 'pending',
      detail: copyNeedsReview
        ? 'No product evidence is linked to the current copy yet.'
        : awaitingReviewCall
        ? 'New seller-page evidence is retrieved by the IC after semantic MATCH.'
        : reviewPending
          ? 'Product-page retrieval follows the contract-controlled comparison.'
          : reviewFailed
            ? `${reviewStatus} · no new product evidence record stored.`
            : review
              ? review.product_page_reason_code === 'NOT_REQUESTED'
                ? 'Not requested for this outcome.'
                : review.product_page_accessible
                  ? 'Seller page returned · marker extraction recorded.'
                  : review.product_page_reason_code ?? 'Page unavailable.'
              : 'Fixed seller page is rendered only after a semantic MATCH.',
      activity: copyNeedsReview ? undefined : reviewActivity,
    },
    {
      number: '05',
      title: 'GENLAYER REVIEW',
      state: copyNeedsReview ? 'pending' : reviewPending || awaitingReviewCall ? 'current' : reviewFailed ? 'failed' : review
        ? review.verdict === 'INCONCLUSIVE' ? 'evidence-gap' : 'complete'
        : currentStatus === 'REVIEWING' ? 'current' : 'pending',
      detail: copyNeedsReview
        ? 'The current copy has not been evaluated. The stored result below belongs to an earlier copy.'
        : awaitingReviewCall
        ? 'Awaiting review_campaign; no new evidence evaluation has run.'
        : reviewPending
          ? 'Leader execution and evidence evaluation are in progress.'
          : reviewFailed
            ? `${reviewStatus} · ${reviewConsensus ?? 'NO CONSENSUS RESULT'} · no new contract result stored.`
            : review
              ? `${review.semantic_alignment ?? 'UNCLEAR'} · ${review.reason_code ?? '—'}`
              : 'The contract-controlled rubric has not run.',
      activity: copyNeedsReview ? undefined : reviewActivity,
    },
    {
      number: '06',
      title: 'VALIDATOR CONSENSUS',
      state: copyNeedsReview ? 'pending' : reviewPending || awaitingReviewCall ? 'current' : reviewFailed ? 'failed' : consensusKnown
        ? reviewConsensus === 'MAJORITY_AGREE' ? 'complete' : 'evidence-gap'
        : 'pending',
      detail: copyNeedsReview
        ? 'No consensus is recorded for the current copy.'
        : awaitingReviewCall
        ? 'Consensus is not available until the next review transaction finalizes.'
        : reviewFailed
          ? `${reviewStatus} · ${reviewConsensus ?? 'NO CONSENSUS RESULT'} · contract result not updated.`
          : reviewConsensus
            ? `${reviewConsensus} · ${agreeCount(currentReviewTx)} of ${validatorCount(currentReviewTx)} validator votes agree`
            : reviewPending
              ? transactionProgressLabel(reviewStatus)
              : currentReviewTx && reviewStatus === 'FINALIZED'
                ? 'Consensus details have not been returned by Studio.'
                : 'No review transaction is linked to this browser yet.', 
      activity: copyNeedsReview ? undefined : reviewActivity,
      href: !copyNeedsReview && reviewActivity ? explorerTx(reviewActivity.hash) : undefined,
    },
    {
      number: '07',
      title: 'SETTLEMENT',
      state: ['PAYOUT_FAILED', 'REFUND_FAILED'].includes(currentStatus) || hasFailedDepositRefund
        ? 'failed'
        : ['PAID', 'REFUNDED'].includes(currentStatus)
          ? campaignSettlementTransferVerified ? 'complete' : childTerminal ? 'evidence-gap' : 'current'
          : depositRefundParent
            ? depositRefundTransferVerified ? 'complete' : childTerminal ? 'evidence-gap' : 'current'
            : 'pending',
      detail: hasFailedDepositRefund
        ? `Deposit refund of ${formatGen(failedDepositRefundWei)} GEN is recorded as failed; retry_failed_settlement can retry the saved transfer.`
        : ['PAID', 'REFUNDED', 'PAYOUT_FAILED', 'REFUND_FAILED'].includes(currentStatus)
          ? settlementDetail(currentStatus, snapshot, settlementChild, campaignSettlementTransferVerified)
          : depositRefundParent
            ? depositRefundDetail(settlementChild, depositRefundTransferVerified, depositRefundRecipient)
            : 'Escrow remains held by the campaign contract.',
      activity: settlementChild
        ? {
            hash: String(settlementChild.hash ?? ''),
            method: 'settlement_child',
            label: depositRefundParent ? 'DEPOSIT REFUND TRANSFER' : 'SETTLEMENT TRANSFER',
            status: childStatus,
            to: String(settlementChild.to_address ?? settlementChild.recipient ?? ''),
            value: String(settlementChild.value ?? ''),
            valueCredited: settlementChild.value_credited,
            success: settlementTransferVerified ? true : childTerminal ? false : undefined,
          }
        : depositRefundParent ?? reviewActivity,
      href: settlementChild?.hash ? explorerTx(String(settlementChild.hash)) : depositRefundParent ? explorerTx(depositRefundParent.hash) : reviewActivity ? explorerTx(reviewActivity.hash) : undefined,
    },
  ];

  return (
    <section className="evidence-trail-section" aria-labelledby="trail-heading">
      <div className="section-heading-row">
        <div>
          <div className="section-overline"><span>02</span> TRACEABLE REVIEW</div>
          <h2 id="trail-heading" className="section-title">Evidence trail</h2>
        </div>
        <div className="trail-key"><span className="trail-key-line" />ON-CHAIN SEQUENCE</div>
      </div>

      <div className="evidence-timeline">
        {stages.map((stage, index) => (
          <div className={`evidence-stage stage-${stage.state}`} key={stage.number}>
            <div className="stage-spine">
              <span className="stage-node">
                {stage.state === 'complete' ? <Icon name="check" size={13} /> : stage.state === 'failed' ? <Icon name="alert" size={13} /> : stage.number}
              </span>
              {index < stages.length - 1 && <span className="stage-line" />}
            </div>
            <div className="stage-body">
              <div className="stage-headline">
                <span className="stage-number">{stage.number}</span>
                <h3>{stage.title}</h3>
                <span className={`stage-state-label stage-label-${stage.state}`}>
                  {stageLabel(stage.state, stage.title, currentStatus)}
                </span>
              </div>
              <p>{stage.detail}</p>
              {stage.activity?.hash && (
                <div className="stage-meta-line">
                  <span className="stage-time">{humanDate(stage.activity.timestamp)}</span>
                  {stage.href ? (
                    <a href={stage.href} target="_blank" rel="noreferrer" className="stage-tx-link">
                      TX {shortAddress(stage.activity.hash, 8, 5)} <Icon name="external" size={11} />
                    </a>
                  ) : (
                    <span className="stage-tx-hash" title={stage.activity.hash}>TX {shortAddress(stage.activity.hash, 8, 5)}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {transactionForRibbon && (
        <div className={`transaction-ribbon ${transactionForRibbon.status === 'FINALIZED' ? 'ribbon-final' : transactionForRibbonTerminal ? 'ribbon-terminal' : 'ribbon-active'}`}>
          <span className="ribbon-dot" />
          <div>
            <strong>{transactionForRibbon.status === 'FINALIZED' ? 'TRANSACTION FINALIZED' : transactionProgressLabel(transactionForRibbon.status)}</strong>
            <span>{transactionForRibbon.message ?? transactionForRibbon.hash}</span>
          </div>
          <a href={explorerTx(transactionForRibbon.hash)} target="_blank" rel="noreferrer" aria-label="Open transaction in explorer">
            <Icon name="external" size={14} />
          </a>
        </div>
      )}
    </section>
  );
}

function stageLabel(state: StageState, title: string, campaignState: string): string {
  if (state === 'complete') {
    if (title === 'SETTLEMENT' && ['PAID', 'REFUNDED'].includes(campaignState)) return 'TRANSFER FINAL';
    if (title === 'SETTLEMENT' && campaignState === 'DRAFT') return 'DEPOSIT REFUND FINAL';
    return 'RECORDED';
  }
  if (state === 'failed') return 'RETRY REQUIRED';
  if (state === 'evidence-gap') return 'EVIDENCE GAP';
  if (state === 'current') return 'IN PROGRESS';
  return 'AWAITING';
}

function validatorCount(tx?: GenLayerTransaction | null): number {
  return Object.keys(tx?.consensus_data?.votes ?? {}).length;
}

function agreeCount(tx?: GenLayerTransaction | null): number {
  return Object.values(tx?.consensus_data?.votes ?? {}).filter((vote) => String(vote).toLowerCase() === 'agree').length;
}

function isPositiveWei(value: string): boolean {
  try { return BigInt(value) > 0n; } catch { return false; }
}

function depositRefundDetail(child: GenLayerTransaction | undefined, verified: boolean, recipient?: string): string {
  if (!child) return 'The contract issued a deposit refund transfer; waiting for the finalized child receipt.';
  if (verified) return `Deposit refund finalized: ${formatGen(String(child.value ?? '0'))} GEN credited to ${shortAddress(recipient, 8, 5)}.`;
  return `Deposit refund child ${statusName(child)} does not verify a finalized credit to ${shortAddress(recipient, 8, 5)}.`;
}

function settlementDetail(
  status: string,
  snapshot: CampaignSnapshot | null,
  child: GenLayerTransaction | undefined,
  verified: boolean,
): string {
  if (status === 'PAID' || status === 'REFUNDED') {
    if (!child) return `Contract status is ${status}; waiting for the finalized settlement transfer receipt.`;
    if (verified) {
      const recipient = String(child.to_address ?? child.recipient ?? '');
      return `${formatGen(String(child.value ?? '0'))} GEN credited to ${shortAddress(recipient, 8, 5)}.`;
    }
    const expectedRecipient = status === 'PAID' ? snapshot?.state.creator : snapshot?.state.brand;
    return `Contract status is ${status}; child receipt ${statusName(child)} does not verify ${formatGen(snapshot?.state.reward_wei)} GEN to ${shortAddress(expectedRecipient, 8, 5)}.`;
  }
  if (status === 'PAYOUT_FAILED' || status === 'REFUND_FAILED') {
    return `Transfer failed. ${formatGen(snapshot?.state.escrow_wei)} GEN is recorded as recoverable; retry is available.`;
  }
  return status;
}

export function transactionProgressLabel(status: string): string {
  const normalized = status.toUpperCase();
  if (normalized === 'PENDING' || normalized === 'UNINITIALIZED') return 'SUBMITTED TO STUDIONET';
  if (normalized === 'PROPOSING') return 'GENLAYER EXECUTION';
  if (normalized === 'COMMITTING' || normalized === 'REVEALING' || normalized === 'APPEAL_COMMITTING' || normalized === 'APPEAL_REVEALING') return 'VALIDATOR REVIEW';
  if (normalized === 'ACCEPTED' || normalized === 'READY_TO_FINALIZE') return 'CONSENSUS REACHED · AWAITING FINALITY';
  if (normalized === 'FINALIZED') return 'FINALIZED';
  if (normalized === 'UNDETERMINED') return 'NO CONSENSUS DECISION';
  return normalized.replaceAll('_', ' ');
}
