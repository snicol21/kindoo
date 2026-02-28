'use client';

import { useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useAddEvent } from '@/hooks/useEvents';
import type { Building, Ward } from '@/schema/schema';
import { BUILDINGS, WARDS } from '@/schema/schema';

interface AddEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBuilding?: Building;
}

interface FormState {
  errors?: {
    building?: string;
    ward?: string;
    name?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    phone?: string;
    email?: string;
    description?: string;
    general?: string;
  };
  values?: {
    building?: string;
    ward?: string;
    name?: string;
    eventDate?: string;
    startTime?: string;
    endTime?: string;
    phone?: string;
    email?: string;
    description?: string;
  };
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';

  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.slice(1);
  }
  if (normalized.length > 10) {
    normalized = normalized.slice(0, 10);
  }

  if (normalized.length <= 3) return normalized;
  if (normalized.length <= 6) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3)}`;
  }
  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function formatYmd(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTomorrowYmd() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatYmd(tomorrow);
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="gap-2">
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Adding Event…
        </>
      ) : (
        'Add Event'
      )}
    </Button>
  );
}

export function AddEventDialog({
  open,
  onOpenChange,
  defaultBuilding = 'Stake Center',
}: AddEventDialogProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const { mutate: addEventMutation, isPending } = useAddEvent(() => {
    onOpenChange(false);
  });
  const minEventDate = getTomorrowYmd();

  const handlePhoneInput = (event: ChangeEvent<HTMLInputElement>) => {
    event.target.value = formatPhone(event.target.value);
  };

  // Client-side validation state using useActionState
  const [state, formAction] = useActionState<FormState, FormData>(
    async (_prevState, formData): Promise<FormState> => {
      const building = formData.get('building') as Building | null;
      const ward = formData.get('ward') as Ward | null;
      const name = formData.get('name') as string | null;
      const eventDate = formData.get('eventDate') as string | null;
      const startTime = formData.get('startTime') as string | null;
      const endTime = formData.get('endTime') as string | null;
      const phone = formData.get('phone') as string | null;
      const email = formData.get('email') as string | null;
      const description = formData.get('description') as string | null;

      const formattedPhone = phone ? formatPhone(phone) : null;

      const errors: FormState['errors'] = {};

      // Validate
      if (!building || !BUILDINGS.includes(building)) {
        errors.building = 'Please select a building.';
      }
      if (!ward || !WARDS.includes(ward)) {
        errors.ward = 'Please select a ward.';
      }
      if (!name?.trim()) {
        errors.name = 'Name is required.';
      } else if (!/^\S+\s+\S+/.test(name.trim())) {
        errors.name = 'Please enter both first and last name.';
      }
      if (!eventDate?.trim()) {
        errors.eventDate = 'Event date is required.';
      } else if (eventDate < minEventDate) {
        errors.eventDate = 'Please select a future date.';
      }
      if (!startTime?.trim()) {
        errors.startTime = 'Start time is required.';
      }
      if (!endTime?.trim()) {
        errors.endTime = 'End time is required.';
      }
      if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'A valid email is required.';
      }
      if (!description?.trim()) {
        errors.description = 'Description is required.';
      }
      if (formattedPhone && !/^[\d\s\-+().]{7,20}$/.test(formattedPhone)) {
        errors.phone = 'Invalid phone format (7–20 chars, digits/spaces/-/+/().)';
      }

      if (Object.keys(errors).length > 0) {
        return {
          errors,
          values: {
            building: building ?? undefined,
            ward: ward ?? undefined,
            name: name ?? undefined,
            eventDate: eventDate ?? undefined,
            startTime: startTime ?? undefined,
            endTime: endTime ?? undefined,
            phone: formattedPhone ?? undefined,
            email: email ?? undefined,
            description: description ?? undefined,
          },
        };
      }

      // Submit via React Query mutation (handles optimistic + toast)
      try {
        await new Promise<void>((resolve, reject) => {
          addEventMutation(
            {
              building: building!,
              ward: ward!,
              name: name!.trim(),
              eventDate: eventDate!,
              startTime: startTime!,
              endTime: endTime!,
              phone: formattedPhone || undefined,
              email: email!.trim().toLowerCase(),
              description: description!.trim(),
            },
            {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            }
          );
        });

        formRef.current?.reset();
        return {};
      } catch (error) {
        return {
          errors: {
            general:
              error instanceof Error ? error.message : 'Failed to add event. Please try again.',
          },
          values: {
            building: building ?? undefined,
            ward: ward ?? undefined,
            name: name ?? undefined,
            eventDate: eventDate ?? undefined,
            startTime: startTime ?? undefined,
            endTime: endTime ?? undefined,
            phone: formattedPhone ?? undefined,
            email: email ?? undefined,
            description: description ?? undefined,
          },
        };
      }
    },
    {}
  );

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      formRef.current?.reset();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add New Event</DialogTitle>
          <DialogDescription>
            Fill in the event details below. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {/* General error */}
          {state.errors?.general && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {state.errors.general}
            </div>
          )}

          {/* Building */}
          <div className="space-y-1.5">
            <Label htmlFor="building">
              Building <span className="text-destructive">*</span>
            </Label>
            <Select name="building" defaultValue={state.values?.building ?? defaultBuilding}>
              <SelectTrigger
                id="building"
                className={state.errors?.building ? 'border-destructive' : ''}
              >
                <SelectValue placeholder="Select a building…" />
              </SelectTrigger>
              <SelectContent>
                {BUILDINGS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.building && (
              <p className="text-xs text-destructive">{state.errors.building}</p>
            )}
          </div>

          {/* Ward */}
          <div className="space-y-1.5">
            <Label htmlFor="ward">
              Ward <span className="text-destructive">*</span>
            </Label>
            <Select name="ward" defaultValue={state.values?.ward ?? ''}>
              <SelectTrigger id="ward" className={state.errors?.ward ? 'border-destructive' : ''}>
                <SelectValue placeholder="Select a ward…" />
              </SelectTrigger>
              <SelectContent>
                {WARDS.map((ward) => (
                  <SelectItem key={ward} value={ward}>
                    {ward}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.ward && <p className="text-xs text-destructive">{state.errors.ward}</p>}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name">
              Member Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="First and last name"
              defaultValue={state.values?.name}
              className={state.errors?.name ? 'border-destructive' : ''}
              autoComplete="name"
            />
            {state.errors?.name && <p className="text-xs text-destructive">{state.errors.name}</p>}
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="eventDate">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="eventDate"
                name="eventDate"
                type="date"
                defaultValue={state.values?.eventDate ?? minEventDate}
                min={minEventDate}
                className={state.errors?.eventDate ? 'border-destructive' : ''}
              />
              {state.errors?.eventDate && (
                <p className="text-xs text-destructive">{state.errors.eventDate}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="startTime">
                Start <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                defaultValue={state.values?.startTime}
                className={state.errors?.startTime ? 'border-destructive' : ''}
              />
              {state.errors?.startTime && (
                <p className="text-xs text-destructive">{state.errors.startTime}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="endTime">
                End <span className="text-destructive">*</span>
              </Label>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                defaultValue={state.values?.endTime}
                className={state.errors?.endTime ? 'border-destructive' : ''}
              />
              {state.errors?.endTime && (
                <p className="text-xs text-destructive">{state.errors.endTime}</p>
              )}
            </div>
          </div>

          {/* Phone + Email row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                placeholder="+1 (555) 000-0000"
                defaultValue={state.values?.phone}
                className={state.errors?.phone ? 'border-destructive' : ''}
                autoComplete="tel"
                onChange={handlePhoneInput}
              />
              {state.errors?.phone && (
                <p className="text-xs text-destructive">{state.errors.phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                defaultValue={state.values?.email}
                className={state.errors?.email ? 'border-destructive' : ''}
                autoComplete="email"
              />
              {state.errors?.email && (
                <p className="text-xs text-destructive">{state.errors.email}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">
              Event Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Describe the event, date/time, requirements…"
              rows={4}
              defaultValue={state.values?.description}
              className={state.errors?.description ? 'border-destructive' : ''}
            />
            {state.errors?.description && (
              <p className="text-xs text-destructive">{state.errors.description}</p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
