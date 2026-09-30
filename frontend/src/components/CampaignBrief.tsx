import { formatGen, humanDate, shortAddress } from '../lib/genlayer';
import type { CampaignSnapshot } from '../lib/types';
import { Icon } from './Icons';

type Props = {
  snapshot: CampaignSnapshot | null;
  contractAddress: string;
  role: string;
  onCopyAddress: () => void;
  onOpenExplorer: () => void;
};

export function CampaignBrief({ snapshot, contractAddress, role, onCopyAddress, onOpenExplorer }: Props) {
  const state = snapshot?.state;
  const status = state?.status ?? 'DRAFT';
  const due = state?.submission_deadline_ts ? Number(state.submission_deadline_ts) : 0;
  const submitted = Boolean(snapshot?.copy);
  const productTitle = 'Bioactive Folate';

  return (
    <aside className="campaign-brief-column">
      <section className="brief-section">
        <div className="section-overline"><span>01</span> CAMPAIGN BRIEF</div>
        <div className="product-identity">
          <div className="product-monogram" aria-hidden="true">
            <span>F</span><i />
          </div>
          <div>
            <h2>{productTitle}</h2>
            <a href={state?.product_url ?? '#'} target="_blank" rel="noreferrer" className="brief-external-link">
              Quatrefolic® capsules <Icon name="external" size={12} />
            </a>
          </div>
        </div>
        <p className="brief-summary">One creator. One claim. One declared product condition.</p>

        <div className="brief-divider" />
        <div className="brief-facts">
          <div className="brief-fact">
            <span className="fact-label">FIXED CLAIM</span>
            <strong className="fact-code">{state?.claim_code ?? 'POL-HC-6377'}</strong>
          </div>
          <div className="brief-fact">
            <span className="fact-label">CREATOR</span>
            <strong className="fact-address" title={state?.creator ?? undefined}>{shortAddress(state?.creator, 8, 6)}</strong>
          </div>
          <div className="brief-fact">
            <span className="fact-label">REWARD</span>
            <strong className="fact-reward">{formatGen(state?.reward_wei)} <small>GEN</small></strong>
          </div>
          <div className="brief-fact">
            <span className="fact-label">SUBMISSION DEADLINE</span>
            <strong className="fact-date">{state?.campaign_created && due ? humanDate(due) : 'Set at campaign lock'}</strong>
          </div>
          <div className="brief-fact">
            <span className="fact-label">SUBMISSION</span>
            <strong className="fact-status">{submissionLabel(status, submitted)}</strong>
          </div>
        </div>
      </section>

      <section className="instance-section">
        <div className="section-overline"><span>INSTANCE</span></div>
        <div className="instance-address-row">
          <span className="mono-address" title={contractAddress}>{shortAddress(contractAddress, 10, 7)}</span>
          <button className="icon-button" onClick={onCopyAddress} type="button" aria-label="Copy contract address" title="Copy address">
            <Icon name="copy" size={14} />
          </button>
          <button className="icon-button" onClick={onOpenExplorer} type="button" aria-label="Open contract in explorer" title="View contract">
            <Icon name="external" size={14} />
          </button>
        </div>
        <div className="instance-meta">
          <span>STUDIONET</span><span className="meta-separator">/</span><span>CHAIN 61999</span>
        </div>
        <div className="role-line">
          <span className="role-label">CONNECTED ROLE</span>
          <span className={`role-value ${role === 'viewer' ? 'role-viewer' : ''}`}>{role.toUpperCase()}</span>
        </div>
      </section>

      <section className="fixed-rule-note">
        <div className="note-rule-top" />
        <p>“This campaign settles against one fixed EU claim and the product evidence defined in the Intelligent Contract.”</p>
        <span>RULES ARE CONTRACT-CONTROLLED</span>
      </section>

      {state?.not_legal_approval && (
        <p className="legal-microcopy">Evidence-based settlement only.<br />Not legal approval or certification.</p>
      )}
    </aside>
  );
}

function submissionLabel(status: string, hasCopy: boolean): string {
  if (hasCopy) return status === 'REVISION_ALLOWED' ? 'Revision requested' : 'Copy on record';
  if (status === 'FUNDED') return 'Awaiting creator';
  if (status === 'DRAFT') return 'Campaign not funded';
  if (status === 'REFUNDED') return 'Closed · refunded';
  if (status === 'PAID') return 'Closed · settled';
  return status.replaceAll('_', ' ').toLowerCase();
}
