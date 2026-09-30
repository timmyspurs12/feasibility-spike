import { useEffect, useState, type FormEvent } from 'react';
import { isAddress } from 'viem';
import { shortAddress } from '../lib/genlayer';
import { Icon } from './Icons';

type Props = {
  open: boolean;
  currentAddress: string;
  loading: boolean;
  error: string;
  onClose: () => void;
  onOpen: (address: string) => Promise<void>;
};

export function OpenCampaignDialog({ open, currentAddress, loading, error, onClose, onOpen }: Props) {
  const [address, setAddress] = useState(currentAddress);
  const [localError, setLocalError] = useState('');
  useEffect(() => {
    if (open) {
      setAddress(currentAddress);
      setLocalError('');
    }
  }, [open, currentAddress]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, loading, onClose]);
  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError('');
    if (!isAddress(address.trim())) {
      setLocalError('Enter a valid 20-byte Intelligent Contract address.');
      return;
    }
    try {
      await onOpen(address.trim());
    } catch (openError) {
      setLocalError(openError instanceof Error ? openError.message : 'This contract could not be loaded.');
    }
  }

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) onClose(); }}>
      <section className="campaign-dialog open-dialog" role="dialog" aria-modal="true" aria-labelledby="open-campaign-heading">
        <div className="dialog-topline">
          <div>
            <div className="section-overline"><span>STUDIONET</span> / CONTRACT READ</div>
            <h2 id="open-campaign-heading">Open campaign instance</h2>
          </div>
          <button className="icon-button dialog-close" onClick={onClose} type="button" disabled={loading} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="dialog-intro">Read the contract’s current finalized state and evidence record directly from Studionet. No wallet is required to inspect an instance.</p>
        <form onSubmit={submit}>
          <div className="form-field">
            <label className="fact-label" htmlFor="contract-address">INTELLIGENT CONTRACT ADDRESS</label>
            <input id="contract-address" value={address} onChange={(event) => setAddress(event.target.value)} spellCheck={false} autoComplete="off" placeholder="0x…" />
            <span className="field-note">CURRENT INSTANCE · {shortAddress(currentAddress, 9, 6)}</span>
          </div>
          {(localError || error) && <div className="dialog-error" role="alert"><Icon name="alert" size={15} />{localError || error}</div>}
          {loading && <div className="dialog-progress"><span className="progress-pulse" /><span>Reading finalized contract state…</span></div>}
          <div className="dialog-footer">
            <button className="dialog-cancel" type="button" onClick={onClose} disabled={loading}>Cancel</button>
            <button className="primary-action" type="submit" disabled={loading || !isAddress(address.trim())}>
              Open instance <Icon name="arrow" size={15} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
