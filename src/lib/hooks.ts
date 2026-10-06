"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useQueryWithAuth<TData, TError>(
  queryKey: string[],
  queryFn: () => Promise<TData>,
  options?: { enabled?: boolean; staleTime?: number; retry?: number | boolean }
) {
  return useQuery<TData, TError>({
    queryKey,
    queryFn,
    ...options,
  });
}

export function useInvalidateQuery() {
  const queryClient = useQueryClient();
  return (queryKey: string[]) => queryClient.invalidateQueries({ queryKey });
}
