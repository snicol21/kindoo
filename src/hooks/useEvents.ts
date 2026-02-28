'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEventsByBuilding, addEvent, deleteEvent, updateEvent } from '@/actions/events';
import type { Building, Event } from '@/schema/schema';
import type { AddEventInput, UpdateEventInput } from '@/actions/events';
import { toast } from 'sonner';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const eventKeys = {
  all: ['events'] as const,
  byBuilding: (building: Building) => ['events', building] as const,
};

// ─── Fetch Hook ───────────────────────────────────────────────────────────────

export function useEvents(building: Building, initialData?: Event[]) {
  return useQuery({
    queryKey: eventKeys.byBuilding(building),
    queryFn: async () => {
      const result = await getEventsByBuilding(building);
      if (!result.success) throw new Error(result.error);
      return result.data ?? [];
    },
    initialData,
    staleTime: 1000 * 60 * 2,
  });
}

// ─── Mutation Hook ────────────────────────────────────────────────────────────

export function useAddEvent(onSuccess?: () => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddEventInput) => {
      const result = await addEvent(input);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },

    // Optimistic update
    onMutate: async (newEventInput) => {
      const queryKey = eventKeys.byBuilding(newEventInput.building);

      // Cancel in-flight refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot current data for rollback
      const previousEvents = queryClient.getQueryData<Event[]>(queryKey);

      // Optimistically insert
      const optimisticEvent: Event = {
        id: `optimistic-${Date.now()}`,
        building: newEventInput.building,
        name: newEventInput.name,
        phone: newEventInput.phone ?? null,
        email: newEventInput.email,
        description: newEventInput.description,
        userId: 'pending',
        createdAt: new Date(),
      };

      queryClient.setQueryData<Event[]>(queryKey, (old = []) => [...old, optimisticEvent]);

      return { previousEvents, queryKey };
    },

    // Rollback on error
    onError: (error, _variables, context) => {
      if (context?.previousEvents !== undefined && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousEvents);
      }
      toast.error(error.message ?? 'Failed to add event.');
    },

    // Always refetch after settle
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: eventKeys.byBuilding(variables.building),
      });
    },

    onSuccess: () => {
      toast.success('Event added successfully!');
      onSuccess?.();
    },
  });
}

export function useDeleteEvent(building: Building) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventId: string) => {
      const result = await deleteEvent(eventId);
      if (!result.success) throw new Error(result.error);
      return eventId;
    },

    onMutate: async (eventId) => {
      const queryKey = eventKeys.byBuilding(building);
      await queryClient.cancelQueries({ queryKey });

      const previousEvents = queryClient.getQueryData<Event[]>(queryKey);
      queryClient.setQueryData<Event[]>(queryKey, (old = []) =>
        old.filter((e) => e.id !== eventId)
      );

      return { previousEvents, queryKey };
    },

    onError: (error, _eventId, context) => {
      if (context?.previousEvents !== undefined && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousEvents);
      }
      toast.error(error.message ?? 'Failed to delete event.');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.byBuilding(building) });
    },

    onSuccess: () => {
      toast.success('Event deleted.');
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEventInput) => {
      const result = await updateEvent(input);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.all });

      const stakeKey = eventKeys.byBuilding('Stake Center');
      const maplesKey = eventKeys.byBuilding('Maples Building');

      const previousStake = queryClient.getQueryData<Event[]>(stakeKey);
      const previousMaples = queryClient.getQueryData<Event[]>(maplesKey);

      const mergedUpdate = (existing?: Event): Event => ({
        ...(existing ?? {
          id: input.id,
          userId: 'pending',
          createdAt: new Date(),
          building: input.building,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email,
          description: input.description,
        }),
        building: input.building,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email,
        description: input.description,
      });

      queryClient.setQueryData<Event[]>(stakeKey, (old = []) => {
        const existing = old.find((e) => e.id === input.id);
        const filtered = old.filter((e) => e.id !== input.id);
        if (input.building === 'Stake Center') {
          return [...filtered, mergedUpdate(existing)];
        }
        return filtered;
      });

      queryClient.setQueryData<Event[]>(maplesKey, (old = []) => {
        const existing = old.find((e) => e.id === input.id);
        const filtered = old.filter((e) => e.id !== input.id);
        if (input.building === 'Maples Building') {
          return [...filtered, mergedUpdate(existing)];
        }
        return filtered;
      });

      return { previousStake, previousMaples, stakeKey, maplesKey };
    },

    onError: (error, _input, context) => {
      if (context?.previousStake !== undefined) {
        queryClient.setQueryData(context.stakeKey, context.previousStake);
      }
      if (context?.previousMaples !== undefined) {
        queryClient.setQueryData(context.maplesKey, context.previousMaples);
      }
      toast.error(error.message ?? 'Failed to update event.');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },

    onSuccess: () => {
      toast.success('Event updated.');
    },
  });
}
