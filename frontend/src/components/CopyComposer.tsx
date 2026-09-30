import { useEffect, useState } from 'react';
import { consensusName, latestPendingActivity, statusName } from '../lib/genlayer';
import type { CampaignSnapshot, GenLayerTransaction } from '../lib/types';
import { Icon } from './Icons';

const REFERENCE_CLAIM = 'Folate has a role in the process of cell division';
const MAX_COPY_CHARS = 2_000;

type ActiveTransaction = {
  hash: string;
  method: string;
  status: string;
  tx?: GenLayerTransaction | null;
} | null;

type Props = {
  snapshot: CampaignSnapshot | null;
  activeTransaction: ActiveTransaction;
  isLastStored: boolean;
  campaignAddress: string;
  walletAddress: string | null;
  role: string;
  correctNetwork: boolean;
  busy: boolean;
  onSubmit: (copy: string) => Promise<boolean | void>;
};

export function CopyComposer({
  snapshot,
  activeTransaction,
  isLastStored,
  campaignAddress,
  walletAddress,
  role,
  correctNetwork,
  busy,
  onSubmit,
}: Props) {
  const state = snapshot?.state;
  const status = state?.status ?? 'DRAFT';
  const isRevision = status === 'REVISION_ALLOWED';
  const canEditState = status === 'FUNDED' || isRevision;
  const isCreator = role === 'creator';
  const deadline = Number(state?.submission_deadline_ts ?? 0);
  const stillOpen = Boolean(snapshot?.chainTimestamp && snapshot.chainTimestamp <= deadline);
  const onchainCopy = snapshot?.copy ?? '';
  const pendingSubmission = latestPendingActivity(snapshot?.activities ?? [], 'submit_copy');
  const previousCopyKey = `campaign-escrow:previous-copy:${campaignAddress.toLowerCase()}`;
  const [draft, setDraft] = useState('');
  const [previousCopy, setPreviousCopy] = useState('');
  const [localError, setLocalError] = useState('');
  const claimText = snapshot?.reviews.at(-1)?.claim_text || REFERENCE_CLAIM;

  useEffect(() => {
    if (isRevision && onchainCopy) {
      try {
        const saved = localStorage.getItem(previousCopyKey);
        if (!saved) localStorage.setItem(previousCopyKey, onchainCopy);
        setPreviousCopy(saved || onchainCopy);
      } catch {
        setPreviousCopy(onchainCopy);
      }
    } else {
      try {
        setPreviousCopy(localStorage.getItem(previousCopyKey) ?? '');
      } catch {
        setPreviousCopy('');
      }
    }
  }, [isRevision, onchainCopy, previousCopyKey]);

  const eligible = canEditState && isCreator && Boolean(walletAddress) && correctNetwork && stillOpen && !pendingSubmission;
  const disabledReason = !walletAddress
    ? 'Connect the named creator wallet to submit copy.'
    : !correctNetwork
      ? 'Switch to Studionet before signing.'
      : !isCreator
        ? 'Only the creator wallet fixed at campaign creation can submit.'
        : !canEditState
          ? 'The campaign is not accepting copy in its current state.'
          : pendingSubmission
            ? `A copy transaction is still ${(pendingSubmission.status ?? 'PENDING').replaceAll('_', ' ')}. Wait for finality before retrying.`
            : !stillOpen
              ? 'The submission deadline has passed.'
              : '';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    if (!eligible) return;
    if (!draft.trim()) {
      setLocalError('Add campaign copy before submitting.');
      return;
    }
    if (draft.length > MAX_COPY_CHARS) {
      setLocalError('Copy exceeds the contract’s 2,000-character limit.');
      return;
    }
    if (isRevision && onchainCopy) {
      try {
        localStorage.setItem(previousCopyKey, onchainCopy);
        setPreviousCopy(onchainCopy);
      } catch {
        // This is a local convenience only; the contract stores the copy hash and current copy.
      }
    }
    const completed = await onSubmit(draft);
    if (completed !== false) setDraft('');
  }

  return (
    <section className="copy-composer-section" aria-labelledby="copy-composer-heading">
      <div className="copy-composer-head">
        <div>
          <div className="section-overline"><span>05</span> CREATOR WORKFLOW</div>
          <h2 id="copy-composer-heading" className="section-title">Copy submission</h2>
        </div>
        {isRevision && <span className="revision-flag"><span /> ONE REVISION AVAILABLE</span>}
      </div>

      {canEditState && isCreator ? (
        <>
          {isRevision && (
            <div className="previous-copy-block">
              <div className="previous-copy-label"><span>PREVIOUS COPY</span><span>ON-CHAIN HASH {shortHash(state?.copy_sha256)}</span></div>
              {previousCopy ? (
                <p>{previousCopy}</p>
              ) : (
                <p className="previous-copy-unavailable">The contract stores the current copy and its hash only. This earlier text was not saved in this browser session.</p>
              )}
            </div>
          )}

          <div className="fixed-claim-reference">
            <span className="claim-reference-label"><Icon name="lock" size={12} /> FIXED CAMPAIGN CLAIM · {state?.claim_code ?? 'POL-HC-6377'}</span>
            <p>“{claimText}”</p>
            <span className="claim-reference-note">Display reference only. The IC retrieves the authoritative record again during review.</span>
          </div>

          <form onSubmit={handleSubmit} className="copy-form">
            <label className="fact-label" htmlFor="campaign-copy">YOUR ADVERTISING COPY</label>
            <textarea
              id="campaign-copy"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={MAX_COPY_CHARS + 50}
              placeholder="Write the exact text you intend to publish…"
              rows={5}
              aria-describedby="copy-helper copy-count"
            />
            <div className="copy-form-footer">
              <p id="copy-helper">Your copy will be evaluated against the fixed campaign claim and product evidence.</p>
              <span id="copy-count" className={draft.length > MAX_COPY_CHARS ? 'count-over' : ''}>{draft.length.toLocaleString()} / {MAX_COPY_CHARS}</span>
            </div>
            {localError && <p className="inline-error" role="alert">{localError}</p>}
            <div className="copy-submit-row">
              <span className="copy-submit-note">COPY IS SUBMITTED ONLY AFTER WALLET CONFIRMATION</span>
              <button className="primary-action" type="submit" disabled={!eligible || busy || !draft.trim() || draft.length > MAX_COPY_CHARS}>
                {busy ? 'Awaiting transaction…' : isRevision ? 'Submit one revision' : 'Submit copy'}
                <Icon name="arrow" size={15} />
              </button>
            </div>
            {disabledReason && <p className="composer-disabled-note">{disabledReason}</p>}
          </form>
        </>
      ) : onchainCopy ? (
        <div className="submitted-copy-record">
          <div className="submitted-copy-header">
            <span>TEXT ON CONTRACT</span>
            <code>{shortHash(state?.copy_sha256)}</code>
          </div>
          <blockquote>{onchainCopy}</blockquote>
          <div className="submitted-copy-footer">
            <span>{onchainCopy.length.toLocaleString()} characters</span>
            <span>{state?.revision_count ? 'REVISION SUBMITTED' : 'ORIGINAL SUBMISSION'}</span>
          </div>
        </div>
      ) : (
        <div className="composer-placeholder">
          <span className="composer-placeholder-mark">—</span>
          <div>
            <strong>{status === 'FUNDED' ? 'Awaiting creator submission.' : 'Copy submission is not open.'}</strong>
            <p>{status === 'FUNDED' ? 'Connect the named creator wallet to submit text-only copy.' : 'The campaign must be funded before the creator can submit.'}</p>
          </div>
        </div>
      )}

      <CopyLifecycle snapshot={snapshot} activeTransaction={activeTransaction} isLastStored={isLastStored} />
    </section>
  );
}

function CopyLifecycle({ snapshot, activeTransaction, isLastStored }: { snapshot: CampaignSnapshot | null; activeTransaction: ActiveTransaction; isLastStored: boolean }) {
  const state = snapshot?.state;
  const status = state?.status ?? 'DRAFT';
  const copyOnChain = Boolean(snapshot?.copy);
  const copyOnChainForCurrentSubmission = copyOnChain && status !== 'REVISION_ALLOWED';
  const recoveredSubmit = latestPendingActivity(snapshot?.activities ?? [], 'submit_copy');
  const submitAttempt = activeTransaction?.method === 'submit_copy'
    ? activeTransaction
    : recoveredSubmit ? { hash: recoveredSubmit.hash, method: 'submit_copy', status: recoveredSubmit.status ?? 'PENDING', tx: null } : null;
  const submitTerminal = Boolean(submitAttempt && ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(submitAttempt.status));
  const review = snapshot?.reviews.at(-1);
  const reviewAttempt = activeTransaction?.method === 'review_campaign' ? activeTransaction : null;
  const reviewTx = reviewAttempt ? reviewAttempt.tx : snapshot?.reviewTransaction;
  const latestReviewActivity = [...(snapshot?.activities ?? [])].reverse().find((item) => item.method === 'review_campaign');
  const latestReviewAttemptFailed = latestReviewActivity?.success === false;
  const latestSuccessfulReview = [...(snapshot?.activities ?? [])].reverse().find((item) => item.method === 'review_campaign' && item.success);
  const reviewStatus = reviewAttempt?.status ?? (statusName(reviewTx) !== 'NOT_STARTED' ? statusName(reviewTx) : latestReviewActivity?.status ?? 'NOT_STARTED');
  const consensus = reviewStatus === 'FINALIZED' ? consensusName(reviewTx) : null;
  const verdict = review?.verdict ?? (state?.last_verdict && state.last_verdict !== 'NONE' ? state.last_verdict : undefined);
  const reviewStored = Boolean(review);
  const reviewStarted = status === 'REVIEWING' || reviewStored;
  const storedReviewHash = latestSuccessfulReview?.hash ?? (!latestReviewAttemptFailed && reviewStored && reviewTx?.hash ? String(reviewTx.hash) : undefined);
  const attemptHash = reviewAttempt?.hash ?? latestReviewActivity?.hash ?? (reviewTx?.hash ? String(reviewTx.hash) : undefined);
  const currentAttemptIsNew = Boolean(storedReviewHash && attemptHash && storedReviewHash.toLowerCase() !== attemptHash.toLowerCase());
  const terminalStatuses = ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'];
  const inFlight = (method: string) => activeTransaction?.method === method && !terminalStatuses.includes(activeTransaction.status);
  const currentAttemptPending = Boolean(
    currentAttemptIsNew && !terminalStatuses.includes(reviewStatus) ||
    !reviewStored && status === 'REVIEWING' && reviewTx && !terminalStatuses.includes(reviewStatus),
  );
  const awaitingReviewCall = status === 'REVIEWING' && isLastStored && !currentAttemptIsNew && !currentAttemptPending && !latestReviewAttemptFailed;
  const currentAttemptConsensus = isLastStored
    ? latestReviewAttemptFailed
      ? consensus ?? `NO CONSENSUS · ${reviewStatus.replaceAll('_', ' ')}`
      : currentAttemptIsNew
        ? consensus ?? (currentAttemptPending ? reviewStatus.replaceAll('_', ' ') : `NO CONSENSUS · ${reviewStatus.replaceAll('_', ' ')}`)
        : awaitingReviewCall ? 'AWAITING REVIEW CALL' : 'NOT RECORDED'
    : consensus ?? (inFlight('review_campaign') ? reviewStatus.replaceAll('_', ' ') : 'WAITING');
  const steps = [
    {
      label: 'WALLET CONFIRMATION',
      value: copyOnChainForCurrentSubmission ? 'CONFIRMED' : submitAttempt ? submitAttempt.status : 'WAITING',
      state: copyOnChainForCurrentSubmission ? 'done' : submitAttempt ? submitTerminal && submitAttempt.status !== 'FINALIZED' ? 'failed' : 'current' : 'pending',
    },
    {
      label: 'SUBMITTED',
      value: copyOnChainForCurrentSubmission ? 'ON CHAIN' : submitAttempt?.status === 'FINALIZED' ? 'REFRESHING STATE' : 'WAITING',
      state: copyOnChainForCurrentSubmission ? 'done' : submitAttempt?.status === 'FINALIZED' ? 'current' : 'pending',
    },
    {
      label: 'GENLAYER REVIEW',
      value: latestReviewAttemptFailed
        ? `ATTEMPT FAILED · ${reviewStatus.replaceAll('_', ' ')}`
        : isLastStored
          ? status === 'SUBMITTED' && !currentAttemptIsNew ? 'COPY NOT REVIEWED' : awaitingReviewCall ? 'AWAITING REVIEW CALL' : currentAttemptIsNew ? `ATTEMPT · ${reviewStatus.replaceAll('_', ' ')}` : 'LAST STORED'
          : inFlight('review_campaign') ? reviewStatus.replaceAll('_', ' ') : reviewStored ? 'RECORDED' : reviewStarted ? 'IN REVIEW' : 'WAITING',
      state: latestReviewAttemptFailed ? 'failed' : isLastStored ? currentAttemptPending || awaitingReviewCall ? 'current' : 'gap' : inFlight('review_campaign') ? 'current' : reviewStored ? 'done' : reviewStarted ? 'current' : 'pending',
    },
    {
      label: 'CONSENSUS',
      value: currentAttemptConsensus,
      state: isLastStored ? currentAttemptPending || awaitingReviewCall ? 'current' : 'gap' : consensus ? consensus === 'MAJORITY_AGREE' ? 'done' : 'gap' : inFlight('review_campaign') ? 'current' : 'pending',
    },
    {
      label: 'RESULT',
      value: isLastStored ? verdict ? `LAST STORED · ${verdict}` : 'NO STORED RESULT' : verdict ?? 'WAITING',
      state: isLastStored ? 'gap' : verdict ? verdict === 'INCONCLUSIVE' ? 'gap' : 'done' : 'pending',
    },
  ] as const;

  return (
    <div className="copy-lifecycle" aria-label="Wallet confirmation to campaign result lifecycle">
      {steps.map((step, index) => (
        <div className={`copy-lifecycle-step lifecycle-${step.state}`} key={step.label}>
          <span className="copy-lifecycle-index">0{index + 1}</span>
          <span className="copy-lifecycle-label">{step.label}</span>
          <strong>{step.value}</strong>
        </div>
      ))}
    </div>
  );
}

function shortHash(value?: string): string {
  if (!value) return 'NOT RECORDED';
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}
