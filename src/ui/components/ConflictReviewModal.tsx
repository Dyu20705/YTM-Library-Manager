import React from 'react';
import { AlertTriangle, XCircle, ArrowLeft } from 'lucide-react';

interface ConflictReviewModalProps {
  isOpen: boolean;
  conflictReason: string;
  diff?: {
    baseOrder: string[];
    currentOrder: string[];
    intentDescription: string;
  };
  onCancelRollback: () => void;
  onClose: () => void;
}

export const ConflictReviewModal: React.FC<ConflictReviewModalProps> = ({
  isOpen,
  conflictReason,
  diff,
  onCancelRollback,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100
      }}
    >
      <div
        style={{
          width: '640px',
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid #ef4444',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 30px -10px rgba(0, 0, 0, 0.7)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <AlertTriangle size={24} color="#ef4444" />
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Conflict Detected
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              External changes on another device prevent automatic rollback (V1 Conservative Policy)
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#fca5a5',
            marginBottom: '16px'
          }}
        >
          {conflictReason}
        </div>

        {diff && (
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' }}>
              Side-by-Side Comparison:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              >
                <strong style={{ color: 'var(--text-secondary)' }}>Base Order:</strong>
                <ol style={{ paddingLeft: '16px', marginTop: '6px', color: 'var(--text-muted)' }}>
                  {diff.baseOrder.map((id, i) => (
                    <li key={`b_${id}_${i}`}>{id}</li>
                  ))}
                </ol>
              </div>

              <div
                style={{
                  padding: '12px',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              >
                <strong style={{ color: 'var(--text-secondary)' }}>Current Remote Order:</strong>
                <ol style={{ paddingLeft: '16px', marginTop: '6px', color: '#60a5fa' }}>
                  {diff.currentOrder.map((id, i) => (
                    <li key={`c_${id}_${i}`}>{id}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onCancelRollback}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <XCircle size={15} /> Cancel Rollback (Keep Remote State)
          </button>

          <button
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <ArrowLeft size={15} /> Back to Library
          </button>
        </div>
      </div>
    </div>
  );
};
