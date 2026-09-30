import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import {
  TransactionHashVariant,
  transactionResultNumberToName,
} from 'genlayer-js/types';
import type { TransactionHash } from 'genlayer-js/types';
import { formatUnits, isAddress, parseUnits, type Address } from 'viem';
import type {
  CampaignActivity,
  CampaignSnapshot,
  CampaignState,
  ContractMethod,
  Eip1193Provider,
  GenLayerTransaction,
  ReviewEvidence,
  TrackedTransaction,
} from './types';

export const EXPECTED_CHAIN_ID = 61999;
export const CLAIM_CODE = 'POL-HC-6377';
export const PRODUCT_URL =
  'https://www.vitaminexpress.org/en/bioactive-folate-quatrefolic-folic-acid-capsules';
export const DG_SANTE_URL =
  'https://api.datalake.sante.service.ec.europa.eu/health-claims/health-claims-list-details?format=json&policy_item_code=POL-HC-6377&api-version=v2.0';

export const DEFAULT_CAMPAIGN_ADDRESS =
  '0x90DD260FEB475418B96C8316D8964341D8375552';
export const DEFAULT_REVIEW_TRANSACTION =
  '0xf2fa2d386c8fd8b51f6baf9583803a79d6334e4409a5a6cebb816f191ce22be8';
export const EXPLORER_URL = (
  import.meta.env.VITE_STUDIONET_EXPLORER_URL || 'https://explorer-studio.genlayer.com'
).replace(/\/$/, '');

export type GenLayerClient = ReturnType<typeof createClient>;

type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>;

export function createReadClient(): GenLayerClient {
  return createClient({ chain: studionet });
}

export function createWalletClient(
  provider: Eip1193Provider,
  walletAddress: string,
): GenLayerClient {
  return createClient({
    chain: studionet,
    account: walletAddress as Address,
    provider: provider as ClientConfig['provider'],
  });
}

export function getEthereumProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  return ethereum ?? null;
}

export function campaignAddressFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const queryAddress = params.get('campaign');
  if (queryAddress && isAddress(queryAddress)) return queryAddress;

  const configured = import.meta.env.VITE_CAMPAIGN_CONTRACT_ADDRESS;
  if (configured && isAddress(configured)) return configured;
  return DEFAULT_CAMPAIGN_ADDRESS;
}

export function shortAddress(value?: string, head = 7, tail = 5): string {
  if (!value) return '—';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatGen(wei: string | bigint | number | undefined): string {
  if (wei === undefined || wei === null || wei === '') return '—';
  try {
    const value = formatUnits(BigInt(wei), 18);
    return value.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  } catch {
    return '—';
  }
}

export function parseGenAmount(amount: string): bigint {
  const clean = amount.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(clean)) {
    throw new Error('Enter a positive GEN amount with up to 18 decimal places.');
  }
  const amountWei = parseUnits(clean, 18);
  if (amountWei <= 0n) throw new Error('Reward must be greater than zero.');
  return amountWei;
}

export function parseJsonValue<T>(value: unknown, label: string): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`${label} returned unreadable contract data.`);
    }
  }
  if (value && typeof value === 'object') return value as T;
  throw new Error(`${label} returned no contract data.`);
}

const TERMINAL_TRANSACTION_STATUSES = ['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'];

export function isTerminalTransactionStatus(status: string): boolean {
  return TERMINAL_TRANSACTION_STATUSES.includes(status.toUpperCase());
}

export function latestPendingActivity(activities: CampaignActivity[], method: ContractMethod): CampaignActivity | undefined {
  const latest = [...activities].reverse().find((activity) => activity.method === method);
  const status = latest?.status?.toUpperCase();
  if (!latest || !status || ['UNKNOWN', 'NOT_STARTED'].includes(status) || isTerminalTransactionStatus(status)) return undefined;
  return latest;
}

export function statusName(tx?: GenLayerTransaction | null): string {
  if (!tx) return 'NOT_STARTED';
  const raw = tx.statusName ?? tx.status_name ?? tx.status;
  if (typeof raw === 'number') {
    const names: Record<number, string> = {
      0: 'UNINITIALIZED',
      1: 'PENDING',
      2: 'PROPOSING',
      3: 'COMMITTING',
      4: 'REVEALING',
      5: 'ACCEPTED',
      6: 'UNDETERMINED',
      7: 'FINALIZED',
      8: 'CANCELED',
      9: 'APPEAL_REVEALING',
      10: 'APPEAL_COMMITTING',
      11: 'READY_TO_FINALIZE',
      12: 'VALIDATORS_TIMEOUT',
      13: 'LEADER_TIMEOUT',
    };
    return names[raw] ?? String(raw);
  }
  return String(raw ?? 'UNKNOWN').toUpperCase();
}

export function consensusName(tx?: GenLayerTransaction | null): string | null {
  if (!tx) return null;
  const direct = tx.result_name ?? tx.resultName;
  if (typeof direct === 'string') return direct.toUpperCase();
  if (typeof tx.result === 'number') {
    return transactionResultNumberToName[String(tx.result) as keyof typeof transactionResultNumberToName] ?? null;
  }
  return null;
}

export function isExactSettlementTransfer(
  tx: GenLayerTransaction | undefined,
  recipient: string | undefined,
  amountWei: string,
): boolean {
  if (!tx || !recipient || statusName(tx) !== 'FINALIZED' || tx.value_credited !== true) return false;
  const actualRecipient = String(tx.to_address ?? tx.recipient ?? '').toLowerCase();
  if (actualRecipient !== recipient.toLowerCase()) return false;
  try {
    return BigInt(String(tx.value ?? '0')) === BigInt(amountWei);
  } catch {
    return false;
  }
}

export function leaderExecutionSucceeded(tx?: GenLayerTransaction | null): boolean {
  const receipts = tx?.consensus_data?.leader_receipt;
  return Array.isArray(receipts) && receipts.some((receipt) => receipt.execution_result === 'SUCCESS');
}

export function executionError(tx?: GenLayerTransaction | null): string | null {
  if (!tx) return null;
  const receipts = tx.consensus_data?.leader_receipt ?? [];
  const errorReceipt = receipts.find((receipt) => receipt.execution_result === 'ERROR');
  const receiptText = errorReceipt?.error;
  if (typeof receiptText === 'string' && receiptText.trim()) return receiptText;
  if (typeof tx.result === 'string' && tx.result.trim()) return tx.result;
  return null;
}

export function humanizeTransactionError(error: unknown): string {
  const errorObject = error as { code?: number; message?: string; shortMessage?: string };
  const message = String(errorObject?.shortMessage ?? errorObject?.message ?? error ?? 'Unknown error');
  const lower = message.toLowerCase();
  if (errorObject?.code === 4001 || lower.includes('user rejected') || lower.includes('user denied')) {
    return 'Wallet confirmation was declined. No contract change was assumed; you can try again when ready.';
  }
  if (lower.includes('insufficient funds') || lower.includes('exceeds balance')) {
    return 'This wallet does not have enough GEN to cover the reward and network transaction. Add Studionet test GEN or choose a smaller reward.';
  }
  if (lower.includes('chain') || lower.includes('network')) {
    return 'The wallet is not on Studionet (chain 61999). Switch networks, then retry.';
  }
  if (lower.includes('only the named creator')) {
    return 'Only the creator wallet fixed in this campaign can submit or revise the copy.';
  }
  if (lower.includes('only the campaign brand')) {
    return 'This action is reserved for the campaign brand wallet that deployed the contract.';
  }
  if (lower.includes('only a campaign party')) {
    return 'Only the configured brand or creator can start or run the review.';
  }
  if (lower.includes('deadline has passed')) {
    return 'The submission deadline has passed. The copy cannot be changed; check whether the timeout refund is now available.';
  }
  if (lower.includes('revision has already been used') || lower.includes('not accepting a copy')) {
    return 'The campaign is not accepting another copy. Only one revision is permitted.';
  }
  if (lower.includes('timeout has not expired')) {
    return 'The refund window has not expired yet. The displayed chain deadline is the earliest permitted time.';
  }
  if (lower.includes('evidence') || lower.includes('source') || lower.includes('validator')) {
    return 'The GenLayer review could not reach a usable decision. The contract state remains authoritative; inspect the latest review and timeout path.';
  }
  return message.length > 250 ? `${message.slice(0, 247)}…` : message;
}

export function methodFromTransaction(tx: Record<string, unknown>): ContractMethod {
  const data = tx.data as { calldata?: { readable?: string } } | undefined;
  const readable = data?.calldata?.readable;
  if (readable) {
    try {
      const parsed = JSON.parse(readable) as { method?: string };
      const method = parsed.method;
      if (method && isContractMethod(method)) return method;
    } catch {
      // Some older Studio receipts use a non-JSON readable payload.
    }
  }
  return tx.type === 1 ? 'deploy' : 'other';
}

function isContractMethod(method: string): method is ContractMethod {
  return [
    'create_campaign',
    'fund_campaign',
    'submit_copy',
    'begin_review',
    'review_campaign',
    'refund_after_timeout',
    'retry_failed_settlement',
  ].includes(method);
}

const methodLabels: Record<ContractMethod, string> = {
  deploy: 'CAMPAIGN CONTRACT DEPLOYED',
  create_campaign: 'CAMPAIGN TERMS LOCKED',
  fund_campaign: 'ESCROW FUNDED',
  submit_copy: 'CREATOR COPY SUBMITTED',
  begin_review: 'REVIEW OPENED',
  review_campaign: 'GENLAYER REVIEW',
  refund_after_timeout: 'TIMEOUT REFUND',
  retry_failed_settlement: 'SETTLEMENT RETRY',
  settlement_child: 'SETTLEMENT TRANSFER',
  other: 'CONTRACT TRANSACTION',
};

export function toActivity(tx: Record<string, unknown>): CampaignActivity | null {
  const hash = String(tx.hash ?? tx.tx_id ?? '');
  if (!hash.startsWith('0x')) return null;
  const method = methodFromTransaction(tx);
  const result = (tx.result ?? null) as string | number | null;
  const transaction = tx as unknown as GenLayerTransaction;
  const status = statusName(transaction);
  const terminalFailure = ['CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(status);
  let success: boolean | undefined;
  if (method === 'settlement_child') {
    if (status === 'FINALIZED') success = tx.value_credited === true;
    else if (terminalFailure) success = false;
  } else if (terminalFailure) {
    success = false;
  } else if (status === 'FINALIZED') {
    const consensus = consensusName(transaction);
    const leaderReceipts = transaction.consensus_data?.leader_receipt;
    if (consensus && consensus !== 'MAJORITY_AGREE') success = false;
    else if (consensus === 'MAJORITY_AGREE' && Array.isArray(leaderReceipts)) {
      success = leaderExecutionSucceeded(transaction);
    }
  }
  const timestamp = typeof tx.created_at === 'string'
    ? tx.created_at
    : typeof tx.createdTimestamp === 'string'
      ? tx.createdTimestamp
      : undefined;
  return {
    hash,
    method,
    label: methodLabels[method],
    from: typeof tx.from_address === 'string' ? tx.from_address : undefined,
    to: typeof tx.to_address === 'string' ? tx.to_address : undefined,
    value: tx.value !== undefined && tx.value !== null ? String(tx.value) : undefined,
    valueCredited: typeof tx.value_credited === 'boolean' ? tx.value_credited : undefined,
    status,
    result,
    timestamp,
    parentHash: typeof tx.triggered_by === 'string' ? tx.triggered_by : undefined,
    success,
  };
}

async function readContractValue<T>(
  client: GenLayerClient,
  address: Address,
  functionName: string,
): Promise<T> {
  return await client.readContract({
    address,
    functionName,
    args: [],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  }) as T;
}

async function getStudioTransactions(client: GenLayerClient, address: Address): Promise<Record<string, unknown>[]> {
  const response = await client.request({
    method: 'sim_getTransactionsForAddress',
    params: [address],
  });
  if (!Array.isArray(response)) return [];
  return response as Record<string, unknown>[];
}

function isWriteSuccessful(activity: CampaignActivity): boolean {
  return activity.success === true;
}

export async function readCampaignSnapshot(
  client: GenLayerClient,
  addressValue: string,
  tracked: TrackedTransaction[] = [],
  reviewHashFallback?: string,
): Promise<CampaignSnapshot> {
  if (!isAddress(addressValue)) throw new Error('Enter a valid Intelligent Contract address.');
  const address = addressValue as Address;
  const [stateValue, copyValue, reviewValue, balanceValue, timestampValue] = await Promise.all([
    readContractValue<unknown>(client, address, 'get_campaign_state'),
    readContractValue<unknown>(client, address, 'get_submitted_copy'),
    readContractValue<unknown>(client, address, 'get_review_results'),
    readContractValue<unknown>(client, address, 'get_contract_balance'),
    readContractValue<unknown>(client, address, 'get_current_timestamp'),
  ]);

  const state = parseJsonValue<CampaignState>(stateValue, 'Campaign state');
  const copy = typeof copyValue === 'string' ? copyValue : String(copyValue ?? '');
  const reviews = parseJsonValue<ReviewEvidence[]>(reviewValue, 'Review results');
  const balanceWei = String(balanceValue ?? '0');
  const chainTimestamp = Number(timestampValue ?? 0);

  let activityError: string | undefined;
  let rawTransactions: Record<string, unknown>[] = [];
  try {
    rawTransactions = await getStudioTransactions(client, address);
  } catch (error) {
    activityError = `On-chain transaction history is temporarily unavailable: ${humanizeTransactionError(error)}`;
  }

  const activitiesByHash = new Map<string, CampaignActivity>();
  for (const raw of rawTransactions) {
    if (String(raw.to_address ?? '').toLowerCase() !== address.toLowerCase()) continue;
    const activity = toActivity(raw);
    if (activity) activitiesByHash.set(activity.hash.toLowerCase(), activity);
  }
  for (const item of tracked) {
    if (item.contractAddress.toLowerCase() !== address.toLowerCase()) continue;
    const existing = activitiesByHash.get(item.hash.toLowerCase());
    activitiesByHash.set(item.hash.toLowerCase(), {
      hash: item.hash,
      method: item.method,
      label: item.label,
      status: existing?.status ?? item.status,
      timestamp: existing?.timestamp ?? new Date(item.createdAt).toISOString(),
      from: existing?.from,
      to: existing?.to,
      value: existing?.value,
      valueCredited: existing?.valueCredited,
      success: existing?.success ?? item.success,
      result: existing?.result,
      parentHash: existing?.parentHash,
    });
  }

  const activities = [...activitiesByHash.values()].sort((a, b) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });
  const latestReviewActivity = [...activities]
    .reverse()
    .find((activity) => activity.method === 'review_campaign');

  let reviewTransaction: GenLayerTransaction | null = null;
  const reviewHash = latestReviewActivity?.hash ?? reviewHashFallback;
  if (reviewHash) {
    try {
      const transaction = await client.getTransaction({ hash: reviewHash as TransactionHash });
      const toAddress = String(transaction.to_address ?? transaction.recipient ?? '').toLowerCase();
      if (toAddress === address.toLowerCase()) reviewTransaction = transaction as unknown as GenLayerTransaction;
    } catch {
      // The review hash remains a transaction-link record even if Studio is temporarily unavailable.
    }
  }

  const isSettlementState = ['PAID', 'REFUNDED', 'PAYOUT_FAILED', 'REFUND_FAILED'].includes(state.status);
  const settlementParent = isSettlementState
    ? [...activities]
        .reverse()
        .find((activity) =>
          isWriteSuccessful(activity) &&
          ['review_campaign', 'refund_after_timeout', 'retry_failed_settlement'].includes(activity.method),
        )
    : state.status === 'DRAFT'
      ? [...activities]
          .reverse()
          .find((activity) =>
            activity.status === 'FINALIZED' &&
            activity.success !== false &&
            ['fund_campaign', 'retry_failed_settlement'].includes(activity.method),
          )
      : undefined;
  let settlementChildren: GenLayerTransaction[] = [];
  if (settlementParent) {
    try {
      const children = await client.getTriggeredTransactionIds({
        hash: settlementParent.hash as TransactionHash,
      });
      settlementChildren = await Promise.all(
        children.map((hash) => client.getTransaction({ hash })),
      ) as unknown as GenLayerTransaction[];
    } catch {
      settlementChildren = [];
    }
  }

  const trackedReview = reviewHashFallback &&
    reviewHashFallback.toLowerCase() === reviewHash?.toLowerCase();
  if (trackedReview && !reviewTransaction && reviewHash) {
    // Keep the chain lookup strict: don't associate a review receipt with another contract.
    activityError = activityError ?? 'Configured review transaction has not been found for this contract.';
  }

  return {
    state,
    copy,
    reviews,
    balanceWei,
    chainTimestamp,
    activities,
    reviewTransaction,
    settlementChildren,
    activityError,
  };
}

export async function readWalletBalance(client: GenLayerClient, address: string): Promise<bigint> {
  if (!isAddress(address)) throw new Error('Wallet address is invalid.');
  return await client.getBalance({ address: address as Address });
}

export async function loadContractSource(): Promise<string> {
  const base = import.meta.env.BASE_URL || '/';
  const response = await fetch(`${base.replace(/\/$/, '')}/contracts/HealthClaimCampaignEscrow.py`);
  if (!response.ok) {
    throw new Error('Could not load the canonical campaign contract source. Re-run npm run predev or npm run build.');
  }
  return await response.text();
}

export async function ensureStudionet(provider: Eip1193Provider): Promise<void> {
  const chainId = `0x${EXPECTED_CHAIN_ID.toString(16)}`;
  const current = String(await provider.request({ method: 'eth_chainId' })).toLowerCase();
  if (current === chainId.toLowerCase()) return;

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code !== 4902) throw error;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId,
        chainName: studionet.name,
        rpcUrls: [...studionet.rpcUrls.default.http],
        nativeCurrency: studionet.nativeCurrency,
        blockExplorerUrls: [EXPLORER_URL],
      }],
    });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
  }
}

export function isCorrectNetwork(chainIdHex: string | null): boolean {
  if (!chainIdHex) return false;
  try {
    return Number(BigInt(chainIdHex)) === EXPECTED_CHAIN_ID;
  } catch {
    return false;
  }
}

export async function watchTransaction(
  client: GenLayerClient,
  hash: string,
  onUpdate: (transaction: GenLayerTransaction | null, pollMessage?: string) => void,
  maxAttempts = 360,
): Promise<GenLayerTransaction> {
  let lastTransaction: GenLayerTransaction | null = null;
  let consecutiveRpcErrors = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const tx = await client.getTransaction({ hash: hash as TransactionHash });
      lastTransaction = tx as unknown as GenLayerTransaction;
      consecutiveRpcErrors = 0;
      onUpdate(lastTransaction);
      const currentStatus = statusName(lastTransaction);
      if (['FINALIZED', 'CANCELED', 'UNDETERMINED', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT'].includes(currentStatus)) {
        return lastTransaction;
      }
    } catch (error) {
      consecutiveRpcErrors += 1;
      if (consecutiveRpcErrors === 1 || consecutiveRpcErrors % 5 === 0) {
        onUpdate(lastTransaction, 'Studio RPC did not answer this status check; retrying the same transaction hash.');
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 5_000));
  }
  throw new Error(`Transaction is still pending after 30 minutes: ${hash}. Do not resubmit; refresh its status from the transaction log.`);
}

export function assertTransactionSucceeded(tx: GenLayerTransaction): void {
  const status = statusName(tx);
  if (status !== 'FINALIZED') {
    const error = executionError(tx);
    throw new Error(error ? `${status}: ${error}` : `Transaction ended in ${status}.`);
  }
  const result = consensusName(tx);
  if (result && result !== 'MAJORITY_AGREE') {
    throw new Error(`GenLayer finalized the transaction with ${result}; no state change is assumed.`);
  }
  if (!leaderExecutionSucceeded(tx)) {
    const error = executionError(tx);
    throw new Error(error ?? 'Finalized receipt did not contain a successful contract execution result. Verify the transaction in Studio before retrying.');
  }
}

export function explorerTransactionUrl(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function isoTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function humanDate(value?: string | number): string {
  if (!value) return 'Not recorded';
  const date = typeof value === 'number'
    ? new Date(value * 1_000)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(date);
}

export function activityMethodLabel(method: ContractMethod): string {
  return methodLabels[method];
}

export function getTrackedTransactionKey(address: string): string {
  return `campaign-escrow:transactions:${address.toLowerCase()}`;
}

export function loadTrackedTransactions(address: string): TrackedTransaction[] {
  try {
    return JSON.parse(localStorage.getItem(getTrackedTransactionKey(address)) ?? '[]') as TrackedTransaction[];
  } catch {
    return [];
  }
}

export function saveTrackedTransaction(address: string, entry: TrackedTransaction): void {
  try {
    const current = loadTrackedTransactions(address);
    const next = [entry, ...current.filter((item) => item.hash.toLowerCase() !== entry.hash.toLowerCase())].slice(0, 40);
    localStorage.setItem(getTrackedTransactionKey(address), JSON.stringify(next));
  } catch {
    // On-chain Studio transaction history remains the source of truth if storage is unavailable.
  }
}

export function parseTimeWindow(days: string): number {
  const number = Number(days);
  if (!Number.isFinite(number) || number <= 0) throw new Error('Enter a submission window longer than zero.');
  const seconds = Math.round(number * 24 * 60 * 60);
  if (seconds < 60) throw new Error('The contract requires at least a 60-second submission window.');
  if (seconds > 30 * 24 * 60 * 60) throw new Error('The contract allows a maximum 30-day submission window.');
  return seconds;
}
