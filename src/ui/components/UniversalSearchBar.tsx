import React, { useState } from 'react';
import { Search, X, Sparkles } from 'lucide-react';

interface UniversalSearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

export const UniversalSearchBar: React.FC<UniversalSearchBarProps> = ({ onSearch, isLoading: _isLoading }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handlePillClick = (filterPrefix: string) => {
    const newQuery = query ? `${query} ${filterPrefix}` : filterPrefix;
    setQuery(newQuery);
  };

  return (
    <div style={{ width: '100%', marginBottom: '16px' }}>
      <form onSubmit={handleSubmit} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search
          size={18}
          color="#94a3b8"
          style={{ position: 'absolute', left: '14px', pointerEvents: 'none' }}
        />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search everything... e.g. artist:Ado year:>2022 NOT playlist:Workout"
          style={{
            width: '100%',
            height: '44px',
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '0 40px 0 44px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            outline: 'none',
            fontFamily: 'inherit'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              onSearch('');
            }}
            style={{
              position: 'absolute',
              right: '12px',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        )}
      </form>

      {/* Filter Quick Pills */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Sparkles size={12} /> Syntax:
        </span>
        {[
          { label: 'artist:', val: 'artist:' },
          { label: 'album:', val: 'album:' },
          { label: 'playlist:', val: 'playlist:' },
          { label: 'year:>2020', val: 'year:>2020' },
          { label: 'duration:<300', val: 'duration:<300' },
          { label: 'liked:true', val: 'liked:true' },
          { label: 'NOT', val: 'NOT' },
          { label: 'OR', val: 'OR' }
        ].map(pill => (
          <button
            key={pill.label}
            type="button"
            onClick={() => handlePillClick(pill.val)}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'monospace'
            }}
          >
            {pill.label}
          </button>
        ))}
      </div>
    </div>
  );
};
