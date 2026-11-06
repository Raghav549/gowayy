import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import type { SearchHit } from '@gowayy/types';
import { client } from '../lib/client';

export type SearchScope = 'all' | 'commerce' | 'food' | 'destinations';

const SCOPE_KINDS: Record<Exclude<SearchScope, 'all'>, Set<string>> = {
  commerce: new Set(['product', 'store', 'grocery', 'food', 'restaurant']),
  food: new Set(['food', 'restaurant', 'product', 'store']),
  destinations: new Set(['destination', 'attraction', 'property', 'package', 'experience']),
};

/** Shared debounce used by both the search API and service-specific filters. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface UniversalSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  scope?: SearchScope;
  placeholder?: string;
  label?: string;
  autoFocus?: boolean;
  variant?: 'default' | 'compact' | 'page';
  /** The full search page already renders results, so it does not need a second popup. */
  suggestions?: boolean;
}

/**
 * The single customer search control. Every surface uses the same server-backed
 * client.search() API, keyboard behaviour, loading/error/empty states and result
 * navigation. Service pages may additionally apply the same query to their real
 * category/PIN filters; no surface implements a competing suggestion engine.
 */
export function UniversalSearch({
  value, onChange, onSubmit, scope = 'all',
  placeholder = 'Search destinations, stays, food, shops…',
  label = 'Search GOWAYY', autoFocus = false, variant = 'default', suggestions = true,
}: UniversalSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `search-suggestions-${useId().replace(/:/g, '')}`;
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebouncedValue(value);
  const term = debounced.trim();
  const hits = useQuery({
    queryKey: ['universal-search', term],
    queryFn: () => client.search(term),
    enabled: suggestions && term.length > 1,
    staleTime: 30_000,
    retry: 1,
  });
  const visibleHits = useMemo(() => {
    const all = hits.data ?? [];
    const allowed = scope === 'all' ? null : SCOPE_KINDS[scope];
    return (allowed ? all.filter((hit) => allowed.has(hit.kind)) : all).slice(0, 8);
  }, [hits.data, scope]);
  const open = suggestions && focused && value.trim().length > 1;

  useEffect(() => { setActive(0); }, [debounced, scope]);

  const submit = () => {
    const query = value.trim();
    if (open && visibleHits[active]) {
      setFocused(false);
      navigate(visibleHits[active].href);
      return;
    }
    if (!query) { inputRef.current?.focus(); return; }
    setFocused(false);
    if (onSubmit) onSubmit(query);
    else navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const choose = (hit: SearchHit) => {
    setFocused(false);
    navigate(hit.href);
  };

  return (
    <div
      className={`search-field${variant === 'compact' ? ' search-field--compact' : ''}${variant === 'page' ? ' search-field--page' : ''}`}
      role="search"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <Search size={18} aria-hidden="true" className="search-field__icon" />
      <input
        ref={inputRef}
        className="search-field__input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        autoFocus={autoFocus}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && visibleHits[active] ? `${listId}-${active}` : undefined}
        onChange={(event) => { onChange(event.target.value); setActive(0); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && open) {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(0, visibleHits.length - 1)));
          } else if (event.key === 'ArrowUp' && open) {
            event.preventDefault();
            setActive((index) => Math.max(0, index - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape') {
            setFocused(false);
            inputRef.current?.blur();
          }
        }}
      />
      {value && (
        <button type="button" className="search-field__clear" aria-label="Clear search" onClick={() => { onChange(''); inputRef.current?.focus(); }}>
          <X size={16} />
        </button>
      )}
      <button type="button" className="search-field__submit" onClick={submit}>Search</button>

      {open && (
        <div className="search-suggestions" id={listId} role="listbox" aria-label={`${label} suggestions`}>
          {term.length <= 1 && <div className="search-suggestions__state small muted">Keep typing…</div>}
          {hits.isLoading && <div className="search-suggestions__state small muted" role="status">Searching GOWAYY…</div>}
          {hits.isError && (
            <div className="search-suggestions__state small" role="alert">
              Search is unavailable. <button type="button" className="link" onClick={() => void hits.refetch()}>Try again</button>
            </div>
          )}
          {hits.isSuccess && visibleHits.length === 0 && <div className="search-suggestions__state small muted">No matches for “{value.trim()}”.</div>}
          {visibleHits.map((hit, index) => (
            <button
              key={`${hit.kind}-${hit.id}`}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`search-suggestion ${index === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(hit)}
            >
              <Search size={14} aria-hidden="true" />
              <span className="search-suggestion__body">
                <span className="search-suggestion__title">{hit.title}</span>
                <span className="search-suggestion__sub">{hit.subtitle}</span>
              </span>
              <span className="badge">{hit.kind.replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
