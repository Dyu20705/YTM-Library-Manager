import React from 'react';
import { ShieldAlert, LogIn } from 'lucide-react';
import { AppOperatingMode } from '../../domain/types.js';

interface LocalModeBannerProps {
  mode: AppOperatingMode;
  onConnectAccount?: () => void;
}

export const LocalModeBanner: React.FC<LocalModeBannerProps> = ({ mode, onConnectAccount }) => {
  if (mode !== 'LOCAL_ONLY') return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        borderBottom: '1px solid var(--warning)',
        color: '#fbbf24',
        fontSize: '13px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert size={16} color="#f59e0b" />
        <span>
          <strong>Local Mode Active:</strong> You are browsing cached local library data. Remote mutations and live sync are disabled until re-authenticated.
        </span>
      </div>

      {onConnectAccount && (
        <button
          onClick={onConnectAccount}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '4px',
            backgroundColor: 'var(--warning)',
            border: 'none',
            color: '#000',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          <LogIn size={13} /> Connect YouTube Music
        </button>
      )}
    </div>
  );
};
