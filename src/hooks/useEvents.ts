'use client';

import type {
  AddEventInput,
  EventWithCreator,
  ImportEventsResult,
  UpdateEventInput,
} from '@/actions/events';
import {
  addEvent,
  deleteEvent,
  deleteEvents,
  getEventsByBuilding,
  importEvents,
  setKindooLicenseCreated,
  updateEvent,
} from '@/actions/events';
import { contactKeys } from '@/hooks/useContacts';
import type { Building } from '@/schema/schema';
import { normalizePhoneForStorage } from '@/utils/phoneUtils';
import { normalizeEmail } from '@/utils/stringUtils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const eventKeys = {
  all: ['events'] as const,
  byBuilding: (building: Building) => ['events', building] as const,
};

// ─── Fetch Hook ───────────────────────────────────────────────────────────────

export function useEvents(building: Building, initialData?: EventWithCreator[]) {
  return useQuery({
    queryKey: eventKeys.byBuilding(building),
    queryFn: async () => {
      const result = await getEventsByBuilding(building);
      if (!result.success) throw new Error(result.error);
      return (result.data ?? []) as EventWithCreator[];
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
      const result = await addEvent({
        ...input,
        email: normalizeEmail(input.email),
        phone: normalizePhoneForStorage(input.phone),
      });
      if (!result.success) throw new Error(result.error);
      return {
        event: result.data!,
        notificationDelivery: result.meta?.notificationDelivery,
      };
    },

    // Optimistic update
    onMutate: async (newEventInput) => {
      const queryKey = eventKeys.byBuilding(newEventInput.building);

      // Cancel in-flight refetches
      await queryClient.cancelQueries({ queryKey });

      // Snapshot current data for rollback
      const previousEvents = queryClient.getQueryData<EventWithCreator[]>(queryKey);

      // Optimistically insert
      const optimisticEvent: EventWithCreator = {
        id: `optimistic-${Date.now()}`,
        building: newEventInput.building,
        eventType: newEventInput.eventType ?? 'Private',
        eventDate: newEventInput.eventDate,
        startTime: newEventInput.startTime,
        endTime: newEventInput.endTime,
        contactId: `optimistic-contact-${Date.now()}`,
        description: newEventInput.description,
        kindooLicenseCreated: false,
        userId: 'pending',
        createdAt: new Date(),
        creatorName: null,
        creatorEmail: null,
        creatorRole: null,
        contactName: newEventInput.name,
        contactWard: newEventInput.ward,
        contactEmail: normalizeEmail(newEventInput.email) ?? null,
        contactPhone: normalizePhoneForStorage(newEventInput.phone) ?? null,
      };

      queryClient.setQueryData<EventWithCreator[]>(queryKey, (old = []) => [
        ...old,
        optimisticEvent,
      ]);

      return { previousEvents, queryKey };
    },

    // Rollback on error
    onError: (error, _variables, context) => {
      if (context?.previousEvents !== undefined && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousEvents as EventWithCreator[]);
      }
      toast.error(error.message ?? 'Failed to add event.');
    },

    // Always refetch after settle
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({
        queryKey: eventKeys.byBuilding(variables.building),
      });
      queryClient.invalidateQueries({ queryKey: contactKeys.all });
    },

    onSuccess: (payload) => {
      toast.success('Event added successfully!');
      const summary = payload.notificationDelivery;
      if (summary && (summary.skipped > 0 || summary.failed > 0)) {
        toast.warning(
          `SMS delivery: sent ${summary.sent}/${summary.attempted}, skipped ${summary.skipped}, failed ${summary.failed}.`
        );
      }
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

      const previousEvents = queryClient.getQueryData<EventWithCreator[]>(queryKey);
      queryClient.setQueryData<EventWithCreator[]>(queryKey, (old = []) =>
        old.filter((e) => e.id !== eventId)
      );

      return { previousEvents, queryKey };
    },

    onError: (error, _eventId, context) => {
      if (context?.previousEvents !== undefined && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousEvents as EventWithCreator[]);
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

export function useBulkDeleteEvents(building: Building) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventIds: string[]) => {
      const result = await deleteEvents(eventIds);
      if (!result.success) throw new Error(result.error);
      return eventIds;
    },

    onMutate: async (eventIds) => {
      const queryKey = eventKeys.byBuilding(building);
      await queryClient.cancelQueries({ queryKey });

      const previousEvents = queryClient.getQueryData<EventWithCreator[]>(queryKey);
      queryClient.setQueryData<EventWithCreator[]>(queryKey, (old = []) =>
        old.filter((event) => !eventIds.includes(event.id))
      );

      return { previousEvents, queryKey };
    },

    onError: (error, _eventIds, context) => {
      if (context?.previousEvents !== undefined && context?.queryKey) {
        queryClient.setQueryData(context.queryKey, context.previousEvents as EventWithCreator[]);
      }
      toast.error(error.message ?? 'Failed to delete events.');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.byBuilding(building) });
    },

    onSuccess: () => {
      toast.success('Events deleted.');
    },
  });
}
export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateEventInput) => {
      const result = await updateEvent({
        ...input,
        email: normalizeEmail(input.email),
        phone: normalizePhoneForStorage(input.phone),
      });
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.all });

      const stakeKey = eventKeys.byBuilding('Stake Center');
      const maplesKey = eventKeys.byBuilding('Maples Building');

      const previousStake = queryClient.getQueryData<EventWithCreator[]>(stakeKey);
      const previousMaples = queryClient.getQueryData<EventWithCreator[]>(maplesKey);

      const mergedUpdate = (existing?: EventWithCreator): EventWithCreator => ({
        ...(existing ?? {
          id: input.id,
          userId: 'pending',
          createdAt: new Date(),
          building: input.building,
          eventType: input.eventType ?? 'Private',
          eventDate: input.eventDate,
          startTime: input.startTime,
          endTime: input.endTime,
          contactId: `optimistic-contact-${Date.now()}`,
          description: input.description,
          kindooLicenseCreated: false,
          creatorName: null,
          creatorEmail: null,
          creatorRole: null,
          contactName: input.name,
          contactWard: input.ward,
          contactEmail: normalizeEmail(input.email) ?? null,
          contactPhone: normalizePhoneForStorage(input.phone) ?? null,
        }),
        building: input.building,
        eventType: input.eventType ?? 'Private',
        eventDate: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        description: input.description,
        contactName: input.name,
        contactWard: input.ward,
        contactEmail: normalizeEmail(input.email) ?? null,
        contactPhone: normalizePhoneForStorage(input.phone) ?? null,
      });

      queryClient.setQueryData<EventWithCreator[]>(stakeKey, (old = []) => {
        const existing = old.find((e) => e.id === input.id);
        const filtered = old.filter((e) => e.id !== input.id);
        if (input.building === 'Stake Center') {
          return [...filtered, mergedUpdate(existing)];
        }
        return filtered;
      });

      queryClient.setQueryData<EventWithCreator[]>(maplesKey, (old = []) => {
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

export function useSetKindooLicenseCreated() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { eventId: string; kindooLicenseCreated: boolean }) => {
      const result = await setKindooLicenseCreated(input);
      if (!result.success) throw new Error(result.error);
      return result.data!;
    },

    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: eventKeys.all });

      const stakeKey = eventKeys.byBuilding('Stake Center');
      const maplesKey = eventKeys.byBuilding('Maples Building');

      const previousStake = queryClient.getQueryData<EventWithCreator[]>(stakeKey);
      const previousMaples = queryClient.getQueryData<EventWithCreator[]>(maplesKey);

      const applyUpdate = (old: EventWithCreator[] = []) =>
        old.map((event) =>
          event.id === input.eventId
            ? { ...event, kindooLicenseCreated: input.kindooLicenseCreated }
            : event
        );

      queryClient.setQueryData<EventWithCreator[]>(stakeKey, applyUpdate);
      queryClient.setQueryData<EventWithCreator[]>(maplesKey, applyUpdate);

      return { previousStake, previousMaples, stakeKey, maplesKey };
    },

    onError: (error, _input, context) => {
      if (context?.previousStake !== undefined) {
        queryClient.setQueryData(context.stakeKey, context.previousStake);
      }
      if (context?.previousMaples !== undefined) {
        queryClient.setQueryData(context.maplesKey, context.previousMaples);
      }
      toast.error(error.message ?? 'Failed to update Kindoo license status.');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },

    onSuccess: (event) => {
      toast.success(
        event.kindooLicenseCreated
          ? 'Kindoo license marked as completed.'
          : 'Kindoo license marked as not completed.'
      );
    },
  });
}

export function useImportEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (events: AddEventInput[]) => {
      const result = await importEvents({
        events: events.map((event) => ({
          ...event,
          email: normalizeEmail(event.email),
          phone: normalizePhoneForStorage(event.phone),
        })),
      });
      if (!result.success) throw new Error(result.error);
      return result.data as ImportEventsResult;
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}
