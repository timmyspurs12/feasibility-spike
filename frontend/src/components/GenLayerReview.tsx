import { consensusName, shortAddress, statusName } from '../lib/genlayer';
import type { CampaignSnapshot, GenLayerTransaction } from '../lib/types';
import { Icon } from './Icons';

type ActiveTransaction = {
  hash: string;
  method: string;
  status: string;
  message?: string;
  tx?: GenLayerTransaction | null;
} | null;

type Props = {
  snapshot: CampaignSnapshot | null;
  activeTransaction: ActiveTransaction;
  isLastStored: boolean;
  explorerTx: (hash: string) => string;
};

export function GenLayerReview({ snapshot, activeTransaction, isLastStored, explorerTx }: Props) {
  const review = snapshot?.reviews.at(-1);
  const tx = snapshot?.reviewTransaction;
  const terminalReviewStatuses = ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'];
  const latestReviewActivity = [...(snapshot?.activities ?? [])].reverse().find((activity) => activity.method === 'review_campaign');
  const latestReviewAttemptFailed = latestReviewActivity?.success === false;
  const latestSuccessfulReview = [...(snapshot?.activities ?? [])].reverse().find((activity) => activity.method === 'review_campaign' && activity.success);
  const activeReview = activeTransaction?.method === 'review_campaign'
    ? activeTransaction
    : latestReviewActivity
      ? {
          hash: latestReviewActivity.hash,
          method: 'review_campaign',
          status: statusName(tx) !== 'NOT_STARTED' ? statusName(tx) : latestReviewActivity.status ?? 'UNKNOWN',
          tx: tx?.hash && String(tx.hash).toLowerCase() === latestReviewActivity.hash.toLowerCase() ? tx : null,
        }
      : null;
  const activeReviewStatus = activeReview?.status ?? statusName(activeReview?.tx);
  const activeReviewTerminal = Boolean(activeReview && terminalReviewStatuses.includes(activeReviewStatus));
  const pendingReview = activeReview && !activeReviewTerminal ? activeReview : null;
  const storedReviewHash = latestSuccessfulReview?.hash ?? (!latestReviewAttemptFailed && review && tx?.hash ? String(tx.hash) : undefined);
  const activeHashIsStoredReview = Boolean(
    !activeReview || !storedReviewHash || activeReview.hash.toLowerCase() === storedReviewHash.toLowerCase(),
  );
  const currentAttemptIsNew = Boolean(activeReview && storedReviewHash && activeReview.hash.toLowerCase() !== storedReviewHash.toLowerCase());
  const hasReview = Boolean(review);
  const copyNeedsReview = Boolean(isLastStored && snapshot?.state.status === 'SUBMITTED' && !currentAttemptIsNew);
  const awaitingReviewCall = Boolean(snapshot?.state.status === 'REVIEWING' && hasReview && !pendingReview && activeHashIsStoredReview && !latestReviewAttemptFailed);
  const hasCurrentReviewResult = hasReview && activeHashIsStoredReview && !awaitingReviewCall && !isLastStored;
  const failedReviewAttempt = Boolean(activeReview && activeReviewTerminal && (latestReviewAttemptFailed || !hasReview || !activeHashIsStoredReview));
  const transactionForDisplay = activeReview ? activeReview.tx : tx;
  const noCurrentReviewTransaction = copyNeedsReview || awaitingReviewCall;
  const receiptHash = noCurrentReviewTransaction ? '' : activeReview?.hash ?? (tx?.hash ? String(tx.hash) : '');
  const txStatus = activeReview ? activeReviewStatus : statusName(tx);
  const transactionConsensus = txStatus === 'FINALIZED' ? consensusName(transactionForDisplay) : null;
  const resultName = noCurrentReviewTransaction ? null : transactionConsensus;
  const votes = isLastStored && !currentAttemptIsNew ? {} : transactionForDisplay?.consensus_data?.votes ?? {};
  const agree = Object.values(votes).filter((vote) => String(vote).toLowerCase() === 'agree').length;
  const allVotes = Object.keys(votes).length;
  const verdict = review?.verdict ?? snapshot?.state.last_verdict;

  return (
    <section className="genlayer-review-section" aria-labelledby="genlayer-review-heading">
      <div className="review-section-head">
        <div>
          <div className="section-overline"><span>03</span> DECISION RECORD</div>
          <h2 id="genlayer-review-heading" className="section-title">GenLayer review</h2>
        </div>
        <span className="review-engine-label"><span className="review-engine-dot" /> INTELLIGENT CONTRACT</span>
      </div>

      <div className="review-flow" aria-label="Evidence retrieved, semantic comparison, validator review, consensus">
        <FlowStep label="EVIDENCE RETRIEVED" state={hasCurrentReviewResult ? 'done' : pendingReview ? 'live' : failedReviewAttempt ? 'gap' : 'waiting'} />
        <span className="flow-arrow">↓</span>
        <FlowStep label="SEMANTIC COMPARISON" state={hasCurrentReviewResult ? 'done' : pendingReview ? 'live' : failedReviewAttempt ? 'gap' : 'waiting'} value={hasCurrentReviewResult ? review?.semantic_alignment : pendingReview ? 'IN PROGRESS' : failedReviewAttempt ? 'NO STORED RESULT' : copyNeedsReview ? 'COPY NOT REVIEWED' : awaitingReviewCall ? 'AWAITING CALL' : undefined} />
        <span className="flow-arrow">↓</span>
        <FlowStep label="VALIDATOR REVIEW" state={resultName ? resultName === 'MAJORITY_AGREE' ? 'done' : 'gap' : pendingReview ? 'live' : failedReviewAttempt ? 'gap' : 'waiting'} value={pendingReview ? txStatus.replaceAll('_', ' ') : undefined} />
        <span className="flow-arrow">↓</span>
        <FlowStep label="CONSENSUS" state={resultName ? (resultName === 'MAJORITY_AGREE' ? 'done' : 'gap') : pendingReview ? 'live' : failedReviewAttempt ? 'gap' : 'waiting'} value={resultName ?? (pendingReview ? 'PENDING' : failedReviewAttempt ? txStatus : copyNeedsReview ? 'NO REVIEW FOR COPY' : awaitingReviewCall ? 'AWAITING REVIEW CALL' : 'NOT RECORDED')} />
      </div>

      {pendingReview && hasReview && isLastStored && (
        <div className="review-attempt-warning" role="status">
          <Icon name="document" size={14} />
          <span>The latest review transaction is {txStatus.replaceAll('_', ' ')}. The outcome below is the prior stored record until this attempt writes a new result.</span>
        </div>
      )}
      {copyNeedsReview && hasReview && (
        <div className="review-attempt-warning" role="status">
          <Icon name="document" size={14} />
          <span>The current copy has not been reviewed. The outcome below is stored for the previous copy.</span>
        </div>
      )}
      {failedReviewAttempt && hasReview && (
        <div className="review-attempt-warning" role="status">
          <Icon name="alert" size={14} />
          <span>The latest review transaction ended in {resultName ?? txStatus}. It did not replace the stored evidence record below.</span>
        </div>
      )}
      {awaitingReviewCall && (
        <div className="review-attempt-warning" role="status">
          <Icon name="document" size={14} />
          <span>The campaign is in REVIEWING. Submit the next contract review call to retrieve new evidence; the outcome below is the last stored result.</span>
        </div>
      )}

      {hasReview ? (
        <div className={`verdict-record verdict-${String(verdict).toLowerCase()}`}>
          <div className="verdict-topline">
            <div>
              <span className="fact-label">{hasCurrentReviewResult ? 'STRUCTURED CONTRACT OUTCOME' : 'LAST STORED CONTRACT OUTCOME'}</span>
              <div className="verdict-wordmark">{verdict ?? 'INCONCLUSIVE'}</div>
            </div>
            <span className={`verdict-symbol verdict-symbol-${String(verdict).toLowerCase()}`} aria-hidden="true">
              {verdict === 'CLEARED' ? <Icon name="check" size={20} /> : verdict === 'FLAGGED' ? '!' : '…'}
            </span>
          </div>
          <div className="verdict-fields">
            <div><span>SEMANTIC ALIGNMENT</span><strong>{review?.semantic_alignment ?? 'UNCLEAR'}</strong></div>
            <div><span>CONDITION</span><strong>{review?.condition_status ?? 'UNVERIFIED'}</strong></div>
            <div><span>REASON CODE</span><strong className="reason-code">{review?.reason_code ?? '—'}</strong></div>
          </div>
          {review?.evidence_digest && (
            <div className="review-digest-row">
              <span>EVIDENCE DIGEST</span><code title={review.evidence_digest}>{shortAddress(review.evidence_digest, 12, 10)}</code>
            </div>
          )}
          <div className="review-disclaimer">NOT LEGAL APPROVAL OR CERTIFICATION.</div>
        </div>
      ) : (
        <div className="review-awaiting">
          <span className="awaiting-index">—</span>
          <div>
            <strong>{pendingReview ? 'Review transaction is in progress.' : failedReviewAttempt ? 'Review attempt ended without a new evidence record.' : 'No review result on record.'}</strong>
            <p>{pendingReview ? 'Evidence and validator status below are refreshed from the submitted transaction.' : failedReviewAttempt ? `${txStatus.replaceAll('_', ' ')} · ${resultName ?? 'No consensus result'}; refresh the contract before retrying.` : 'The verdict appears here only after the IC review transaction finalizes.'}</p>
          </div>
        </div>
      )}

      <div className="consensus-receipt">
        <div className="receipt-label">
          <span className={`receipt-indicator ${resultName === 'MAJORITY_AGREE' ? 'receipt-indicator-good' : resultName ? 'receipt-indicator-other' : 'receipt-indicator-waiting'}`} />
          <span>CONSENSUS RECEIPT</span>
        </div>
        <div className="receipt-result">
          <strong>{resultName ?? (pendingReview ? 'AWAITING FINALITY' : failedReviewAttempt ? txStatus : copyNeedsReview ? 'AWAITING COPY REVIEW' : awaitingReviewCall ? 'AWAITING REVIEW CALL' : 'NOT LINKED')}</strong>
          {allVotes > 0 && <span>{agree} / {allVotes} validator votes agree</span>}
        </div>
        {receiptHash ? (
          <a href={explorerTx(receiptHash)} target="_blank" rel="noreferrer" className="receipt-link">
            {shortAddress(receiptHash, 8, 6)} <Icon name="external" size={12} />
          </a>
        ) : (
          <span className="receipt-note">{copyNeedsReview ? 'A review transaction for this copy has not been submitted.' : awaitingReviewCall ? 'A new consensus receipt appears after review_campaign finalizes.' : 'A review tx hash is discovered from Studionet transaction history.'}</span>
        )}
      </div>
    </section>
  );
}

function FlowStep({
  label,
  state,
  value,
}: {
  label: string;
  state: 'done' | 'live' | 'waiting' | 'gap';
  value?: string;
}) {
  return (
    <div className={`flow-step flow-${state}`}>
      <span className="flow-step-dot">{state === 'done' ? <Icon name="check" size={10} /> : state === 'gap' ? '!' : ''}</span>
      <span className="flow-step-label">{label}</span>
      {value && <strong className="flow-step-value">{value}</strong>}
    </div>
  );
}
