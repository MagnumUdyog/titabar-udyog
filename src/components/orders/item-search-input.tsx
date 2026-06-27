"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/fetcher";

export interface InventorySearchItem {
  id: string;
  name: string;
  category: string;
  unit: string;
}

interface ItemSearchInputProps {
  value: string;
  selected: InventorySearchItem | null;
  unverified: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (item: InventorySearchItem | null) => void;
  onUnverifiedChange: (unverified: boolean) => void;
  inputRef?: React.Ref<HTMLInputElement | null>;
  onEnterNext?: () => void;
  onEscape?: () => void;
  onGoBack?: () => void;
  categories?: string[];
  className?: string;
}

const DEBOUNCE_MS = 200;

export function ItemSearchInput({
  value,
  selected,
  unverified,
  onQueryChange,
  onSelect,
  onUnverifiedChange,
  inputRef,
  onEnterNext,
  onEscape,
  onGoBack,
  categories,
  className,
}: ItemSearchInputProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || internalRef;
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [suggestions, setSuggestions] = useState<InventorySearchItem[]>([]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const showDropdown = focused && value.trim().length >= 1 && searched;

  const runSearch = useCallback(async (term: string) => {
    if (term.length < 1) {
      setSuggestions([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    try {
      const catQ = categories?.length ? `&categories=${categories.join(",")}` : "";
      const data = await api<{ results: InventorySearchItem[] }>(
        `/api/inventory/search?q=${encodeURIComponent(term)}${catQ}`
      );
      setSuggestions(data.results);
      setSearched(true);
      setHighlight(-1);
    } catch {
      setSuggestions([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [categories]);

  useEffect(() => {
    const term = value.trim();
    if (term.length < 1) {
      setSuggestions([]);
      setSearched(false);
      return;
    }

    const timer = setTimeout(() => {
      runSearch(term);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value, runSearch]);

  useEffect(() => {
    if (highlight >= 0 && itemRefs.current[highlight]) {
      itemRefs.current[highlight]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [highlight]);

  const pick = (item: InventorySearchItem) => {
    onSelect(item);
    onQueryChange(item.name);
    onUnverifiedChange(false);
    setHighlight(-1);
    setSearched(false);
    setSuggestions([]);
    requestAnimationFrame(() => {
      onEnterNext?.();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length > 0) {
        setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (showDropdown && highlight >= 0 && suggestions[highlight]) {
        pick(suggestions[highlight]);
        return;
      }
      if (showDropdown && suggestions.length === 1) {
        pick(suggestions[0]);
        return;
      }
      if (selected) {
        onEnterNext?.();
        return;
      }
      if (value.trim()) {
        onSelect(null);
        onUnverifiedChange(true);
        onEnterNext?.();
      }
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setHighlight(-1);
      onGoBack?.();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (showDropdown) {
        setSearched(false);
        setHighlight(-1);
        setSuggestions([]);
        return;
      }
      onEscape?.();
    }
  };

  const handleChange = (text: string) => {
    onQueryChange(text);
    if (selected && text !== selected.name) {
      onSelect(null);
      onUnverifiedChange(false);
    }
    if (!text.trim()) {
      onUnverifiedChange(false);
      setSuggestions([]);
      setSearched(false);
    }
  };

  const handleFocus = () => {
    setFocused(true);
    const term = value.trim();
    if (term.length > 0) {
      if (selected) onSelect(null);
      runSearch(term);
    }
  };

  return (
    <div className={cn("relative min-w-0 flex-1", className)}>
      <Input
        ref={ref}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={() => {
          setTimeout(() => setFocused(false), 150);
        }}
        placeholder="Type item name..."
        autoComplete="off"
        className="h-8 text-sm"
      />

      {showDropdown && (
        <ul className="absolute z-20 mt-0.5 max-h-48 w-full overflow-auto rounded-md border border-border bg-white py-1 shadow-lg">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="px-3 py-2">
                <Skeleton className="h-4 w-full" />
              </li>
            ))}
          {!loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No items found</li>
          )}
          {!loading &&
            suggestions.map((item, i) => (
              <li
                key={item.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                  i === highlight ? "bg-slate-100" : "hover:bg-slate-50"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <Badge status={item.category} className="shrink-0 text-[10px]" />
              </li>
            ))}
        </ul>
      )}

      {unverified && value.trim() && !selected && (
        <span className="mt-0.5 block text-xs text-amber-700">Unverified item</span>
      )}
    </div>
  );
}
