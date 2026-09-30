export type CampaignStatus =
  | 'DRAFT'
  | 'FUNDED'
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'REVISION_ALLOWED'
  | 'INCONCLUSIVE'
  | 'PAID'
  | 'REFUNDED'
  | 'PAYOUT_FAILED'
  | 'REFUND_FAILED'
  | string;

export type Verdict = 'CLEARED' | 'FLAGGED' | 'INCONCLUSIVE' | string;

export interface CampaignState {
  brand: string;
  creator: string;
  claim_code: string;
  product_url: string;
  campaign_created: boolean;
  status: CampaignStatus;
  reward_wei: string;
  escrow_wei: string;
  submission_deadline_ts: string;
  resolution_deadline_ts: string;
  revision_count: number;
  review_count: number;
  copy_sha256: string;
  last_verdict: string;
  settlement_kind: string;
  failed_refund_wei: string;
  failed_refund_recipient: string;
  not_legal_approval: boolean;
}

export interface ProductEvidence {
  mentions_folate?: boolean;
  mentions_400_ug?: boolean;
  mentions_200_percent_nrv?: boolean;
}

export interface ReviewEvidence {
  source?: string;
  source_url?: string;
  source_http_status?: number | null;
  source_json_parsed?: boolean;
  source_row_count?: number;
  matching_row_count?: number;
  normalized_record_count?: number;
  source_record_digest?: string;
  claim_code?: string;
  claim_status?: string;
  claim_type?: string;
  nutrient?: string;
  claim_text?: string;
  condition_of_use?: string;
  restrictions_of_use?: string;
  legislation_short?: string;
  efsa_references?: string[];
  product_url?: string;
  product_page_accessible?: boolean;
  product_page_reason_code?: string;
  product_text_length?: number;
  product_evidence?: ProductEvidence;
  product_evidence_digest?: string;
  condition_status?: string;
  condition_evidence_source?: string;
  copy_sha256?: string;
  semantic_alignment?: string;
  verdict?: Verdict;
  reason_code?: string;
  evidence_digest?: string;
  not_legal_approval?: boolean;
}

export type ContractMethod =
  | 'deploy'
  | 'create_campaign'
  | 'fund_campaign'
  | 'submit_copy'
  | 'begin_review'
  | 'review_campaign'
  | 'refund_after_timeout'
  | 'retry_failed_settlement'
  | 'settlement_child'
  | 'other';

export interface CampaignActivity {
  hash: string;
  method: ContractMethod;
  label: string;
  from?: string;
  to?: string;
  value?: string;
  valueCredited?: boolean;
  status?: string;
  result?: string | number | null;
  timestamp?: string;
  parentHash?: string;
  success?: boolean;
  reviewResult?: string;
}

export interface CampaignSnapshot {
  state: CampaignState;
  copy: string;
  reviews: ReviewEvidence[];
  balanceWei: string;
  chainTimestamp: number;
  activities: CampaignActivity[];
  reviewTransaction?: GenLayerTransaction | null;
  settlementChildren: GenLayerTransaction[];
  activityError?: string;
}

export interface GenLayerTransaction {
  hash?: string;
  tx_id?: string;
  status?: number | string;
  statusName?: string;
  status_name?: string;
  result?: number | string | null;
  resultName?: string;
  result_name?: string;
  txExecutionResultName?: string;
  tx_execution_result?: string;
  consensus_data?: {
    final?: boolean;
    votes?: Record<string, string>;
    validators?: Array<Record<string, unknown>>;
    leader_receipt?: Array<Record<string, unknown>>;
  };
  from_address?: string;
  to_address?: string;
  recipient?: string;
  value?: string | number | bigint;
  value_credited?: boolean;
  triggered_transactions?: string[];
  created_at?: string | Date;
  createdTimestamp?: string;
  numOfRounds?: string;
  num_of_rounds?: string;
  error?: string;
  data?: {
    calldata?: {
      readable?: string;
      method?: string;
    };
  };
  [key: string]: unknown;
}

export interface InjectedWalletOption {
  id: string;
  name: string;
  rdns?: string;
  icon?: string;
  provider: Eip1193Provider;
}

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface TrackedTransaction {
  hash: string;
  label: string;
  method: ContractMethod;
  status: string;
  createdAt: number;
  contractAddress: string;
  success?: boolean;
}
