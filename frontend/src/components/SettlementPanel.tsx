import { formatGen, humanDate, isExactSettlementTransfer, latestPendingActivity, shortAddress, statusName } from '../lib/genlayer';
import type { CampaignActivity, CampaignSnapshot } from '../lib/types';
import { Icon } from './Icons';

type Props = {
  snapshot: CampaignSnapshot | null;
  isLastStored: boolean;
  walletAddress: string | null;
  role: string;
  correctNetwork: boolean;
  busy: boolean;
  activeHash?: string;
  onOpenCampaign: () => void;
  onFund: () => void;
  onBeginReview: () => void;
  onRunReview: () => void;
  onTimeoutRefund: () => void;
  onRetrySettlement: () => void;
  explorerTx: (hash: string) => string;
};

export function SettlementPanel({
  snapshot,
  isLastStored,
  walletAddress,
  role,
  correctNetwork,
  busy,
  activeHash,
  onOpenCampaign,
  onFund,
  onBeginReview,
  onRunReview,
  onTimeoutRefund,
  onRetrySettlement,
  explorerTx,
}: Props) {
  const state = snapshot?.state;
  const status = state?.status ?? 'DRAFT';
  const verdict = snapshot?.reviews.at(-1)?.verdict ?? state?.last_verdict;
  const brand = state?.brand;
  const creator = state?.creator;
  const reward = state?.reward_wei ?? '0';
  const escrow = snapshot?.balanceWei ?? state?.escrow_wei ?? '0';
  const failedDepositRefundWei = String(state?.failed_refund_wei ?? '0');
  const hasFailedDepositRefund = isPositiveWei(failedDepositRefundWei);
  const revisionRemaining = state?.status === 'REVISION_ALLOWED'
    ? 1
    : ['FUNDED', 'SUBMITTED', 'REVIEWING'].includes(state?.status ?? '') && Number(state?.revision_count ?? 0) === 0
      ? 1
      : 0;
  const canSettle = role === 'brand' || role === 'creator';
  const refundAt = refundDeadline(state?.status, state?.submission_deadline_ts, state?.resolution_deadline_ts);
  const canRefund = Boolean(refundAt && snapshot?.chainTimestamp && snapshot.chainTimestamp > refundAt);
  const deadline = state?.submission_deadline_ts ? Number(state.submission_deadline_ts) : 0;
  const expired = Boolean(deadline && snapshot?.chainTimestamp && snapshot.chainTimestamp > deadline);
  const title = isLastStored ? '' : finalTitle(status, verdict);
  const settlementChild = snapshot?.settlementChildren.at(-1);
  const expectedRecipient = status === 'PAID' ? creator : status === 'REFUNDED' ? brand : undefined;
  const settlementVerified = isExactSettlementTransfer(settlementChild, expectedRecipient, reward);
  const depositRefundParent = status === 'DRAFT'
    ? [...(snapshot?.activities ?? [])].reverse().find((item) =>
        ['fund_campaign', 'retry_failed_settlement'].includes(item.method) &&
        item.status === 'FINALIZED' &&
        item.success !== false,
      )
    : undefined;
  const savedDepositRefundRecipient = String(state?.failed_refund_recipient ?? '');
  const depositRefundRecipient = savedDepositRefundRecipient && !/^0x0+$/i.test(savedDepositRefundRecipient) ? savedDepositRefundRecipient : brand;
  const depositRefundVerified = Boolean(
    depositRefundParent && settlementChild && statusName(settlementChild) === 'FINALIZED' && settlementChild.value_credited === true &&
    String(settlementChild.to_address ?? settlementChild.recipient ?? '').toLowerCase() === String(depositRefundRecipient ?? '').toLowerCase(),
  );

  return (
    <aside className="settlement-column" aria-label="Campaign settlement">
      <section className="settlement-panel">
        <div className="settlement-panel-head">
          <div className="section-overline"><span>07</span> SETTLEMENT</div>
          <span className="settlement-pin"><Icon name="lock" size={13} /> ESCROW</span>
        </div>

        <div className={`settlement-state settlement-${String(isLastStored ? status : verdict ?? status).toLowerCase()}`}>
          <span className="fact-label">CONTRACT STATE</span>
          <h2>{status}</h2>
          {title && <p>{title}</p>}
        </div>

        {verdict && verdict !== 'NONE' && (
          <div className={`settlement-verdict verdict-chip-${String(verdict).toLowerCase()}`}>
            <span>{isLastStored ? 'LAST STORED VERDICT' : 'VERDICT'}</span><strong>{verdict}</strong>
          </div>
        )}

        <div className="settlement-rule" />

        <div className="settlement-amount-block">
          <span className="fact-label">CAMPAIGN REWARD</span>
          <div className="settlement-amount">{formatGen(reward)} <small>GEN</small></div>
          <div className="escrow-held-line">
            <span>CONTRACT BALANCE</span>
            <strong>{formatGen(escrow)} GEN</strong>
          </div>
        </div>

        {(status === 'PAID' || status === 'REFUNDED') && (
          <div className={`settlement-proof ${settlementVerified ? 'settlement-proof-verified' : 'settlement-proof-waiting'}`}>
            <span className="proof-ledger-dot" />
            <div>
              <strong>{settlementVerified ? 'TRANSFER VERIFIED' : 'TRANSFER RECEIPT PENDING'}</strong>
              <span>{settlementVerified ? `${formatGen(String(settlementChild?.value ?? reward))} GEN · exact amount and recipient` : 'Contract status is not treated as a payment receipt.'}</span>
            </div>
            {settlementChild?.hash && <a href={explorerTx(String(settlementChild.hash))} target="_blank" rel="noreferrer" aria-label="Open settlement transfer"><Icon name="external" size={12} /></a>}
          </div>
        )}
        {depositRefundParent && (
          <div className={`settlement-proof ${hasFailedDepositRefund ? 'settlement-proof-waiting' : depositRefundVerified ? 'settlement-proof-verified' : 'settlement-proof-waiting'}`}>
            <span className="proof-ledger-dot" />
            <div>
              <strong>{hasFailedDepositRefund ? 'DEPOSIT REFUND FAILED' : depositRefundVerified ? 'DEPOSIT REFUND VERIFIED' : 'DEPOSIT REFUND RECEIPT PENDING'}</strong>
              <span>{hasFailedDepositRefund
                ? `${formatGen(failedDepositRefundWei)} GEN remains recorded for retry to ${shortAddress(depositRefundRecipient, 8, 5)}.`
                : depositRefundVerified
                  ? `${formatGen(String(settlementChild?.value ?? '0'))} GEN · finalized child credited to ${shortAddress(depositRefundRecipient, 8, 5)}.`
                  : `Child receipt ${settlementChild ? statusName(settlementChild) : 'not yet available'}; credit to the brand is not yet verified.`}</span>
            </div>
            {settlementChild?.hash && <a href={explorerTx(String(settlementChild.hash))} target="_blank" rel="noreferrer" aria-label="Open deposit refund transfer"><Icon name="external" size={12} /></a>}
          </div>
        )}

        <div className="settlement-parties">
          <Party label="BRAND / DEPLOYER" address={brand} active={role === 'brand'} />
          <Party label="CREATOR" address={creator} active={role === 'creator'} />
        </div>

        <div className="revision-count-row">
          <span>REVISION</span>
          <strong>{revisionRemaining} <small>OF 1 REMAINING</small></strong>
        </div>

        <ActionBlock
          status={status}
          campaignCreated={Boolean(state?.campaign_created)}
          failedDepositRefund={hasFailedDepositRefund}
          failedDepositRefundWei={failedDepositRefundWei}
          activities={snapshot?.activities ?? []}
          canSettle={canSettle}
          isBrand={role === 'brand'}
          correctNetwork={correctNetwork}
          connected={Boolean(walletAddress)}
          expired={expired}
          canRefund={canRefund}
          refundAt={refundAt}
          busy={busy}
          onOpenCampaign={onOpenCampaign}
          onFund={onFund}
          onBeginReview={onBeginReview}
          onRunReview={onRunReview}
          onTimeoutRefund={onTimeoutRefund}
          onRetrySettlement={onRetrySettlement}
        />

        {activeHash && (
          <a className="last-tx-link" href={explorerTx(activeHash)} target="_blank" rel="noreferrer">
            <span>LAST ACTION</span><b>{shortAddress(activeHash, 8, 6)}</b><Icon name="external" size={12} />
          </a>
        )}

        <p className="settlement-disclaimer">Not legal approval or certification.</p>
      </section>
      <p className="settlement-side-note">Funds move only through finalized contract transactions. A verdict is not a payment receipt.</p>
    </aside>
  );
}

function Party({ label, address, active }: { label: string; address?: string; active: boolean }) {
  return (
    <div className="settlement-party">
      <span className="settlement-party-label">{label}</span>
      <div>
        <strong title={address}>{shortAddress(address, 8, 5)}</strong>
        {active && <span className="you-marker">YOU</span>}
      </div>
    </div>
  );
}

function ActionBlock({
  status,
  campaignCreated,
  failedDepositRefund,
  failedDepositRefundWei,
  activities,
  canSettle,
  isBrand,
  correctNetwork,
  connected,
  expired,
  canRefund,
  refundAt,
  busy,
  onOpenCampaign,
  onFund,
  onBeginReview,
  onRunReview,
  onTimeoutRefund,
  onRetrySettlement,
}: {
  status: string;
  campaignCreated: boolean;
  failedDepositRefund: boolean;
  failedDepositRefundWei: string;
  activities: CampaignActivity[];
  canSettle: boolean;
  isBrand: boolean;
  correctNetwork: boolean;
  connected: boolean;
  expired: boolean;
  canRefund: boolean;
  refundAt: number;
  busy: boolean;
  onOpenCampaign: () => void;
  onFund: () => void;
  onBeginReview: () => void;
  onRunReview: () => void;
  onTimeoutRefund: () => void;
  onRetrySettlement: () => void;
}) {
  const pendingFor = (method: CampaignActivity['method']) => latestPendingActivity(activities, method);
  if (!campaignCreated) {
    const pendingCreate = pendingFor('create_campaign');
    return pendingCreate
      ? <PendingActionMessage activity={pendingCreate} label="Campaign term lock" />
      : <ActionMessage text="A campaign has not been configured on this instance." action="Configure campaign" onAction={onOpenCampaign} busy={busy} />;
  }
  if (failedDepositRefund) {
    const pendingRetry = pendingFor('retry_failed_settlement');
    if (pendingRetry) return <PendingActionMessage activity={pendingRetry} label="Deposit refund retry" />;
    return connected && correctNetwork
      ? <ActionButton label="Retry deposit refund" helper="Resends the recorded recipient and amount." onClick={onRetrySettlement} disabled={busy} />
      : <ActionMessage text={`A failed deposit refund of ${formatGen(failedDepositRefundWei)} GEN is recorded. Connect any wallet on Studionet to retry the saved transfer.`} />;
  }
  if (status === 'DRAFT') {
    const pendingFunding = pendingFor('fund_campaign');
    if (pendingFunding) return <PendingActionMessage activity={pendingFunding} label="Escrow funding" />;
    if (campaignCreated && expired) {
      return <ActionMessage text="The unfunded campaign passed its submission window and cannot be funded. A fresh contract instance is required." action="Deploy a fresh campaign" onAction={onOpenCampaign} busy={busy} />;
    }
    return isBrand
      ? <ActionButton label="Fund exact reward" helper="Only the agreed amount is accepted." onClick={onFund} disabled={busy || !correctNetwork} />
      : <ActionMessage text="The brand must fund the exact reward before the creator can submit." />;
  }
  if (status === 'SUBMITTED') {
    const pendingReviewOpen = pendingFor('begin_review');
    if (pendingReviewOpen) return <PendingActionMessage activity={pendingReviewOpen} label="Review opening" />;
    return canSettle
      ? <ActionButton label="Start review" helper="Moves the copy into REVIEWING." onClick={onBeginReview} disabled={busy || !correctNetwork} />
      : <ActionMessage text="The campaign parties can start the review." />;
  }
  if (status === 'REVIEWING') {
    const pendingReview = pendingFor('review_campaign');
    if (pendingReview) return <PendingActionMessage activity={pendingReview} label="GenLayer review" />;
    return canSettle
      ? <ActionButton label="Run GenLayer review" helper="The IC retrieves evidence and validators compare the result." onClick={onRunReview} disabled={busy || !correctNetwork} />
      : <ActionMessage text="GenLayer review requires a campaign party to submit the call." />;
  }
  if (status === 'REVISION_ALLOWED') {
    if (expired) {
      const pendingRefund = pendingFor('refund_after_timeout');
      if (pendingRefund) return <PendingActionMessage activity={pendingRefund} label="Timeout refund" />;
      return canRefund
        ? timeoutRefundAction('Refund after deadline', 'The creator did not use the revision window.', connected, correctNetwork, busy, onTimeoutRefund)
        : <ActionMessage text={refundAt ? `The revision window has passed. Refund opens after ${humanDate(refundAt)}.` : 'The revision window has passed; refresh the contract clock.'} />;
    }
    return <ActionMessage text="One creator revision is available. The reward remains escrowed." />;
  }
  if (status === 'INCONCLUSIVE') {
    const pendingRefund = pendingFor('refund_after_timeout');
    if (pendingRefund) return <PendingActionMessage activity={pendingRefund} label="Timeout refund" />;
    return canRefund
      ? timeoutRefundAction('Refund after timeout', 'Permissionless timeout path is now open.', connected, correctNetwork, busy, onTimeoutRefund)
      : <ActionMessage text={refundAt ? `No payout on inconclusive evidence. Refund unlocks after ${humanDate(refundAt)}.` : 'No payout on inconclusive evidence. Refund follows the resolution timeout.'} />;
  }
  if (status === 'FUNDED') {
    if (expired) {
      const pendingRefund = pendingFor('refund_after_timeout');
      if (pendingRefund) return <PendingActionMessage activity={pendingRefund} label="Timeout refund" />;
      return canRefund
        ? timeoutRefundAction('Refund after deadline', 'No copy was submitted before the deadline.', connected, correctNetwork, busy, onTimeoutRefund)
        : <ActionMessage text={refundAt ? `No submission is on record. Refund opens after ${humanDate(refundAt)}.` : 'Submission deadline has passed; refresh the contract clock.'} />;
    }
    return <ActionMessage text="Waiting for the named creator to submit text-only copy." />;
  }
  if (status === 'PAYOUT_FAILED' || status === 'REFUND_FAILED') {
    const pendingRetry = pendingFor('retry_failed_settlement');
    if (pendingRetry) return <PendingActionMessage activity={pendingRetry} label="Settlement retry" />;
    return connected && correctNetwork
      ? <ActionButton label="Retry failed settlement" helper="Resends only the recorded recipient and amount." onClick={onRetrySettlement} disabled={busy} />
      : <ActionMessage text="The transfer needs a retry. Any wallet may submit it when connected to Studionet." />;
  }
  if (status === 'PAID') return <ActionMessage text="The IC recorded PAID. Confirm the finalized transfer receipt below." />;
  if (status === 'REFUNDED') return <ActionMessage text="The IC recorded REFUNDED. Confirm the brand refund receipt below." />;
  if (!connected) return <ActionMessage text="Connect a wallet to submit a campaign action." />;
  if (!correctNetwork) return <ActionMessage text="Switch the connected wallet to Studionet to write." />;
  return <ActionMessage text={`Contract state: ${status.replaceAll('_', ' ').toLowerCase()}.`} />;
}

function ActionButton({ label, helper, onClick, disabled }: { label: string; helper: string; onClick: () => void; disabled: boolean }) {
  return (
    <div className="settlement-action-wrap">
      <button className="settlement-action-button" type="button" onClick={onClick} disabled={disabled}>
        {label} <Icon name="arrow" size={14} />
      </button>
      <span className="settlement-action-helper">{helper}</span>
    </div>
  );
}

function timeoutRefundAction(
  label: string,
  helper: string,
  connected: boolean,
  correctNetwork: boolean,
  busy: boolean,
  onClick: () => void,
) {
  if (!connected) return <ActionMessage text="The timeout window is open. Connect any wallet to Studionet to submit this permissionless refund." />;
  if (!correctNetwork) return <ActionMessage text="The timeout window is open. Switch the connected wallet to Studionet before signing the refund." />;
  return <ActionButton label={label} helper={helper} onClick={onClick} disabled={busy} />;
}

function PendingActionMessage({ activity, label }: { activity: CampaignActivity; label: string }) {
  return <ActionMessage text={`${label} transaction is still ${activity.status?.replaceAll('_', ' ').toLowerCase() ?? 'pending'} (TX ${shortAddress(activity.hash, 8, 5)}). Wait for finality or refresh; do not submit it again.`} />;
}

function ActionMessage({ text, action, onAction, busy }: { text: string; action?: string; onAction?: () => void; busy?: boolean }) {
  return (
    <div className="settlement-action-message">
      <p>{text}</p>
      {action && onAction && <button type="button" className="settlement-action-button" onClick={onAction} disabled={busy}>{action} <Icon name="arrow" size={14} /></button>}
    </div>
  );
}

function isPositiveWei(value: string): boolean {
  try { return BigInt(value) > 0n; } catch { return false; }
}

function refundDeadline(status?: string, submission?: string, resolution?: string): number {
  if (status === 'FUNDED' || status === 'REVISION_ALLOWED') return Number(submission ?? 0);
  if (['SUBMITTED', 'REVIEWING', 'INCONCLUSIVE'].includes(status ?? '')) return Number(resolution ?? 0);
  return 0;
}

function finalTitle(status: string, verdict?: string): string {
  if (status === 'PAID') return 'CAMPAIGN CONDITION MET';
  if (status === 'REFUNDED' && verdict === 'FLAGGED') return 'CAMPAIGN CONDITION NOT MET';
  if (status === 'INCONCLUSIVE' || verdict === 'INCONCLUSIVE') return 'EVIDENCE INSUFFICIENT';
  if (status === 'REFUNDED') return 'REWARD RETURNED TO BRAND';
  return '';
}

