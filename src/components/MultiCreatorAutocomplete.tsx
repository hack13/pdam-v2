import { useState, useEffect, useRef } from 'react';

interface Creator {
  id: string;
  name: string;
  slug: string;
}

interface MultiCreatorAutocompleteProps {
  creators: Creator[];
  onChange: (creators: Creator[]) => void;
  initialCreators?: Creator[];
  disabled?: boolean;
  className?: string;
}

export function MultiCreatorAutocomplete({
  creators,
  onChange,
  initialCreators,
  disabled = false,
  className = '',
}: MultiCreatorAutocompleteProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<Creator[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Creator[]>(initialCreators ?? []);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    setSelected(initialCreators ?? []);
  }, [initialCreators]);

  useEffect(() => {
    if (!inputValue.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/creators/search?q=${encodeURIComponent(inputValue)}`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data: Creator[] = await response.json();
          setSuggestions(data.filter((c) => !selected.some((s) => s.id === c.id)));
          setShowDropdown(data.filter((c) => !selected.some((s) => s.id === c.id)).length > 0);
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error('Failed to fetch creators:', error);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [inputValue, selected]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addCreator = (creator: Creator) => {
    if (selected.some((c) => c.id === creator.id)) return;
    const newList = [...selected, creator];
    setSelected(newList);
    onChange(newList);
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const addNewCreator = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (selected.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return;
    const newCreator: Creator = { id: `new:${trimmed}`, name: trimmed, slug: '' };
    const newList = [...selected, newCreator];
    setSelected(newList);
    onChange(newList);
    setInputValue('');
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeCreator = (id: string) => {
    const newList = selected.filter((c) => c.id !== id);
    setSelected(newList);
    onChange(newList);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : prev));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          addCreator(suggestions[selectedIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      addNewCreator(inputValue);
    }

    if (e.key === 'Backspace' && !inputValue && selected.length > 0) {
      removeCreator(selected[selected.length - 1].id);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (inputValue.trim() && !showDropdown) {
        addNewCreator(inputValue);
      }
    }, 200);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors focus-within:border-indigo-500 focus-within:bg-white/10">
        {selected.map((creator) => (
          <span
            key={creator.id}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
          >
            {creator.name}
            <button
              type="button"
              onClick={() => removeCreator(creator.id)}
              disabled={disabled}
              className="ml-0.5 text-indigo-400 hover:text-white disabled:opacity-50"
              aria-label={`Remove ${creator.name}`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <div className="relative min-w-[120px] flex-1">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={selected.length === 0 ? 'Search for creators...' : 'Add another...'}
            className="w-full bg-transparent py-0.5 text-sm text-white placeholder-zinc-500 outline-none"
            autoComplete="off"
          />
          {loading && (
            <div className="absolute right-0 top-1/2 -translate-y-1/2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent"></div>
            </div>
          )}
        </div>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full rounded-lg border border-white/10 bg-zinc-900 shadow-lg"
        >
          {suggestions.map((creator, index) => (
            <button
              key={creator.id}
              type="button"
              onClick={() => addCreator(creator)}
              className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                index === selectedIndex
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-white hover:bg-white/5'
              }`}
            >
              {creator.name}
            </button>
          ))}
        </div>
      )}

      <p className="mt-1 text-xs text-zinc-500">
        Search to select existing creators, or press Enter to add a new one
      </p>
    </div>
  );
}
