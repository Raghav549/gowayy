import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';

export interface SearchOption { id: string; label: string; sub?: string; keywords?: string }

/**
 * Accessible searchable select. Typing filters the real option set, the panel
 * opens under the field, and arrow keys / Enter / Escape work without a mouse.
 * The panel is portalled visually via z-index but stays inside the field so it
 * is never clipped by a parent with overflow.
 */
export function SearchSelect({ label, value, onChange, options, placeholder = 'Search…', emptyText = 'No matches', required }: {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  options: SearchOption[];
  placeholder?: string;
  emptyText?: string;
  required?: boolean;
}) {
  const selected = options.find((o) => o.id === value);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const term = text.trim().toLowerCase();
    if (!term) return options;
    return options.filter((o) => `${o.label} ${o.sub ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(term));
  }, [options, text]);

  useEffect(() => { setActive(0); }, [text]);

  const choose = (id: string) => {
    onChange(id);
    setText('');
    setOpen(false);
  };

  return (
    <div className="search-select" ref={wrap}>
      {label && <span className="label" id={`${label.replace(/\s+/g, '-').toLowerCase()}-label`}>{label}</span>}
      <div className={`search-select__control ${open ? 'is-open' : ''}`}>
        <Search size={15} aria-hidden="true" className="search-select__icon" />
        <input
          className="search-select__input"
          value={open ? text : (selected?.label ?? '')}
          placeholder={selected && !open ? selected.label : placeholder}
          aria-label={label ?? placeholder}
          aria-expanded={open}
          aria-controls="search-select-panel"
          aria-autocomplete="list"
          role="combobox"
          required={required}
          onFocus={() => { setOpen(true); setText(''); }}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); choose(filtered[active].id); }
            if (e.key === 'Escape') { setOpen(false); }
          }}
        />
        <ChevronDown size={15} aria-hidden="true" className="search-select__chevron" />
      </div>
      {open && (
        <div className="search-select__panel" id="search-select-panel" role="listbox" aria-label={label ?? 'Options'}>
          {filtered.slice(0, 40).map((o, i) => (
            <button
              key={o.id}
              type="button"
              role="option"
              aria-selected={o.id === value}
              className={`search-select__option ${i === active ? 'is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o.id)}
            >
              <span className="search-select__option-body">
                <span className="search-select__option-title">{o.label}</span>
                {o.sub && <span className="search-select__option-sub">{o.sub}</span>}
              </span>
              {o.id === value && <span className="badge">Selected</span>}
            </button>
          ))}
          {filtered.length === 0 && <div className="search-select__empty">{emptyText}</div>}
        </div>
      )}
    </div>
  );
}
