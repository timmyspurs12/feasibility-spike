import { PRODUCT_URL, shortAddress } from '../lib/genlayer';
import type { ReviewEvidence } from '../lib/types';
import { Icon } from './Icons';

type Props = { review: ReviewEvidence | undefined; isLastStored: boolean };

const markers = [
  ['mentions_folate', 'Folate wording'],
  ['mentions_400_ug', '400 µg marker'],
  ['mentions_200_percent_nrv', '200% NRV marker'],
] as const;

export function ProductEvidence({ review, isLastStored }: Props) {
  const evidence = review?.product_evidence ?? {};
  const attempted = Boolean(review && review.product_page_reason_code !== 'NOT_REQUESTED');
  const pageAccessible = review?.product_page_accessible === true;

  return (
    <section className="evidence-document product-evidence" aria-labelledby="product-evidence-heading">
      <div className="document-topline">
        <span className="source-tag source-tag-seller"><span className="source-dot" /> SELLER-PROVIDED EVIDENCE</span>
        <span className="evidence-type">PRODUCT PAGE / TEXT</span>
      </div>
      <div className="document-body">
        {isLastStored && <p className="evidence-freshness-note">LAST STORED EVIDENCE · A newer review has not written a replacement record.</p>}
        <div className="product-evidence-heading-row">
          <div>
            <span className="fact-label">FIXED PRODUCT SOURCE</span>
            <h3 id="product-evidence-heading">VitaminExpress</h3>
          </div>
          <span className={`page-status ${pageAccessible ? 'page-status-open' : attempted ? 'page-status-missing' : 'page-status-waiting'}`}>
            {pageAccessible ? 'TEXT RETURNED' : attempted ? (review?.product_page_reason_code ?? 'UNAVAILABLE') : 'NOT REQUESTED'}
          </span>
        </div>

        <a className="product-source-url" href={review?.product_url ?? PRODUCT_URL} target="_blank" rel="noreferrer">
          <span>{review?.product_url ?? PRODUCT_URL}</span><Icon name="external" size={12} />
        </a>

        <div className="product-marker-list">
          {markers.map(([key, label], index) => {
            const detected = evidence[key] === true;
            return (
              <div className={`product-marker-row ${detected ? 'marker-detected' : 'marker-not-detected'}`} key={key}>
                <span className="marker-index">0{index + 1}</span>
                <span className="marker-label">{label}</span>
                <span className="marker-value">{attempted ? pageAccessible ? detected ? 'DETECTED' : 'NOT DETECTED' : 'UNAVAILABLE' : 'PENDING'}</span>
              </div>
            );
          })}
        </div>

        <div className="seller-evidence-note">
          <span className="seller-note-mark">i</span>
          <p>Markers were extracted from seller-provided page text. They are not independent product verification or an assay.</p>
        </div>

        <div className="product-source-meta">
          <span>{review?.product_text_length ? `${review.product_text_length.toLocaleString()} characters rendered` : 'No page text stored on-chain'}</span>
          {review?.product_evidence_digest && <code title={review.product_evidence_digest}>DIGEST {shortAddress(review.product_evidence_digest, 9, 7)}</code>}
        </div>
      </div>
      <div className="document-bottomline">
        <span>DECLARED SELLER INFORMATION ONLY</span>
        <a href={review?.product_url ?? PRODUCT_URL} target="_blank" rel="noreferrer" aria-label="Open seller product page"><Icon name="external" size={12} /></a>
      </div>
    </section>
  );
}
