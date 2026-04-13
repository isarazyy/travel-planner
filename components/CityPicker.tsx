'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { HOT_CITIES, CITY_DATA } from '@/lib/city-data';

interface CityPickerProps {
  value?: string;
  onSelect: (city: string) => void;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onConfirm?: () => void;
  selected?: string[];
  placeholder?: string;
  /** inline mode: render as a full input with dropdown */
  inline?: boolean;
  className?: string;
}

export default function CityPicker({
  value,
  onSelect,
  onChange,
  onKeyDown,
  onConfirm,
  selected,
  placeholder,
  inline,
  className,
}: CityPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isInline = !!inline;
  const displaySearch = isInline ? (value ?? '') : search;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const alreadySelected = new Set(selected || []);

  const rawQuery = displaySearch.trim();
  const filterQuery = rawQuery
    ? (rawQuery.split(/[\s,，、]+/).pop() || '')
    : '';
  const filteredGroups = filterQuery
    ? CITY_DATA.map((g) => ({
        ...g,
        cities: g.cities.filter((c) => c.includes(filterQuery)),
      })).filter((g) => g.cities.length > 0)
    : CITY_DATA;

  const filteredHot = filterQuery
    ? HOT_CITIES.filter((c) => c.includes(filterQuery))
    : HOT_CITIES;

  const pick = useCallback((city: string) => {
    onSelect(city);
    setSearch('');
    if (isInline) {
      setOpen(false);
    }
  }, [onSelect, isInline]);

  function scrollToLetter(letter: string) {
    letterRefs.current[letter]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleInputChange(val: string) {
    if (isInline && onChange) {
      onChange(val);
    } else {
      setSearch(val);
    }
    if (!open) setOpen(true);
  }

  const dropdown = (
    <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[380px] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {!filterQuery && (
          <div className="w-7 shrink-0 overflow-y-auto border-r border-gray-100 py-1 flex flex-col items-center gap-0.5">
            {CITY_DATA.map((g) => (
              <button
                key={g.letter}
                type="button"
                onClick={() => scrollToLetter(g.letter)}
                className="text-[10px] font-medium text-gray-400 hover:text-orange-600 w-5 h-5 flex items-center justify-center rounded hover:bg-orange-50 transition"
              >
                {g.letter}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredHot.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-orange-600 mb-1.5">热门城市</p>
              <div className="flex flex-wrap gap-1.5">
                {filteredHot.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pick(c)}
                    disabled={alreadySelected.has(c)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition ${
                      alreadySelected.has(c)
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredGroups.map((g) => (
            <div key={g.letter} ref={(el) => { letterRefs.current[g.letter] = el; }} className="mb-2.5">
              <p className="text-xs font-semibold text-gray-400 mb-1">{g.letter}</p>
              <div className="flex flex-wrap gap-1.5">
                {g.cities.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pick(c)}
                    disabled={alreadySelected.has(c)}
                    className={`px-2.5 py-1 text-xs rounded-md border transition ${
                      alreadySelected.has(c)
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {filteredGroups.length === 0 && filteredHot.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">没找到，回车直接添加</p>
          )}
        </div>
      </div>
    </div>
  );

  if (isInline) {
    const hasInput = !!(value ?? '').trim();
    return (
      <div className="relative" ref={panelRef}>
        <div className="relative flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              inputMode="text"
              enterKeyHint="done"
              value={value ?? ''}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              placeholder={placeholder || '输入或选择城市'}
              maxLength={50}
              className={className || 'w-full rounded-lg border border-gray-200 bg-white pl-3 pr-9 py-2.5 text-gray-900 outline-none transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20'}
            />
            <button
              type="button"
              onClick={() => { setOpen(!open); if (!open) inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-orange-600 transition"
            >
              <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {hasInput && onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="shrink-0 px-3 py-2.5 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 active:bg-orange-700 transition whitespace-nowrap"
            >
              添加
            </button>
          )}
        </div>
        {open && dropdown}
      </div>
    );
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:border-orange-400 hover:text-orange-600 transition"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        {placeholder || '选城市'}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[340px] sm:w-[420px] max-h-[420px] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索城市..."
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20"
            />
          </div>

          <div className="flex flex-1 overflow-hidden">
            {!search.trim() && (
              <div className="w-7 shrink-0 overflow-y-auto border-r border-gray-100 py-1 flex flex-col items-center gap-0.5">
                {CITY_DATA.map((g) => (
                  <button
                    key={g.letter}
                    type="button"
                    onClick={() => scrollToLetter(g.letter)}
                    className="text-[10px] font-medium text-gray-400 hover:text-orange-600 w-5 h-5 flex items-center justify-center rounded hover:bg-orange-50 transition"
                  >
                    {g.letter}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {filteredHot.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-orange-600 mb-1.5">热门城市</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredHot.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => pick(c)}
                        disabled={alreadySelected.has(c)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition ${
                          alreadySelected.has(c)
                            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredGroups.map((g) => (
                <div key={g.letter} ref={(el) => { letterRefs.current[g.letter] = el; }} className="mb-2.5">
                  <p className="text-xs font-semibold text-gray-400 mb-1">{g.letter}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.cities.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => pick(c)}
                        disabled={alreadySelected.has(c)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition ${
                          alreadySelected.has(c)
                            ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {filteredGroups.length === 0 && filteredHot.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">没找到，直接手动输入即可</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
