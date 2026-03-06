'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ward } from '@/schema/schema';
import { searchContacts, type ContactSearchResult } from '@/actions/contacts';

export const contactKeys = {
  all: ['contacts'] as const,
  search: (query: string, ward?: Ward, limit = 8) =>
    ['contacts', 'search', query, ward ?? 'all', limit] as const,
};

export function useContactSearch(
  query: string,
  options: {
    limit?: number;
    ward?: Ward;
    debounceMs?: number;
  } = {}
) {
  const limit = options.limit ?? 8;
  const debounceMs = options.debounceMs ?? 180;
  const normalizedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState(normalizedQuery);

  useEffect(() => {
    if (!normalizedQuery) {
      setDebouncedQuery('');
      return;
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [debounceMs, normalizedQuery]);

  return useQuery({
    queryKey: contactKeys.search(debouncedQuery, options.ward, limit),
    queryFn: async () => {
      const result = await searchContacts({
        query: debouncedQuery,
        limit,
        ward: options.ward,
      });
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []) as ContactSearchResult[];
    },
    enabled: debouncedQuery.length >= 2,
    placeholderData: (previousData) => previousData,
    staleTime: 1000 * 60,
  });
}
