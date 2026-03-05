'use client';

import { useQuery } from '@tanstack/react-query';
import { searchContacts, type ContactSearchResult } from '@/actions/contacts';

export const contactKeys = {
  all: ['contacts'] as const,
  search: (query: string) => ['contacts', 'search', query] as const,
};

export function useContactSearch(query: string, limit = 8) {
  const normalizedQuery = query.trim();

  return useQuery({
    queryKey: contactKeys.search(normalizedQuery),
    queryFn: async () => {
      const result = await searchContacts({ query: normalizedQuery, limit });
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []) as ContactSearchResult[];
    },
    enabled: normalizedQuery.length >= 2,
    staleTime: 1000 * 60,
  });
}
