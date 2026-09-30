import { Icon } from './Icons';
import { shortAddress } from '../lib/genlayer';

type Props = {
  walletAddress: string | null;
  walletAvailable: boolean;
  correctNetwork: boolean;
  role: string;
  isConnecting: boolean;
  busy: boolean;
  onConnect: () => void;
  onSwitchNetwork: () => void;
  onOpenCampaign: () => void;
  onNewCampaign: () => void;
  contractAddress: string;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
};

export function TopBar({
  walletAddress,
  walletAvailable,
  correctNetwork,
  role,
  isConnecting,
  busy,
  onConnect,
  onSwitchNetwork,
  onOpenCampaign,
  onNewCampaign,
  contractAddress,
  theme,
  onToggleTheme,
}: Props) {
  return (
    <header className="topbar">
      <a className="brand-lockup" href="#top" aria-label="Campaign workspace home">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
        <span className="brand-copy">
          <span className="brand-name">Evidence Office</span>
          <span className="brand-subtitle">Campaign settlement / EU claims</span>
        </span>
      </a>

      <div className="topbar-center">
        <div className={`network-badge ${correctNetwork ? 'network-good' : walletAddress ? 'network-wrong' : ''}`}>
          <span className="network-dot" />
          <span>STUDIONET</span>
          <span className="network-id">61999</span>
        </div>
        <span className="topbar-contract" title={contractAddress}>
          CAMPAIGN ID <b>{shortAddress(contractAddress, 8, 5)}</b>
        </span>
      </div>

      <div className="topbar-actions">
        <button className="topbar-link" onClick={onOpenCampaign} type="button" disabled={busy} aria-label="Open campaign by address">
          <Icon name="link" size={15} /> <span>Open instance</span>
        </button>
        <button className="topbar-link topbar-link-strong" onClick={onNewCampaign} type="button" disabled={busy} aria-label="Create a new campaign">
          <span className="plus-mark">+</span> <span>New campaign</span>
        </button>
        <button
          className="topbar-link theme-toggle"
          onClick={onToggleTheme}
          type="button"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          aria-pressed={theme === 'dark'}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        {walletAddress && !correctNetwork && (
          <button className="network-switch-button" onClick={onSwitchNetwork} type="button" disabled={busy}>
            Switch network
          </button>
        )}
        {walletAddress ? (
          <button className="wallet-pill" type="button" title={`Connected as ${role}: ${walletAddress}`}>
            <span className="wallet-state-dot" />
            <span className="wallet-address">{shortAddress(walletAddress, 6, 4)}</span>
            <span className="wallet-role">{role}</span>
          </button>
        ) : (
          <button
            className="connect-button"
            onClick={onConnect}
            disabled={!walletAvailable || isConnecting || busy}
            type="button"
            title={!walletAvailable ? 'No EIP-1193 wallet was detected' : undefined}
          >
            <Icon name="wallet" size={15} />
            {isConnecting ? 'Connecting…' : walletAvailable ? 'Connect wallet' : 'Wallet unavailable'}
          </button>
        )}
      </div>
    </header>
  );
}
