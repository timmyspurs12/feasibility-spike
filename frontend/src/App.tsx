import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isAddress, type Address } from 'viem';
import type { TransactionHash } from 'genlayer-js/types';
import { ActivityLedger } from './components/ActivityLedger';
import { CampaignBrief } from './components/CampaignBrief';
import { ClaimRecord } from './components/ClaimRecord';
import { CopyComposer } from './components/CopyComposer';
import { CreateCampaignDialog, type LockCampaignInput } from './components/CreateCampaignDialog';
import { EvidenceTrail } from './components/EvidenceTrail';
import { GenLayerReview } from './components/GenLayerReview';
import { Icon } from './components/Icons';
import { OpenCampaignDialog } from './components/OpenCampaignDialog';
import { ProductEvidence } from './components/ProductEvidence';
import { SettlementPanel } from './components/SettlementPanel';
import { TopBar } from './components/TopBar';
import { WalletPickerDialog } from './components/WalletPickerDialog';
import {
  DEFAULT_CAMPAIGN_ADDRESS,
  DEFAULT_REVIEW_TRANSACTION,
  assertTransactionSucceeded,
  isCorrectNetwork,
  campaignAddressFromLocation,
  createReadClient,
  createWalletClient,
  ensureStudionet,
  explorerAddressUrl,
  explorerTransactionUrl,
  getEthereumProvider,
  humanizeTransactionError,
  isExactSettlementTransfer,
  latestPendingActivity,
  loadContractSource,
  loadTrackedTransactions,
  readCampaignSnapshot,
  readWalletBalance,
  saveTrackedTransaction,
  shortAddress,
  statusName,
  watchTransaction,
} from './lib/genlayer';
import { discoverInjectedWallets } from './lib/wallets';
import type {
  InjectedWalletOption,
  ContractMethod,
  CampaignSnapshot,
  Eip1193Provider,
  GenLayerTransaction,
  TrackedTransaction,
} from './lib/types';
import './styles.css';

type Theme = 'light' | 'dark';
const THEME_STORAGE_KEY = 'evidence-office-theme';

function readThemePreference(): Theme {
  try { return window.localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'; }
  catch { return 'light'; }
}

type WriteMethod = Exclude<ContractMethod, 'deploy' | 'settlement_child' | 'other'>;
type ActiveTransaction = {
  hash: string;
  method: string;
  status: string;
  message?: string;
  tx?: GenLayerTransaction | null;
} | null;
type Notice = { kind: 'error' | 'success' | 'info'; title: string; message: string } | null;

export default function App() {
  const [theme, setTheme] = useState<Theme>(readThemePreference);
  const readClient = useMemo(() => createReadClient(), []);
  const [contractAddress, setContractAddress] = useState(campaignAddressFromLocation);
  const snapshotRequestId = useRef(0);
  const currentAddressRef = useRef(contractAddress);
  currentAddressRef.current = contractAddress;
  const openingAddressRef = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<CampaignSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [walletOptions, setWalletOptions] = useState<InjectedWalletOption[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<InjectedWalletOption | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [walletDiscoveryComplete, setWalletDiscoveryComplete] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [chainIdHex, setChainIdHex] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);

  const [activeTransaction, setActiveTransaction] = useState<ActiveTransaction>(null);
  const [busyAction, setBusyAction] = useState('');
  const [progressMessage, setProgressMessage] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [openingCampaign, setOpeningCampaign] = useState(false);
  const [openDialogError, setOpenDialogError] = useState('');
  const [dialogError, setDialogError] = useState('');

  const walletAvailable = walletOptions.length > 0 || Boolean(provider) || !walletDiscoveryComplete;
  const correctNetwork = Boolean(walletAddress && isCorrectNetwork(chainIdHex));

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Theme still applies for this session. */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171815' : '#f4f2eb');
  }, [theme]);
  const role = useMemo(() => getRole(snapshot?.state, walletAddress), [snapshot?.state, walletAddress]);
  const busy = Boolean(busyAction);
  const latestActivity = snapshot?.activities.at(-1);
  const activeHash = activeTransaction?.hash ?? latestActivity?.hash;
  const storedReviewIsPrior = isStoredReviewPrior(snapshot, activeTransaction);
  const liveReviewHash = import.meta.env.VITE_CAMPAIGN_REVIEW_TX || DEFAULT_REVIEW_TRANSACTION;

  const fetchSnapshot = useCallback(async (address: string): Promise<CampaignSnapshot> => {
    const fallbackReviewHash = address.toLowerCase() === DEFAULT_CAMPAIGN_ADDRESS.toLowerCase()
      ? liveReviewHash
      : undefined;
    return await readCampaignSnapshot(
      readClient,
      address,
      loadTrackedTransactions(address),
      fallbackReviewHash,
    );
  }, [liveReviewHash, readClient]);

  const refreshSnapshot = useCallback(async (quiet = false) => {
    if (openingAddressRef.current) return null;
    const requestedAddress = contractAddress;
    const requestId = ++snapshotRequestId.current;
    if (!isAddress(requestedAddress)) {
      if (currentAddressRef.current.toLowerCase() === requestedAddress.toLowerCase()) {
        setLoadError('Enter a valid campaign contract address.');
        setIsLoading(false);
      }
      return null;
    }
    if (!quiet) setIsLoading(true);
    else setIsRefreshing(true);
    try {
      const result = await fetchSnapshot(requestedAddress);
      if (requestId === snapshotRequestId.current && currentAddressRef.current.toLowerCase() === requestedAddress.toLowerCase()) {
        setSnapshot(result);
        setLoadError('');
      }
      return result;
    } catch (error) {
      if (requestId === snapshotRequestId.current && currentAddressRef.current.toLowerCase() === requestedAddress.toLowerCase()) {
        setLoadError(humanizeTransactionError(error));
      }
      return null;
    } finally {
      if (requestId === snapshotRequestId.current && currentAddressRef.current.toLowerCase() === requestedAddress.toLowerCase()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [contractAddress, fetchSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const discoverAndRestore = async () => {
      const wallets = await discoverInjectedWallets();
      if (cancelled) return;
      setWalletOptions(wallets);
      setWalletDiscoveryComplete(true);

      for (const wallet of wallets) {
        try {
          const accounts = await wallet.provider.request({ method: 'eth_accounts' });
          if (!Array.isArray(accounts) || typeof accounts[0] !== 'string') continue;
          const chain = await wallet.provider.request({ method: 'eth_chainId' });
          if (cancelled) return;
          setProvider(wallet.provider);
          setSelectedWallet(wallet);
          setWalletAddress(accounts[0]);
          setChainIdHex(typeof chain === 'string' ? chain : null);
          break;
        } catch {
          // An installed extension can be locked or unavailable; leave it selectable for an explicit connect.
        }
      }
    };
    void discoverAndRestore().catch(() => setWalletDiscoveryComplete(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!provider) return;
    let active = true;
    provider.request({ method: 'eth_accounts' })
      .then((accounts) => {
        if (active && Array.isArray(accounts)) setWalletAddress(typeof accounts[0] === 'string' ? accounts[0] : null);
      })
      .catch(() => undefined);
    provider.request({ method: 'eth_chainId' })
      .then((chain) => {
        if (active && typeof chain === 'string') setChainIdHex(chain);
      })
      .catch(() => undefined);

    const accountChanged = (accounts: unknown) => {
      const list = Array.isArray(accounts) ? accounts : [];
      setWalletAddress(typeof list[0] === 'string' ? list[0] : null);
    };
    const chainChanged = (chain: unknown) => {
      setChainIdHex(typeof chain === 'string' ? chain : null);
    };
    provider.on?.('accountsChanged', accountChanged);
    provider.on?.('chainChanged', chainChanged);
    return () => {
      active = false;
      provider.removeListener?.('accountsChanged', accountChanged);
      provider.removeListener?.('chainChanged', chainChanged);
    };
  }, [provider]);

  useEffect(() => {
    if (!busyAction) void refreshSnapshot(false);
  }, [busyAction, refreshSnapshot]);

  useEffect(() => {
    const status = snapshot?.state.status ?? 'DRAFT';
    const activeState = ['DRAFT', 'FUNDED', 'SUBMITTED', 'REVIEWING', 'REVISION_ALLOWED', 'INCONCLUSIVE'].includes(status);
    const interval = status === 'REVIEWING' ? 8_000 : activeState ? 18_000 : 45_000;
    const timer = window.setInterval(() => {
      if (!busyAction && !openingAddressRef.current) void refreshSnapshot(true);
    }, interval);
    return () => window.clearInterval(timer);
  }, [busyAction, refreshSnapshot, snapshot?.state.status]);

  useEffect(() => {
    if (!walletAddress) {
      setWalletBalance(null);
      return;
    }
    let cancelled = false;
    const refreshBalance = async () => {
      try {
        const balance = await readWalletBalance(readClient, walletAddress);
        if (!cancelled) setWalletBalance(balance);
      } catch {
        if (!cancelled) setWalletBalance(null);
      }
    };
    void refreshBalance();
    const timer = window.setInterval(() => { void refreshBalance(); }, 25_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [readClient, walletAddress]);

  const openWalletPicker = async () => {
    setNotice(null);
    try {
      const wallets = await discoverInjectedWallets();
      setWalletOptions(wallets);
      setWalletDiscoveryComplete(true);
      if (!wallets.length) {
        setNotice({ kind: 'error', title: 'No wallet extensions detected', message: 'Enable the wallet extensions for this site and rescan. Wallets must expose EIP-1193 or EIP-6963 to appear.' });
        return;
      }
      setWalletPickerOpen(true);
    } catch (error) {
      setNotice({ kind: 'error', title: 'Wallet scan failed', message: humanizeTransactionError(error) });
    }
  };

  const connectWallet = async () => {
    await openWalletPicker();
  };

  const connectWithWallet = async (wallet: InjectedWalletOption) => {
    setIsConnecting(true);
    setNotice(null);
    try {
      const accounts = await wallet.provider.request({ method: 'eth_requestAccounts' });
      const account = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;
      if (!account) throw new Error('The selected wallet did not grant an account. Choose an account in the extension and try again.');
      const chain = await wallet.provider.request({ method: 'eth_chainId' });
      setProvider(wallet.provider);
      setSelectedWallet(wallet);
      setWalletAddress(account);
      setChainIdHex(typeof chain === 'string' ? chain : null);
      setWalletPickerOpen(false);
      if (typeof chain === 'string' && !isCorrectNetwork(chain)) {
        setNotice({ kind: 'info', title: `${wallet.name} connected on another network`, message: 'Switch to Studionet (chain 61999) before signing campaign transactions.' });
      }
    } catch (error) {
      setWalletPickerOpen(false);
      setNotice({ kind: 'error', title: `${wallet.name} connection not completed`, message: humanizeTransactionError(error) });
    } finally {
      setIsConnecting(false);
    }
  };

  const switchToStudionet = async () => {
    const currentProvider = provider ?? getEthereumProvider();
    if (!currentProvider) return;
    try {
      await ensureStudionet(currentProvider);
      const chain = await currentProvider.request({ method: 'eth_chainId' });
      setChainIdHex(typeof chain === 'string' ? chain : null);
      setNotice({ kind: 'success', title: 'Studionet selected', message: 'The wallet is now configured for chain 61999.' });
    } catch (error) {
      setNotice({ kind: 'error', title: 'Network switch not completed', message: humanizeTransactionError(error) });
    }
  };

  const setCampaignUrl = (address: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('campaign', address);
    window.history.replaceState({}, '', url);
  };

  const openCampaign = async (address: string) => {
    openingAddressRef.current = address;
    snapshotRequestId.current += 1;
    setOpeningCampaign(true);
    setOpenDialogError('');
    let opened = false;
    try {
      const loaded = await fetchSnapshot(address);
      currentAddressRef.current = address;
      snapshotRequestId.current += 1;
      setContractAddress(address);
      setSnapshot(loaded);
      setActiveTransaction(null);
      setLoadError('');
      setCampaignUrl(address);
      setOpenDialogOpen(false);
      setNotice({ kind: 'success', title: 'Campaign state refreshed', message: 'The displayed state and evidence were read from finalized Studionet contract storage.' });
      opened = true;
    } catch (error) {
      const message = humanizeTransactionError(error);
      setOpenDialogError(message);
      throw new Error(message);
    } finally {
      openingAddressRef.current = null;
      setOpeningCampaign(false);
      setIsLoading(false);
      setIsRefreshing(false);
      if (!opened && !snapshot) window.setTimeout(() => { void refreshSnapshot(false); }, 0);
    }
  };

  const track = (address: string, hash: string, method: ContractMethod, label: string, status = 'PENDING', success?: boolean) => {
    const entry: TrackedTransaction = {
      hash,
      label,
      method,
      status,
      createdAt: Date.now(),
      contractAddress: address,
      success,
    };
    saveTrackedTransaction(address, entry);
  };

  const watch = async (
    address: string,
    hash: string,
    method: ContractMethod,
    label: string,
  ): Promise<GenLayerTransaction> => {
    const result = await watchTransaction(readClient, hash, (transaction, pollMessage) => {
      const currentStatus = statusName(transaction);
      setActiveTransaction({
        hash,
        method,
        status: currentStatus,
        message: pollMessage ?? label,
        tx: transaction,
      });
      track(address, hash, method, label, currentStatus);
    });
    setActiveTransaction({ hash, method, status: statusName(result), message: label, tx: result });
    track(address, hash, method, label, statusName(result));
    return result;
  };

  const assertWalletContext = async () => {
    if (!provider || !walletAddress) throw new Error('Connect a wallet before submitting a contract transaction.');
    const [chainValue, accountsValue] = await Promise.all([
      provider.request({ method: 'eth_chainId' }),
      provider.request({ method: 'eth_accounts' }),
    ]);
    const activeChain = typeof chainValue === 'string' ? chainValue : null;
    setChainIdHex(activeChain);
    if (!isCorrectNetwork(activeChain)) throw new Error('Switch the wallet to Studionet (chain 61999) before signing.');
    const activeAccount = Array.isArray(accountsValue) && typeof accountsValue[0] === 'string' ? accountsValue[0] : null;
    if (!activeAccount || activeAccount.toLowerCase() !== walletAddress.toLowerCase()) {
      setWalletAddress(activeAccount);
      throw new Error('The active wallet account changed. Confirm the campaign role shown in the workspace, then retry.');
    }
  };

  const writeAt = async (
    address: string,
    method: WriteMethod,
    args: (string | number | bigint | boolean)[] = [],
    value = 0n,
  ): Promise<{ hash: string; tx: GenLayerTransaction }> => {
    await assertWalletContext();
    if (!provider || !walletAddress) throw new Error('The wallet connection changed. Reconnect and retry.');
    const client = createWalletClient(provider, walletAddress);
    setProgressMessage(`Confirm ${method.replaceAll('_', ' ')} in your wallet…`);
    const hash = await client.writeContract({
      address: address as Address,
      functionName: method,
      args,
      value,
      leaderOnly: false,
      consensusMaxRotations: 3,
    });
    track(address, hash, method, methodLabel(method));
    setActiveTransaction({ hash, method, status: 'PENDING', message: methodLabel(method) });
    setProgressMessage(`${methodLabel(method)} · waiting for Studionet finality…`);
    const tx = await watch(address, hash, method, methodLabel(method));
    try {
      assertTransactionSucceeded(tx);
      track(address, hash, method, methodLabel(method), statusName(tx), true);
    } catch (error) {
      track(address, hash, method, methodLabel(method), statusName(tx), false);
      throw error;
    }
    setProgressMessage(`${methodLabel(method)} · finalized`);
    return { hash, tx };
  };

  const waitForSettlementChildren = async (parentHash: string): Promise<GenLayerTransaction[]> => {
    const childHashes = await readClient.getTriggeredTransactionIds({ hash: parentHash as TransactionHash });
    const receipts: GenLayerTransaction[] = [];
    for (const childHash of childHashes) {
      setProgressMessage('Parent transaction finalized · waiting for settlement transfer finality…');
      setActiveTransaction({ hash: childHash, method: 'settlement_child', status: 'PENDING', message: 'SETTLEMENT TRANSFER CHILD' });
      const receipt = await watchTransaction(readClient, childHash, (transaction, pollMessage) => {
        setActiveTransaction({
          hash: childHash,
          method: 'settlement_child',
          status: statusName(transaction),
          message: pollMessage ?? 'SETTLEMENT TRANSFER CHILD',
          tx: transaction as unknown as GenLayerTransaction,
        });
      });
      receipts.push(receipt as unknown as GenLayerTransaction);
    }
    return receipts;
  };

  const deployAtWallet = async (): Promise<{ address: string; hash: string }> => {
    await assertWalletContext();
    if (!provider || !walletAddress) throw new Error('The wallet connection changed. Reconnect before deploying.');
    setProgressMessage('Loading the canonical Intelligent Contract source…');
    const code = await loadContractSource();
    const client = createWalletClient(provider, walletAddress);
    setProgressMessage('Confirm the new contract deployment in your wallet…');
    const hash = await client.deployContract({
      code,
      args: [],
      leaderOnly: false,
      consensusMaxRotations: 3,
    });
    setActiveTransaction({ hash, method: 'deploy', status: 'PENDING', message: 'CAMPAIGN CONTRACT DEPLOYMENT' });
    setProgressMessage('Contract deployment submitted · waiting for Studionet finality…');
    const tx = await watchTransaction(readClient, hash, (transaction, pollMessage) => {
      setActiveTransaction({
        hash,
        method: 'deploy',
        status: statusName(transaction),
        message: pollMessage ?? 'CAMPAIGN CONTRACT DEPLOYMENT',
        tx: transaction,
      });
    });
    assertTransactionSucceeded(tx);
    const deployedAddress = String(tx.to_address ?? tx.recipient ?? '');
    if (!isAddress(deployedAddress)) {
      throw new Error('The finalized deployment receipt did not expose the new contract address. Open the deployment transaction in Studio before retrying.');
    }
    track(deployedAddress, hash, 'deploy', 'CAMPAIGN CONTRACT DEPLOYED', statusName(tx), true);
    setActiveTransaction({ hash, method: 'deploy', status: statusName(tx), message: 'CAMPAIGN CONTRACT DEPLOYED', tx });
    setContractAddress(deployedAddress);
    setSnapshot(null);
    setIsLoading(true);
    setLoadError('');
    setCampaignUrl(deployedAddress);
    return { address: deployedAddress, hash };
  };

  const handleLockCampaign = async (input: LockCampaignInput) => {
    if (!walletAddress) throw new Error('Connect the brand wallet before creating a campaign.');
    if (!correctNetwork) throw new Error('Switch the wallet to Studionet (chain 61999) before signing.');
    if (walletAddress.toLowerCase() === input.creatorAddress.toLowerCase()) {
      throw new Error('The creator must be a different wallet from the deploying brand.');
    }
    if (snapshot?.state.status === 'DRAFT') {
      const pendingSetup = latestPendingActivity(snapshot.activities, 'create_campaign') ?? latestPendingActivity(snapshot.activities, 'fund_campaign');
      if (pendingSetup) {
        throw new Error(`${pendingSetup.method.replaceAll('_', ' ')} is still ${pendingSetup.status ?? 'pending'} (${shortAddress(pendingSetup.hash)}). Wait for finality or refresh before retrying.`);
      }
    }

    snapshotRequestId.current += 1;
    setBusyAction('campaign_setup');
    setDialogError('');
    setNotice(null);
    let targetAddress = contractAddress;
    try {
      let current = snapshot;
      const isBrandOnEmptyInstance = Boolean(
        current?.state.status === 'DRAFT' &&
        !current.state.campaign_created &&
        current.state.brand.toLowerCase() === walletAddress.toLowerCase(),
      );
      const expiredConfiguredDraft = Boolean(
        current?.state.status === 'DRAFT' &&
        current.state.campaign_created &&
        Number(current.state.submission_deadline_ts) > 0 &&
        current.chainTimestamp > Number(current.state.submission_deadline_ts),
      );
      const isBrandOnConfiguredDraft = Boolean(
        current?.state.status === 'DRAFT' &&
        current.state.campaign_created &&
        !expiredConfiguredDraft &&
        current.state.brand.toLowerCase() === walletAddress.toLowerCase(),
      );

      if (!isBrandOnEmptyInstance && !isBrandOnConfiguredDraft) {
        const balance = await readWalletBalance(readClient, walletAddress);
        if (balance < input.rewardWei) {
          throw new Error('This wallet does not have enough GEN to cover the exact reward. Add Studionet test GEN or lower the reward before deploying.');
        }
        const deployment = await deployAtWallet();
        targetAddress = deployment.address;
        current = await fetchSnapshot(targetAddress);
        setSnapshot(current);
        if (current.state.brand.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error('The deployed IC did not record the connected wallet as brand. Stop here and inspect the deployment transaction.');
        }
      }

      if (!current || !isBrandOnEmptyInstance && !isBrandOnConfiguredDraft) {
        current = await fetchSnapshot(targetAddress);
      }
      if (!current.state.campaign_created) {
        if (current.state.brand.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error('Only the deployer/brand can lock terms on this contract. Deploy a fresh instance from the connected wallet.');
        }
        setProgressMessage('Locking the creator, reward and submission window on-chain…');
        await writeAt(targetAddress, 'create_campaign', [
          input.creatorAddress,
          input.rewardWei,
          input.submissionWindowSeconds,
        ]);
        current = await fetchSnapshot(targetAddress);
        setSnapshot(current);
        if (!current.state.campaign_created || current.state.status !== 'DRAFT') {
          throw new Error('The create transaction finalized, but the finalized campaign state did not match the requested terms. Inspect the contract before continuing.');
        }
      } else {
        if (current.state.creator.toLowerCase() !== input.creatorAddress.toLowerCase() || BigInt(current.state.reward_wei) !== input.rewardWei) {
          throw new Error('Campaign terms are already locked on-chain and differ from this form. They cannot be edited; open a fresh deployment.');
        }
      }

      if (current.state.status === 'DRAFT') {
        const balance = await readWalletBalance(readClient, walletAddress);
        const exactReward = BigInt(current.state.reward_wei);
        if (balance < exactReward) {
          throw new Error('Campaign terms are on-chain, but the connected brand wallet does not have enough GEN to fund the exact reward. Add Studionet test GEN, then resume this setup.');
        }
        setProgressMessage(`Funding exactly ${input.rewardWei.toString()} wei from the brand wallet…`);
        await writeAt(targetAddress, 'fund_campaign', [], exactReward);
        current = await fetchSnapshot(targetAddress);
        setSnapshot(current);
      }

      if (current.state.status !== 'FUNDED' || BigInt(current.state.escrow_wei) !== BigInt(current.state.reward_wei)) {
        throw new Error('Funding transaction finalized, but the contract does not report the exact reward in escrow. Do not resubmit; inspect the state and child transactions.');
      }
      setContractAddress(targetAddress);
      setCampaignUrl(targetAddress);
      setCreateDialogOpen(false);
      setProgressMessage('');
      setNotice({ kind: 'success', title: 'Campaign locked and funded', message: `The contract confirms ${current.state.reward_wei} wei in escrow. Creator submissions are now tied to this instance.` });
    } catch (error) {
      const message = humanizeTransactionError(error);
      setDialogError(message);
      setNotice({ kind: 'error', title: 'Campaign setup did not complete', message });
      try {
        const latest = await fetchSnapshot(targetAddress);
        setSnapshot(latest);
        setLoadError('');
      } catch (refreshError) {
        setLoadError(humanizeTransactionError(refreshError));
      }
      throw new Error(message);
    } finally {
      setBusyAction('');
      setProgressMessage('');
    }
  };

  const runAction = async (label: string, action: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    snapshotRequestId.current += 1;
    setBusyAction(label);
    setNotice(null);
    let completed = false;
    try {
      await action();
      completed = true;
    } catch (error) {
      setNotice({ kind: 'error', title: `${label} not completed`, message: humanizeTransactionError(error) });
    } finally {
      setBusyAction('');
      setProgressMessage('');
      await refreshSnapshot(true);
    }
    return completed;
  };

  const handleFund = () => runAction('fund campaign', async () => {
    const current = snapshot?.state;
    if (!current?.campaign_created || current.status !== 'DRAFT') throw new Error('The contract is not in a fundable DRAFT state.');
    if (role !== 'brand') throw new Error('Only the campaign brand can fund this instance.');
    const reward = BigInt(current.reward_wei);
    const balance = await readWalletBalance(readClient, walletAddress ?? '');
    if (balance < reward) throw new Error('This wallet does not have enough GEN to fund the exact reward.');
    await writeAt(contractAddress, 'fund_campaign', [], reward);
    const updated = await fetchSnapshot(contractAddress);
    setSnapshot(updated);
    if (updated.state.status !== 'FUNDED' || BigInt(updated.state.escrow_wei) !== reward) {
      throw new Error('The finalized contract read does not show the exact agreed reward in escrow.');
    }
    setNotice({ kind: 'success', title: 'Escrow funded', message: `${reward.toString()} wei is recorded as campaign escrow.` });
  });

  const handleSubmitCopy = async (copy: string) => runAction('submit copy', async () => {
    if (!snapshot?.state) throw new Error('Load the campaign state before submitting.');
    if (role !== 'creator') throw new Error('Only the named creator wallet can submit copy.');
    if (copy.length > 2_000) throw new Error('Copy exceeds the contract’s 2,000-character limit.');
    await writeAt(contractAddress, 'submit_copy', [copy]);
    const updated = await fetchSnapshot(contractAddress);
    setSnapshot(updated);
    if (updated.copy !== copy || !['SUBMITTED'].includes(updated.state.status)) {
      throw new Error('The contract did not return the submitted copy and SUBMITTED state after finality.');
    }
    setNotice({ kind: 'success', title: 'Copy submitted', message: 'The finalized contract read contains the exact submitted text and its copy hash.' });
  });

  const handleBeginReview = () => runAction('begin review', async () => {
    if (!['brand', 'creator'].includes(role)) throw new Error('Only the brand or named creator can start review.');
    await writeAt(contractAddress, 'begin_review');
    const updated = await fetchSnapshot(contractAddress);
    setSnapshot(updated);
    if (updated.state.status !== 'REVIEWING') throw new Error('The contract did not enter REVIEWING after finality.');
    setNotice({ kind: 'success', title: 'Review opened', message: 'The contract is in REVIEWING. Submit the next transaction to run evidence retrieval and validator comparison.' });
  });

  const handleRunReview = () => runAction('GenLayer review', async () => {
    if (!['brand', 'creator'].includes(role)) throw new Error('Only a campaign party can submit the review call.');
    const { hash } = await writeAt(contractAddress, 'review_campaign');
    setProgressMessage('Review finalized · checking any settlement transfer child…');
    let childReceipts: GenLayerTransaction[] = [];
    try {
      childReceipts = await waitForSettlementChildren(hash);
    } catch (error) {
      setNotice({ kind: 'info', title: 'Review finalized; transfer receipt still unavailable', message: humanizeTransactionError(error) });
    }
    const updated = await fetchSnapshot(contractAddress);
    const settlementChildren = childReceipts.length ? childReceipts : updated.settlementChildren;
    setSnapshot({ ...updated, settlementChildren });
    const settlementChild = settlementChildren.at(-1);
    if (updated.state.status === 'PAID') {
      if (isExactSettlementTransfer(settlementChild, updated.state.creator, updated.state.reward_wei)) {
        setNotice({ kind: 'success', title: 'Campaign condition met', message: 'The finalized contract result is CLEARED and its exact creator transfer receipt is verified.' });
      } else {
        setNotice({ kind: 'info', title: 'CLEARED result recorded; transfer pending', message: 'The contract result is authoritative. The transfer is not verified until a finalized child receipt matches the creator and exact reward.' });
      }
    } else if (updated.state.status === 'REVISION_ALLOWED') {
      setNotice({ kind: 'info', title: 'One revision available', message: `The contract recorded ${updated.state.last_verdict}. The reward remains in escrow.` });
    } else if (updated.state.status === 'REFUNDED') {
      if (isExactSettlementTransfer(settlementChild, updated.state.brand, updated.state.reward_wei)) {
        setNotice({ kind: 'info', title: 'Campaign condition not met', message: 'The contract recorded a final FLAGGED review and the exact refund transfer is verified.' });
      } else {
        setNotice({ kind: 'info', title: 'FLAGGED result recorded; refund pending', message: 'The contract result is authoritative. The brand refund is not verified until its finalized child receipt matches the exact amount and recipient.' });
      }
    } else if (updated.state.status === 'INCONCLUSIVE') {
      setNotice({ kind: 'info', title: 'Evidence insufficient', message: 'No payout occurred. The escrow remains in the contract until the resolution-timeout refund path.' });
    }
  });

  const handleTimeoutRefund = () => runAction('timeout refund', async () => {
    const { hash } = await writeAt(contractAddress, 'refund_after_timeout');
    let childReceipts: GenLayerTransaction[] = [];
    try {
      childReceipts = await waitForSettlementChildren(hash);
    } catch (error) {
      setNotice({ kind: 'info', title: 'Refund transaction finalized; transfer receipt still unavailable', message: humanizeTransactionError(error) });
    }
    const updated = await fetchSnapshot(contractAddress);
    const settlementChildren = childReceipts.length ? childReceipts : updated.settlementChildren;
    setSnapshot({ ...updated, settlementChildren });
    if (updated.state.status !== 'REFUNDED') throw new Error('The finalized contract state does not show REFUNDED.');
    if (isExactSettlementTransfer(settlementChildren.at(-1), updated.state.brand, updated.state.reward_wei)) {
      setNotice({ kind: 'success', title: 'Timeout refund verified', message: 'The contract reports REFUNDED and its finalized child receipt credits the exact reward to the brand.' });
    } else {
      setNotice({ kind: 'info', title: 'Refund recorded; transfer pending', message: 'The contract reports REFUNDED, but no exact finalized refund receipt is available yet.' });
    }
  });

  const handleRetrySettlement = () => runAction('settlement retry', async () => {
    const beforeState = snapshot?.state;
    const failedDepositRefundWei = String(beforeState?.failed_refund_wei ?? '0');
    const failedDepositRefundRecipient = beforeState?.failed_refund_recipient;
    let retryingDepositRefund = false;
    try { retryingDepositRefund = BigInt(failedDepositRefundWei) > 0n; } catch { /* contract state is validated by the IC read */ }
    const { hash } = await writeAt(contractAddress, 'retry_failed_settlement');
    let childReceipts: GenLayerTransaction[] = [];
    try {
      childReceipts = await waitForSettlementChildren(hash);
    } catch (error) {
      setNotice({ kind: 'info', title: 'Retry finalized; transfer receipt still unavailable', message: humanizeTransactionError(error) });
    }
    const updated = await fetchSnapshot(contractAddress);
    const settlementChildren = childReceipts.length ? childReceipts : updated.settlementChildren;
    setSnapshot({ ...updated, settlementChildren });
    const expectedRecipient = retryingDepositRefund
      ? failedDepositRefundRecipient
      : updated.state.status === 'PAID'
        ? updated.state.creator
        : updated.state.status === 'REFUNDED' ? updated.state.brand : undefined;
    const expectedAmount = retryingDepositRefund ? failedDepositRefundWei : updated.state.reward_wei;
    if (expectedRecipient && isExactSettlementTransfer(settlementChildren.at(-1), expectedRecipient, expectedAmount)) {
      setNotice({
        kind: 'success',
        title: retryingDepositRefund ? 'Deposit refund retry verified' : 'Settlement retry verified',
        message: retryingDepositRefund
          ? 'The finalized transfer child credits the recorded amount to the original funder.'
          : `The finalized transfer child credits the exact reward to ${updated.state.status === 'PAID' ? 'the creator' : 'the brand'}.`,
      });
    } else if (retryingDepositRefund && BigInt(String(updated.state.failed_refund_wei ?? '0')) > 0n) {
      setNotice({ kind: 'error', title: 'Deposit refund remains failed', message: 'The contract still records a failed deposit refund. The saved recipient and amount are available for another retry.' });
    } else if (updated.state.status === 'PAYOUT_FAILED' || updated.state.status === 'REFUND_FAILED') {
      setNotice({ kind: 'error', title: 'Settlement remains failed', message: 'The contract still records a failed transfer. The exact recipient and amount remain on-chain; refresh before retrying again.' });
    } else {
      setNotice({ kind: 'info', title: 'Retry finalized; receipt not verified', message: 'The contract state was refreshed, but the exact recipient and amount are not yet confirmed by a finalized child transfer.' });
    }
  });

  const showNewCampaign = () => {
    if (busy || openingCampaign) return;
    setDialogError('');
    setCreateDialogOpen(true);
  };
  const showOpenCampaign = () => {
    if (busy || openingCampaign) return;
    setOpenDialogError('');
    setOpenDialogOpen(true);
  };
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(contractAddress);
      setNotice({ kind: 'success', title: 'Address copied', message: 'The campaign instance address is on your clipboard.' });
    } catch {
      setNotice({ kind: 'info', title: 'Campaign instance', message: contractAddress });
    }
  };
  const openExplorerAddress = () => window.open(explorerAddressUrl(contractAddress), '_blank', 'noopener,noreferrer');

  return (
    <div className="app-shell" id="top">
      <a className="skip-link" href="#main-content">Skip to campaign record</a>
      <TopBar
        walletAddress={walletAddress}
        walletAvailable={walletAvailable}
        correctNetwork={correctNetwork}
        role={walletAddress ? role : 'viewer'}
        isConnecting={isConnecting}
        busy={busy || openingCampaign}
        onConnect={() => void connectWallet()}
        onSwitchNetwork={() => void switchToStudionet()}
        onOpenCampaign={showOpenCampaign}
        onNewCampaign={showNewCampaign}
        contractAddress={contractAddress}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
        walletName={selectedWallet?.name ?? 'Browser wallet'}
        onChangeWallet={() => void openWalletPicker()}
      />

      <main className="workspace-frame" id="main-content">
        <div className="workspace-heading">
          <div>
            <div className="page-eyebrow"><span>EU HEALTH CLAIMS</span><i /> SINGLE-CAMPAIGN ESCROW</div>
            <h1>Folate <em>campaign record</em></h1>
            <p className="page-subtitle">A traceable settlement decision, from source evidence to finalized transfer.</p>
          </div>
          <div className="heading-actions">
            <div className="live-record-label"><span className="live-record-dot" /> LIVE CONTRACT READ</div>
            <button className="refresh-button" type="button" onClick={() => void refreshSnapshot(false)} disabled={isRefreshing || busy}>
              <Icon name="refresh" size={14} /> {isRefreshing ? 'Refreshing…' : 'Refresh state'}
            </button>
          </div>
        </div>

        {walletAddress && !correctNetwork && (
          <div className="network-warning" role="status">
            <Icon name="alert" size={16} />
            <div><strong>Wallet on the wrong network</strong><span>Reads remain live. Switch to Studionet, chain 61999, before signing any contract action.</span></div>
            <button type="button" onClick={() => void switchToStudionet()}>Switch to Studionet <Icon name="arrow" size={13} /></button>
          </div>
        )}

        {!walletAddress && (
          <div className="read-only-notice">
            <span className="read-only-indicator" />
            <span>PUBLIC READ · Connect a wallet to submit or sign campaign actions.</span>
          </div>
        )}

        {progressMessage && !createDialogOpen && (
          <div className="action-progress-banner" role="status" aria-live="polite">
            <span className="progress-pulse" />
            <div><strong>{progressMessage}</strong><span>{activeTransaction?.hash ? `Transaction · ${activeTransaction.hash}` : 'Waiting for wallet or network response.'}</span></div>
            {activeTransaction?.hash && <a href={explorerTransactionUrl(activeTransaction.hash)} target="_blank" rel="noreferrer">Open transaction <Icon name="external" size={12} /></a>}
          </div>
        )}

        {notice && (
          <div className={`notice-banner notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span className="notice-marker">{notice.kind === 'success' ? <Icon name="check" size={15} /> : notice.kind === 'error' ? <Icon name="alert" size={15} /> : 'i'}</span>
            <div><strong>{notice.title}</strong><span>{notice.message}</span></div>
            <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss message"><Icon name="close" size={14} /></button>
          </div>
        )}

        {loadError && (
          <div className="load-error" role="alert">
            <Icon name="alert" size={16} />
            <div><strong>Campaign state could not be read</strong><span>{loadError}</span></div>
            <button type="button" onClick={() => void refreshSnapshot(false)}>Retry read</button>
          </div>
        )}

        <div className={`workspace-grid ${snapshot ? '' : 'workspace-grid-empty'}`}>
          {snapshot ? (
            <>
              <CampaignBrief
                snapshot={snapshot}
                contractAddress={contractAddress}
                role={walletAddress ? role : 'viewer'}
                onCopyAddress={() => void copyAddress()}
                onOpenExplorer={openExplorerAddress}
              />

              <div className="workspace-main-column">
                <EvidenceTrail
                  snapshot={snapshot}
                  activeTransaction={activeTransaction}
                  isLastStored={storedReviewIsPrior}
                  explorerTx={explorerTransactionUrl}
                />
                <div className="evidence-documents-grid">
                  <ClaimRecord review={snapshot.reviews.at(-1)} isLastStored={storedReviewIsPrior} />
                  <ProductEvidence review={snapshot.reviews.at(-1)} isLastStored={storedReviewIsPrior} />
                </div>
                <GenLayerReview
                  snapshot={snapshot}
                  activeTransaction={activeTransaction}
                  isLastStored={storedReviewIsPrior}
                  explorerTx={explorerTransactionUrl}
                />
                <CopyComposer
                  snapshot={snapshot}
                  activeTransaction={activeTransaction}
                  isLastStored={storedReviewIsPrior}
                  campaignAddress={contractAddress}
                  walletAddress={walletAddress}
                  role={role}
                  correctNetwork={correctNetwork}
                  busy={busy}
                  onSubmit={handleSubmitCopy}
                />
                <ActivityLedger snapshot={snapshot} explorerTx={explorerTransactionUrl} />
              </div>

              <SettlementPanel
                snapshot={snapshot}
                isLastStored={storedReviewIsPrior}
                walletAddress={walletAddress}
                role={role}
                correctNetwork={correctNetwork}
                busy={busy}
                activeHash={activeHash}
                onOpenCampaign={showNewCampaign}
                onFund={() => void handleFund()}
                onBeginReview={() => void handleBeginReview()}
                onRunReview={() => void handleRunReview()}
                onTimeoutRefund={() => void handleTimeoutRefund()}
                onRetrySettlement={() => void handleRetrySettlement()}
                explorerTx={explorerTransactionUrl}
              />
            </>
          ) : isLoading ? (
            <div className="loading-record loading-record-wide">
              <span className="progress-pulse" />
              <div><strong>Reading campaign instance</strong><p>Fetching finalized contract state from Studionet.</p></div>
            </div>
          ) : (
            <section className="no-contract-state">
              <div className="no-contract-mark"><Icon name="document" size={20} /></div>
              <div className="section-overline"><span>NO LIVE RECORD</span> / {shortAddress(contractAddress, 10, 7)}</div>
              <h2>No campaign state loaded</h2>
              <p>The workspace will not show a placeholder verdict or guessed campaign status. Open a real Studionet instance or deploy a new contract from the brand wallet.</p>
              <div className="no-contract-actions">
                <button className="dialog-cancel" type="button" onClick={showOpenCampaign}><Icon name="link" size={14} /> Open by address</button>
                <button className="primary-action" type="button" onClick={showNewCampaign}>Deploy a new campaign <Icon name="arrow" size={15} /></button>
              </div>
              <span className="no-contract-note">A new deployment makes the connected wallet the brand. Existing terminal instances cannot be reused for another campaign.</span>
            </section>
          )}
        </div>

        <footer className="workspace-footer">
          <span>STUDIONET · CHAIN 61999</span>
          <p><span className="footer-disclaimer-callout">Not legal approval or certification.</span> This application is an evidence-based campaign settlement mechanism, not legal advice or legal certification.</p>
          <a href={explorerAddressUrl(contractAddress)} target="_blank" rel="noreferrer">View contract <Icon name="external" size={11} /></a>
        </footer>
      </main>

      <CreateCampaignDialog
        open={createDialogOpen}
        snapshot={snapshot}
        contractAddress={contractAddress}
        walletAddress={walletAddress}
        walletAvailable={walletAvailable}
        walletBalance={walletBalance}
        correctNetwork={correctNetwork}
        onConnectWallet={() => void connectWallet()}
        onSwitchNetwork={() => void switchToStudionet()}
        busy={busyAction === 'campaign_setup'}
        progress={progressMessage}
        error={dialogError}
        onClose={() => { if (!busy) setCreateDialogOpen(false); }}
        onSubmit={handleLockCampaign}
      />
      <OpenCampaignDialog
        open={openDialogOpen}
        currentAddress={contractAddress}
        loading={openingCampaign}
        error={openDialogError}
        onClose={() => setOpenDialogOpen(false)}
        onOpen={openCampaign}
      />
      <WalletPickerDialog
        open={walletPickerOpen}
        wallets={walletOptions}
        selectedWalletId={selectedWallet?.id}
        busy={isConnecting}
        onSelect={(wallet) => void connectWithWallet(wallet)}
        onClose={() => setWalletPickerOpen(false)}
        onRescan={() => void openWalletPicker()}
      />
    </div>
  );
}

function isStoredReviewPrior(snapshot: CampaignSnapshot | null, activeTransaction: ActiveTransaction): boolean {
  if (!snapshot?.reviews.length) return false;
  const storedCopyHash = snapshot.reviews.at(-1)?.copy_sha256;
  const currentCopyHash = snapshot.state.copy_sha256;
  if (storedCopyHash && currentCopyHash && storedCopyHash.toLowerCase() !== currentCopyHash.toLowerCase()) return true;
  if (snapshot.state.status === 'REVIEWING') return true;
  const latestAttempt = [...snapshot.activities].reverse().find((item) => item.method === 'review_campaign');
  const latestSuccessful = [...snapshot.activities].reverse().find((item) => item.method === 'review_campaign' && item.success);
  const storedHash = latestSuccessful?.hash ?? (snapshot.reviewTransaction?.hash ? String(snapshot.reviewTransaction.hash) : undefined);
  const attemptHash = activeTransaction?.method === 'review_campaign'
    ? activeTransaction.hash
    : latestAttempt?.hash ?? (snapshot.reviewTransaction?.hash ? String(snapshot.reviewTransaction.hash) : undefined);
  return Boolean(storedHash && attemptHash && storedHash.toLowerCase() !== attemptHash.toLowerCase());
}

function getRole(state: CampaignSnapshot['state'] | undefined, address: string | null): string {
  if (!state || !address) return 'viewer';
  if (state.brand?.toLowerCase() === address.toLowerCase()) return 'brand';
  if (state.creator?.toLowerCase() === address.toLowerCase()) return 'creator';
  return 'viewer';
}

function methodLabel(method: WriteMethod): string {
  const labels: Record<WriteMethod, string> = {
    create_campaign: 'CAMPAIGN TERMS LOCKED',
    fund_campaign: 'ESCROW FUNDING',
    submit_copy: 'CREATOR COPY SUBMISSION',
    begin_review: 'REVIEW OPENED',
    review_campaign: 'GENLAYER REVIEW',
    refund_after_timeout: 'TIMEOUT REFUND',
    retry_failed_settlement: 'SETTLEMENT RETRY',
  };
  return labels[method];
}
