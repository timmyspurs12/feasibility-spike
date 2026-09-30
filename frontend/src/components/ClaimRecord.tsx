import { DG_SANTE_URL, shortAddress } from '../lib/genlayer';
import type { ReviewEvidence } from '../lib/types';
import { Icon } from './Icons';

type Props = { review: ReviewEvidence | undefined; isLastStored: boolean };

export function ClaimRecord({ review, isLastStored }: Props) {
  const available = Boolean(review?.source_json_parsed && review.claim_text);
  const sourceUrl = review?.source_url ?? DG_SANTE_URL;

  return (
    <section className="evidence-document claim-record" aria-labelledby="claim-record-heading">
      <div className="document-topline">
        <span className="source-tag source-tag-regulatory"><span className="source-dot" /> AUTHORITATIVE REGULATORY SOURCE</span>
        <a className="document-external" href={sourceUrl} target="_blank" rel="noreferrer" title="Open the DG SANTE source">
          European Commission / DG SANTE <Icon name="external" size={12} />
        </a>
      </div>
      <div className="document-body">
        {isLastStored && <p className="evidence-freshness-note">LAST STORED EVIDENCE · A newer review has not written a replacement record.</p>}
        <div className="document-code-row">
          <div>
            <span className="fact-label">HEALTH CLAIM RECORD</span>
            <h3 id="claim-record-heading">{review?.claim_code ?? 'POL-HC-6377'}</h3>
          </div>
          {review && available ? (
            <span className={`record-status ${review.claim_status?.toLowerCase().includes('author') ? 'record-authorised' : 'record-neutral'}`}>
              {review.claim_status || 'STATUS UNVERIFIED'}
            </span>
          ) : (
            <span className="record-status record-pending">AWAITING REVIEW</span>
          )}
        </div>

        {review && available ? (
          <>
            <blockquote className="official-claim-text">“{review.claim_text}”</blockquote>
            <div className="record-metadata">
              <div><span>CLAIM TYPE</span><strong>{review.claim_type || 'Not returned'}</strong></div>
              <div><span>NUTRIENT</span><strong>{review.nutrient || 'Not returned'}</strong></div>
              <div><span>LEGAL REFERENCE</span><strong>{review.legislation_short || 'Not returned'}</strong></div>
            </div>
            <div className="condition-block">
              <span className="fact-label">CONDITION OF USE · SOURCE TEXT</span>
              <p>{review.condition_of_use || 'The source did not return a condition of use.'}</p>
            </div>
            {review.restrictions_of_use && (
              <div className="condition-block condition-restriction">
                <span className="fact-label">RESTRICTIONS OF USE</span>
                <p>{review.restrictions_of_use}</p>
              </div>
            )}
            {review.efsa_references?.length ? (
              <div className="reference-line">
                <span>EFSA REFERENCES</span>
                <span>{review.efsa_references.join(' · ')}</span>
              </div>
            ) : null}
            <div className="source-footnote">
              <span className="source-http">HTTP {review.source_http_status ?? '—'}</span>
              <span>{review.matching_row_count ?? 0} matching rows → {review.normalized_record_count ?? 0} normalized record</span>
              {review.source_record_digest && <code title={review.source_record_digest}>SHA-256 {shortAddress(review.source_record_digest, 10, 8)}</code>}
            </div>
          </>
        ) : (
          <div className="evidence-empty-state">
            <span className="empty-state-marker">—</span>
            <p>
              {review
                ? `The contract did not retain a parsed official record (${review.reason_code ?? 'SOURCE_UNAVAILABLE'}). Missing data is not treated as a finding against the claim.`
                : 'The official claim record is retrieved by the Intelligent Contract when review begins. No result is displayed before that transaction.'}
            </p>
          </div>
        )}
      </div>
      <div className="document-bottomline">
        <span>REGISTER CONTENT IS EVIDENCE, NOT CERTIFICATION</span>
        <a href={sourceUrl} target="_blank" rel="noreferrer" aria-label="Open DG SANTE source"><Icon name="external" size={12} /></a>
      </div>
    </section>
  );
}
