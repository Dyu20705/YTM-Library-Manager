import React from 'react';
import { DataFreshness } from '../../domain/types.js';
import { RefreshCw, CheckCircle2, Clock } from 'lucide-react';

interface DataFreshnessBadgeProps {
  freshness: DataFreshness;
  onTriggerSync?: () => void;
  isSyncing?: boolean;
}

export const DataFreshnessBadge: React.FC<DataFreshnessBadgeProps> = ({
  freshness,
  onTriggerSync,
  isSyncing
}) => {
  const getLabel = () => {
    if (!freshness.lastSuccessfulSyncAt) {
      return 'Never synced — Connect to start';
    }

    const diffMs = Date.now() - freshness.lastSuccessfulSyncAt.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'Synced just now';
    if (diffMins < 60) return `Synced ${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Synced ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Last sync: ${diffDays} days ago`;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '20px',
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border-color)',
          color: freshness.lastSuccessfulSyncAt ? 'var(--text-secondary)' : 'var(--warning)'
        }}
      >
        {freshness.lastSuccessfulSyncAt ? (
          <CheckCircle2 size={13} color="#10b981" />
        ) : (
          <Clock size={13} color="#f59e0b" />
        )}
        <span>{getLabel()}</span>
      </div>

      {onTriggerSync && (
        <button
          onClick={onTriggerSync}
          disabled={isSyncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            cursor: isSyncing ? 'not-allowed' : 'pointer'
          }}
        >
          <RefreshCw size={12} style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />
          <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
        </button>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
