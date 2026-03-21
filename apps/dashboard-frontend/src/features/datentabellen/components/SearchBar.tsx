import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  debounceMs?: number;
}

const SearchBar = memo(function SearchBar({ onSearch, debounceMs = 300 }: SearchBarProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const q = e.target.value;
      setValue(q);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onSearch(q), debounceMs);
    },
    [onSearch, debounceMs]
  );

  const handleClear = useCallback(() => {
    setValue('');
    onSearch('');
  }, [onSearch]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none size-3.5" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="Suchen..."
        className="h-8 w-44 pl-8 pr-7 bg-background border border-border rounded-md text-foreground text-xs transition-all focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus:w-56"
        aria-label="Daten durchsuchen"
      />
      {value && (
        <button
          type="button"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-transparent border-none text-muted-foreground cursor-pointer p-0.5 rounded hover:text-foreground"
          onClick={handleClear}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
});

export default SearchBar;
