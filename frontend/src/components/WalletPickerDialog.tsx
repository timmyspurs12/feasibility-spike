import type { InjectedWalletOption } from '../lib/types';
import { Icon } from './Icons';

type Props = {
  open: boolean;
  wallets: InjectedWalletOption[];
  selectedWalletId?: string;
  busy: boolean;
  onSelect: (wallet: InjectedWalletOption) => void;
  onClose: () => void;
  onRescan: () => void;
};

export function WalletPickerDialog({ open, wallets, selectedWalletId, busy, onSelect, onClose, onRescan }: Props) {
  if (!open) return null;

  return (
    <div className="dialog-scrim wallet-picker-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="campaign-dialog open-dialog wallet-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-picker-title">
        <div className="dialog-topline">
          <div>
            <div className="section-overline"><span>WALLET CONNECTION</span> / INJECTED EXTENSIONS</div>
            <h2 id="wallet-picker-title">Choose a wallet</h2>
          </div>
          <button className="icon-button dialog-close" type="button" onClick={onClose} disabled={busy} aria-label="Close wallet chooser"><Icon name="close" size={16} /></button>
        </div>
        <p className="dialog-intro">Select the browser wallet you want to connect. The extension will ask you to approve access before this page can read your account.</p>

        {wallets.length ? (
          <div className="wallet-choice-list" aria-label="Available wallet extensions">
            {wallets.map((wallet) => (
              <button
                className={`wallet-choice ${wallet.id === selectedWalletId ? 'wallet-choice-selected' : ''}`}
                key={wallet.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(wallet)}
              >
                <span className="wallet-choice-icon" aria-hidden="true">
                  {wallet.icon ? <img src={wallet.icon} alt="" /> : <Icon name="wallet" size={17} />}
                </span>
                <span className="wallet-choice-copy">
                  <strong>{wallet.name}</strong>
                  <small>{wallet.rdns ?? 'Browser extension'}{wallet.id === selectedWalletId ? ' · currently selected' : ''}</small>
                </span>
                <Icon name="arrow" size={15} />
              </button>
            ))}
          </div>
        ) : (
          <div className="wallet-empty-state">
            <Icon name="wallet" size={20} />
            <strong>No injected wallets detected</strong>
            <span>Enable the wallet extension for this site, then rescan or reload the page.</span>
          </div>
        )}

        <div className="wallet-picker-footer">
          <span>Only approve a wallet you recognize. Signing remains on the selected extension.</span>
          <button className="dialog-inline-action" type="button" onClick={onRescan} disabled={busy}>Rescan extensions</button>
        </div>
      </section>
    </div>
  );
}
