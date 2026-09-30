import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { formatGen, parseGenAmount, parseTimeWindow, shortAddress } from '../lib/genlayer';
import type { CampaignSnapshot } from '../lib/types';
import { Icon } from './Icons';

export interface LockCampaignInput {
  creatorAddress: string;
  rewardWei: bigint;
  submissionWindowSeconds: number;
}

type Props = {
  open: boolean;
  snapshot: CampaignSnapshot | null;
  contractAddress: string;
  walletAddress: string | null;
  walletAvailable: boolean;
  walletBalance: bigint | null;
  correctNetwork: boolean;
  onConnectWallet: () => void;
  onSwitchNetwork: () => void;
  busy: boolean;
  progress: string;
  error: string;
  onClose: () => void;
  onSubmit: (input: LockCampaignInput) => Promise<void>;
};

export function CreateCampaignDialog({
  open,
  snapshot,
  contractAddress,
  walletAddress,
  walletAvailable,
  walletBalance,
  correctNetwork,
  onConnectWallet,
  onSwitchNetwork,
  busy,
  progress,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [creatorAddress, setCreatorAddress] = useState('');
  const [reward, setReward] = useState('0.001');
  const [windowDays, setWindowDays] = useState('7');
  const [formError, setFormError] = useState('');

  const state = snapshot?.state;
  const isCurrentEmptyBrandInstance = Boolean(
    state && state.status === 'DRAFT' && !state.campaign_created && walletAddress && state.brand.toLowerCase() === walletAddress.toLowerCase(),
  );
  const expiredConfiguredDraft = Boolean(
    state?.campaign_created &&
    state.status === 'DRAFT' &&
    snapshot?.chainTimestamp &&
    Number(state.submission_deadline_ts) > 0 &&
    snapshot.chainTimestamp > Number(state.submission_deadline_ts),
  );
  const termsLocked = Boolean(state?.campaign_created && state.status === 'DRAFT' && !expiredConfiguredDraft && walletAddress && state.brand.toLowerCase() === walletAddress.toLowerCase());
  const rewardValue = useMemo(() => {
    try { return parseGenAmount(reward); } catch { return null; }
  }, [reward]);
  const balanceEnough = walletBalance === null || rewardValue === null || walletBalance >= rewardValue;
  const deadlinePreview = useMemo(() => {
    const days = Number(windowDays);
    if (!Number.isFinite(days) || days <= 0 || days > 30) return 'Choose a window up to 30 days';
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(Date.now() + days * 86_400_000));
  }, [windowDays]);

  useEffect(() => {
    if (open) setFormError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    if (!walletAddress) {
      setFormError('Connect the brand wallet before creating a campaign.');
      return;
    }
    if (!correctNetwork) {
      setFormError('Switch the connected wallet to Studionet before signing.');
      return;
    }
    let rewardWei: bigint;
    let submissionWindowSeconds: number;
    try {
      rewardWei = termsLocked ? BigInt(state?.reward_wei ?? '0') : parseGenAmount(reward);
      submissionWindowSeconds = termsLocked ? 0 : parseTimeWindow(windowDays);
    } catch (validationError) {
      setFormError(validationError instanceof Error ? validationError.message : 'Campaign terms are invalid.');
      return;
    }
    const creator = termsLocked ? state?.creator ?? '' : creatorAddress.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(creator)) {
      setFormError('Enter a valid 20-byte creator wallet address.');
      return;
    }
    if (creator.toLowerCase() === walletAddress.toLowerCase()) {
      setFormError('The creator must be a different wallet from the brand/deployer.');
      return;
    }
    if (!termsLocked && walletBalance !== null && walletBalance < rewardWei) {
      setFormError('This wallet balance is below the exact campaign reward. Add Studionet GEN before locking the campaign.');
      return;
    }
    try {
      await onSubmit({ creatorAddress: creator, rewardWei, submissionWindowSeconds });
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Campaign transaction did not complete.');
    }
  }

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="campaign-dialog" role="dialog" aria-modal="true" aria-labelledby="create-campaign-heading">
        <div className="dialog-topline">
          <div>
            <div className="section-overline"><span>NEW INSTANCE</span> / STUDIONET</div>
            <h2 id="create-campaign-heading">Lock a campaign</h2>
          </div>
          <button className="icon-button dialog-close" onClick={onClose} type="button" disabled={busy} aria-label="Close campaign creation">
            <Icon name="close" size={18} />
          </button>
        </div>

        <p className="dialog-intro">One fresh Intelligent Contract becomes the record for one creator agreement. The deploying wallet is the brand and cannot be changed later.</p>

        <form onSubmit={handleSubmit}>
          <div className="campaign-form-grid">
            <div className="form-field field-span-2">
              <label className="fact-label" htmlFor="claim-code">FIXED CLAIM CODE</label>
              <div className="locked-field" id="claim-code"><span>{state?.claim_code ?? 'POL-HC-6377'}</span><Icon name="lock" size={14} /></div>
              <span className="field-note">Claim identifier is defined by the IC; it cannot be edited here.</span>
            </div>
            <div className="form-field field-span-2">
              <label className="fact-label" htmlFor="fixed-product-url">FIXED PRODUCT URL</label>
              <div className="locked-field locked-url" id="fixed-product-url"><span>{state?.product_url ?? 'VitaminExpress · Bioactive Folate Quatrefolic capsules'}</span><Icon name="external" size={14} /></div>
              <span className="field-note">The seller page is fixed in the contract and is not independent verification.</span>
            </div>

            <div className="form-field field-span-2">
              <label className="fact-label" htmlFor="creator-wallet">CREATOR WALLET</label>
              <input
                id="creator-wallet"
                value={termsLocked ? state?.creator ?? '' : creatorAddress}
                onChange={(event) => setCreatorAddress(event.target.value)}
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                disabled={busy || termsLocked}
              />
              {termsLocked && <span className="field-note">Terms are already on-chain. Creator: {shortAddress(state?.creator, 8, 6)}</span>}
            </div>

            <div className="form-field">
              <label className="fact-label" htmlFor="reward-gen">REWARD · GEN</label>
              <div className="input-suffix"><input id="reward-gen" inputMode="decimal" value={termsLocked ? formatGen(state?.reward_wei) : reward} onChange={(event) => setReward(event.target.value)} disabled={busy || termsLocked} /><span>GEN</span></div>
              {!termsLocked && <span className={`field-note ${!balanceEnough ? 'field-note-error' : ''}`}>
                {walletBalance === null ? 'Wallet balance unavailable' : `Wallet balance · ${formatGen(walletBalance)} GEN`}
              </span>}
            </div>

            <div className="form-field">
              <label className="fact-label" htmlFor="window-days">SUBMISSION WINDOW</label>
              <div className="input-suffix"><input id="window-days" type="number" min="0.0007" max="30" step="0.5" value={termsLocked ? '' : windowDays} onChange={(event) => setWindowDays(event.target.value)} disabled={busy || termsLocked} placeholder={termsLocked ? 'Locked' : undefined} /><span>DAYS</span></div>
              <span className="field-note">{termsLocked ? 'LOCKED ON-CHAIN · ' : 'Estimated deadline · '}{termsLocked ? (state?.submission_deadline_ts ? new Date(Number(state.submission_deadline_ts) * 1_000).toLocaleString() : 'On-chain') : deadlinePreview}</span>
            </div>
          </div>

          <div className="campaign-rule-preview">
            <span className="fact-label">CAMPAIGN RULE</span>
            <blockquote>“This campaign will settle based on whether submitted copy satisfies the selected claim and its applicable condition using the evidence sources defined by the Intelligent Contract.”</blockquote>
          </div>

          <div className="lock-sequence">
            <span><b>01</b> Deploy IC</span><span><b>02</b> Lock terms</span><span><b>03</b> Fund exact reward</span>
          </div>

          {(formError || error) && <div className="dialog-error" role="alert"><Icon name="alert" size={15} />{formError || error}</div>}
          {busy && (
            <div className="dialog-progress" aria-live="polite">
              <span className="progress-pulse" /><span>{progress || 'Waiting for wallet confirmation…'}</span>
            </div>
          )}

          <div className="dialog-footer">
            <button className="dialog-cancel" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-action" type="submit" disabled={busy || !walletAddress || !correctNetwork || (!termsLocked && !balanceEnough)}>
              {busy ? 'Working…' : termsLocked ? 'Fund exact reward' : isCurrentEmptyBrandInstance ? 'Set terms & fund' : 'Deploy, lock & fund'}
              <Icon name="arrow" size={15} />
            </button>
          </div>
          {!walletAddress && (
            <div className="dialog-wallet-note">
              <span>{walletAvailable ? 'Connect the brand wallet to continue.' : 'No EIP-1193 wallet detected. Install a wallet and reload this workspace.'}</span>
              {walletAvailable && <button className="dialog-inline-action" type="button" onClick={onConnectWallet} disabled={busy}>Connect wallet</button>}
            </div>
          )}
          {walletAddress && !correctNetwork && (
            <div className="dialog-wallet-note">
              <span>Switch to Studionet · chain 61999 before signing.</span>
              <button className="dialog-inline-action" type="button" onClick={onSwitchNetwork} disabled={busy}>Switch network</button>
            </div>
          )}
          <p className="dialog-terms-note">{termsLocked ? `Terms are already on-chain at ${shortAddress(contractAddress, 8, 6)}.` : expiredConfiguredDraft ? 'The previous unfunded instance passed its deadline and cannot be funded. This submission will use a fresh deployment.' : isCurrentEmptyBrandInstance ? 'This empty instance was deployed by the connected wallet; the brand role matches.' : 'A new deployment makes the connected wallet the campaign brand.'} Maximum submission window: 30 days. One creator revision is permitted.</p>
        </form>
      </section>
    </div>
  );
}
