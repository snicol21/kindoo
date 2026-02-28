import { QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

// Server-side: one QueryClient per request
export const getQueryClient = cache(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 2, // 2 minutes
          gcTime: 1000 * 60 * 10, // 10 minutes
          retry: 2,
          refetchOnWindowFocus: true,
        },
      },
    })
);

// Client-side singleton
let browserQueryClient: QueryClient | undefined;

export function getClientQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return getQueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 2,
          gcTime: 1000 * 60 * 10,
          retry: 2,
          refetchOnWindowFocus: true,
        },
      },
    });
  }

  return browserQueryClient;
}
