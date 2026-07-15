import { useState, useEffect, useRef } from 'react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export function TagInput({
  tags,
  onChange,
  disabled = false,
  placeholder = 'Add tags...',
  id,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [previousTags, setPreviousTags] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/assets/tags', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tags?: string[] } | null) => {
        if (data?.tags) setPreviousTags(data.tags);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const query = inputValue.trim().toLowerCase();
    const available = previousTags.filter(
      (tag) => !tags.includes(tag) && (!query || tag.includes(query))
    );
    setSuggestions(available);
    setShowDropdown(available.length > 0);
    setSelectedIndex(-1);
  }, [inputValue, previousTags, tags]);

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

  function addTag(value: string) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || tags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onChange([...tags, trimmed]);
    setInputValue('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
          addTag(suggestions[selectedIndex]);
        } else if (inputValue.trim()) {
          addTag(inputValue);
        }
        return;
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        return;
      }
    }

    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault();
      for (const part of inputValue.split(',')) addTag(part);
    }

    if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className="relative">
      <div className="flex min-h-[46px] flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-black/20 px-3 py-2 transition-colors focus-within:border-indigo-400/60 focus-within:bg-black/30">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-indigo-400 hover:text-white"
              disabled={disabled}
              aria-label={`Remove ${tag}`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addTag(inputValue);
          }}
          disabled={disabled}
          className="min-w-[100px] flex-1 bg-transparent py-0.5 text-sm text-white placeholder-zinc-500 outline-none"
          placeholder={tags.length === 0 ? placeholder : ''}
          autoComplete="off"
        />
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-lg"
        >
          {suggestions.slice(0, 12).map((tag, index) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors ${
                index === selectedIndex ? 'bg-indigo-500/20 text-indigo-300' : 'text-white hover:bg-white/5'
              }`}
            >
              <svg className="h-3.5 w-3.5 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
