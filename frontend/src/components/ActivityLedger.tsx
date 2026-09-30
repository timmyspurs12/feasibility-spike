import { useMemo, useState } from 'react';
import { formatGen, humanDate, shortAddress, statusName } from '../lib/genlayer';
import type { CampaignActivity, CampaignSnapshot } from '../lib/types';
import { Icon } from './Icons';

type Props = { snapshot: CampaignSnapshot | null; explorerTx: (hash: string) => string };

export function ActivityLedger({ snapshot, explorerTx }: Props) {
  const [showRejected, setShowRejected] = useState(false);
  const rows = useMemo(() => {
    const activities = snapshot?.activities ?? [];
    const relevant = activities.filter((item) => item.method !== 'other');
    const children: CampaignActivity[] = (snapshot?.settlementChildren ?? []).map((tx) => {
      const status = statusName(tx);
      const terminalFailure = ['CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(status);
      const success = status === 'FINALIZED'
        ? tx.value_credited === true ? true : tx.value_credited === false ? false : undefined
        : terminalFailure ? false : undefined;
      return {
        hash: String(tx.hash ?? ''),
        method: 'settlement_child',
        label: 'SETTLEMENT TRANSFER',
        from: String(tx.from_address ?? ''),
        to: String(tx.to_address ?? tx.recipient ?? ''),
        value: String(tx.value ?? '0'),
        valueCredited: tx.value_credited,
        status,
        timestamp: typeof tx.created_at === 'string' ? tx.created_at : undefined,
        parentHash: undefined,
        success,
      };
    });
    return [...relevant, ...children].sort((a, b) => {
      const at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bt - at;
    });
  }, [snapshot]);
  const visible = rows.filter((row) => showRejected || row.success !== false);

  return (
    <section className="activity-ledger-section" aria-labelledby="activity-heading">
      <div className="activity-ledger-head">
        <div>
          <div className="section-overline"><span>06</span> CHAIN RECORD</div>
          <h2 id="activity-heading" className="section-title">Transaction log</h2>
        </div>
        <button className="activity-filter" type="button" onClick={() => setShowRejected((value) => !value)}>
          {showRejected ? 'Hide' : 'Show'} rejected calls
        </button>
      </div>
      {snapshot?.activityError && <p className="activity-warning">{snapshot.activityError}</p>}
      {visible.length ? (
        <div className="activity-list">
          {visible.slice(0, 12).map((item) => (
            <div className={`activity-row ${item.success === false ? 'activity-rejected' : ''}`} key={`${item.hash}-${item.method}`}>
              <span
                className={`activity-mark ${item.success === false ? 'activity-mark-rejected' : item.success === undefined ? 'activity-mark-pending' : ''}`}
                title={item.success === true ? 'Confirmed' : item.success === false ? 'Failed' : 'Status not finalized'}
                aria-label={item.success === true ? 'Confirmed' : item.success === false ? 'Failed' : 'Status not finalized'}
              >
                {item.success === false ? '!'
                  : item.method === 'settlement_child' ? <Icon name="arrow" size={13} />
                    : item.success === true ? <Icon name="check" size={12} />
                      : <span className="activity-pending-dot" />}
              </span>
              <div className="activity-main">
                <div className="activity-title-row">
                  <strong>{item.label}</strong>
                  <span className={`activity-status ${item.success === false ? 'activity-status-rejected' : ''}`}>{item.status ?? 'UNKNOWN'}</span>
                </div>
                <div className="activity-details">
                  <span>{humanDate(item.timestamp)}</span>
                  {item.method === 'settlement_child' && item.value && <span>{formatGen(item.value)} GEN → {shortAddress(item.to, 7, 5)}</span>}
                  {item.parentHash && <span>CHILD OF {shortAddress(item.parentHash, 7, 5)}</span>}
                  {typeof item.result === 'string' && item.result && <span className="activity-error-text">{item.result}</span>}
                </div>
              </div>
              <a className="activity-hash-link" href={explorerTx(item.hash)} target="_blank" rel="noreferrer" title={item.hash}>
                {shortAddress(item.hash, 7, 5)} <Icon name="external" size={11} />
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="activity-empty">No campaign transactions have been found for this address.</div>
      )}
      <p className="activity-source-note">History is read from Studionet’s transaction endpoint and linked to the official Studio Explorer. No local mock activity is shown.</p>
    </section>
  );
}
