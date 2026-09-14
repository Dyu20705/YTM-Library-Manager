import React from 'react';
import { ChangePlan } from '../../planner/change_planner.js';
import { AlertCircle, Plus, Trash2, ArrowRight } from 'lucide-react';

interface ChangePlanModalProps {
  plan: ChangePlan | null;
  onApply: () => void;
  onCancel: () => void;
  isApplying?: boolean;
}

export const ChangePlanModal: React.FC<ChangePlanModalProps> = ({
  plan,
  onApply,
  onCancel,
  isApplying
}) => {
  if (!plan) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        style={{
          width: '520px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <AlertCircle size={22} color="#f59e0b" />
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Review Change Plan
          </h2>
        </div>

        {/* Count Preview */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '16px',
            backgroundColor: 'var(--bg-tertiary)',
            borderRadius: '8px',
            marginBottom: '20px'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Before</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {plan.beforeTrackCount}
            </div>
          </div>
          <ArrowRight size={20} color="#94a3b8" />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>After</div>
            <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {plan.afterTrackCount}
            </div>
          </div>
        </div>

        {/* Diff Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          {plan.summary.addedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontSize: '14px' }}>
              <Plus size={16} />
              <span><strong>+{plan.summary.addedCount}</strong> tracks will be added</span>
            </div>
          )}

          {plan.summary.removedCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--danger)', fontSize: '14px' }}>
              <Trash2 size={16} />
              <span><strong>-{plan.summary.removedCount}</strong> tracks will be removed</span>
            </div>
          )}

          {plan.summary.skippedCount > 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', paddingLeft: '24px' }}>
              ℹ️ {plan.summary.skippedCount} tracks will be skipped (Duplicate Policy: SKIP_EXISTING)
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={onCancel}
            disabled={isApplying}
            style={{
              padding: '8px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            Cancel
          </button>

          <button
            onClick={onApply}
            disabled={isApplying}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500
            }}
          >
            {isApplying ? 'Applying...' : `Apply ${plan.intents.length} Changes`}
          </button>
        </div>
      </div>
    </div>
  );
};
