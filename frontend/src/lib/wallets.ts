import type { Eip1193Provider, InjectedWalletOption } from './types';

type Eip6963Info = {
  uuid?: string;
  name?: string;
  icon?: string;
  rdns?: string;
};

type ProviderWithWalletMetadata = Eip1193Provider & {
  providers?: Eip1193Provider[];
  info?: Eip6963Info;
  isZerion?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  isTrust?: boolean;
  isOkxWallet?: boolean;
  isPhantom?: boolean;
  isFrame?: boolean;
  isTokenPocket?: boolean;
  isMetaMask?: boolean;
};

const LEGACY_WALLET_FLAGS: Array<[keyof ProviderWithWalletMetadata, string]> = [
  ['isZerion', 'Zerion'],
  ['isRabby', 'Rabby'],
  ['isCoinbaseWallet', 'Coinbase Wallet'],
  ['isBraveWallet', 'Brave Wallet'],
  ['isTrust', 'Trust Wallet'],
  ['isOkxWallet', 'OKX Wallet'],
  ['isPhantom', 'Phantom'],
  ['isFrame', 'Frame'],
  ['isTokenPocket', 'TokenPocket'],
  ['isMetaMask', 'MetaMask'],
];

function isProvider(value: unknown): value is Eip1193Provider {
  return Boolean(value && typeof value === 'object' && typeof (value as Eip1193Provider).request === 'function');
}

function safeIcon(value?: string): string | undefined {
  return value && /^data:image\/(?:svg\+xml|png|webp|jpeg|gif)(?:;|,)/i.test(value) ? value : undefined;
}

function legacyName(provider: Eip1193Provider, index: number): string {
  const candidate = provider as ProviderWithWalletMetadata;
  if (typeof candidate.info?.name === 'string' && candidate.info.name.trim()) return candidate.info.name.trim();
  const matched = LEGACY_WALLET_FLAGS.find(([flag]) => candidate[flag] === true);
  return matched?.[1] ?? `Browser wallet ${index + 1}`;
}

/**
 * Discover injected wallets using EIP-6963, then include legacy providers exposed
 * through window.ethereum / window.ethereum.providers without duplicating instances.
 */
export async function discoverInjectedWallets(waitMs = 450): Promise<InjectedWalletOption[]> {
  if (typeof window === 'undefined') return [];

  const discovered: InjectedWalletOption[] = [];
  const seenProviders = new Set<Eip1193Provider>();
  const add = (provider: Eip1193Provider, info?: Eip6963Info) => {
    if (seenProviders.has(provider)) return;
    seenProviders.add(provider);
    const ordinal = discovered.length + 1;
    const name = typeof info?.name === 'string' && info.name.trim()
      ? info.name.trim()
      : legacyName(provider, ordinal - 1);
    const rdns = typeof info?.rdns === 'string' && info.rdns.trim() ? info.rdns.trim() : undefined;
    const id = typeof info?.uuid === 'string' && info.uuid.trim()
      ? info.uuid.trim()
      : `${rdns ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ordinal}`;
    discovered.push({ id, name, rdns, icon: safeIcon(info?.icon), provider });
  };

  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: Eip6963Info; provider?: unknown }>).detail;
    if (detail && isProvider(detail.provider)) add(detail.provider, detail.info);
  };

  window.addEventListener('eip6963:announceProvider', onAnnounce as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((resolve) => window.setTimeout(resolve, waitMs));
  window.removeEventListener('eip6963:announceProvider', onAnnounce as EventListener);

  const injected = (window as Window & { ethereum?: ProviderWithWalletMetadata }).ethereum;
  const legacyProviders = Array.isArray(injected?.providers) ? [...injected.providers] : [];
  if (injected) legacyProviders.push(injected);
  legacyProviders.forEach((provider) => {
    if (isProvider(provider)) add(provider, (provider as ProviderWithWalletMetadata).info);
    else if (isProvider(injected)) add(injected, injected.info);
  });

  return discovered;
}
