'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
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
} from '@/components/_ui/dialog';
import { Button } from '@/components/_ui/button';
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { Loader2 } from 'lucide-react';
import { ContactMatchPopover, handleContactMatchKeyDown } from '@/components/ContactMatchPopover';
import { MatchedContactBadge } from '@/components/MatchedContactBadge';
import { useAddEvent } from '@/hooks/useEvents';
import { useContactSearch } from '@/hooks/useContacts';
import { updateContact, type ContactSearchResult } from '@/actions/contacts';
import type { Building, Ward } from '@/schema/schema';
import { BUILDINGS, WARDS } from '@/schema/schema';
import { formatPhone } from '@/utils/phoneUtils';
import { getTomorrowYmd } from '@/utils/dateUtils';
import { parseTimeToMinutes } from '@/utils/timeUtils';
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';
import { getContactChangeState } from '@/lib/contact-linking';
import { useContactChangeState } from '@/hooks/useContactChangeState';
import { findExactContact, getContactSuggestions } from '@/lib/contact-matching';

const phoneDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

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
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const wardTriggerRef = useRef<HTMLButtonElement>(null);
  const eventDateRef = useRef<HTMLInputElement>(null);
  const nameMatchRef = useRef<HTMLDivElement>(null);
  const phoneMatchRef = useRef<HTMLDivElement>(null);
  const emailMatchRef = useRef<HTMLDivElement>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<Building>(defaultBuilding);
  const [selectedWard, setSelectedWard] = useState<Ward | ''>('');
  const [typedName, setTypedName] = useState('');
  const [typedEmail, setTypedEmail] = useState('');
  const [typedPhone, setTypedPhone] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null);
  const [matchCandidate, setMatchCandidate] = useState<ContactSearchResult | null>(null);
  const [dismissedMatchId, setDismissedMatchId] = useState<string | null>(null);
  const [contactFocusField, setContactFocusField] = useState<'name' | 'phone' | 'email' | null>(
    null
  );
  const [descriptionValue, setDescriptionValue] = useState('');
  const contactLookupQuery = typedEmail.trim() || typedPhone.trim() || typedName.trim();
  const { data: matchingContacts = [], isFetching: searchingContacts } = useContactSearch(
    contactLookupQuery,
    {
      ward: selectedWard || undefined,
    }
  );
  const { mutate: addEventMutation, isPending } = useAddEvent(() => {
    onOpenChange(false);
  });
  const minEventDate = getTomorrowYmd();

  const prioritizedWards = useMemo(() => {
    const stakePriority: Ward[] = ['3rd Ward', '4th Ward', '6th Ward'];
    const maplesPriority: Ward[] = ['1st Ward', '2nd Ward', '5th Ward', 'Park Ridge Ward'];
    const priority = selectedBuilding === 'Stake Center' ? stakePriority : maplesPriority;
    const remaining = WARDS.filter((ward) => !priority.includes(ward));
    return { priority, remaining };
  }, [selectedBuilding]);

  const handlePhoneInput = (event: ChangeEvent<HTMLInputElement>) => {
    event.target.value = formatPhone(event.target.value);
  };

  const contactSuggestions = useMemo(
    () =>
      getContactSuggestions(matchingContacts, {
        name: typedName,
        ward: selectedWard,
        email: typedEmail,
        phone: typedPhone,
      }),
    [matchingContacts, selectedWard, typedEmail, typedName, typedPhone]
  );

  const nameMatchCandidates = contactSuggestions.filter(
    (contact) => contact.id !== selectedContactId && contact.id !== dismissedMatchId
  );
  const nameMatchCandidate = nameMatchCandidates[0] ?? null;
  const nameMatchCount = nameMatchCandidates.length;

  const applyContact = (contact: ContactSearchResult) => {
    setSelectedContactId(contact.id);
    setSelectedContact(contact);
    setTypedName(contact.name);
    setTypedEmail(contact.email ?? '');
    setTypedPhone(formatPhone(contact.phone ?? ''));
    if (nameRef.current) nameRef.current.value = contact.name;
    setSelectedWard(contact.ward);
    if (phoneRef.current) phoneRef.current.value = formatPhone(contact.phone ?? '');
    if (emailRef.current) emailRef.current.value = contact.email ?? '';
  };

  const focusNextAfterMatch = (contact: ContactSearchResult) => {
    const focusOrder =
      contactFocusField === 'phone'
        ? ['email', 'ward', 'date']
        : contactFocusField === 'email'
          ? ['ward', 'date']
          : ['phone', 'email', 'ward', 'date'];

    const nextField = focusOrder.find((field) => {
      if (field === 'phone') return !contact.phone;
      if (field === 'email') return !contact.email;
      if (field === 'ward') return !contact.ward;
      return true;
    });

    if (nextField === 'phone') {
      phoneRef.current?.focus();
    } else if (nextField === 'email') {
      emailRef.current?.focus();
    } else if (nextField === 'ward') {
      wardTriggerRef.current?.focus();
    } else {
      eventDateRef.current?.focus();
    }
  };

  const clearSelectedContact = () => {
    setSelectedContactId(null);
    setSelectedContact(null);
  };

  const clearContactFormValues = () => {
    setTypedName('');
    setTypedEmail('');
    setTypedPhone('');
    setSelectedWard('');
    if (nameRef.current) nameRef.current.value = '';
    if (phoneRef.current) phoneRef.current.value = '';
    if (emailRef.current) emailRef.current.value = '';
  };

  useEffect(() => {
    if (!open) return;

    const match = findExactContact(matchingContacts, {
      name: typedName,
      ward: selectedWard,
      email: typedEmail,
      phone: typedPhone,
    });

    if (!match) {
      setMatchCandidate(null);
      setDismissedMatchId(null);
      return;
    }

    if (match.id === selectedContactId || dismissedMatchId === match.id) {
      setMatchCandidate(null);
      return;
    }

    setMatchCandidate(match);
  }, [
    dismissedMatchId,
    matchingContacts,
    open,
    selectedContactId,
    selectedWard,
    typedEmail,
    typedName,
    typedPhone,
  ]);

  useEffect(() => {
    if (!open || !matchCandidate || selectedContactId || dismissedMatchId === matchCandidate.id) {
      return;
    }

    const normalizedEmail = typedEmail.trim().toLowerCase();
    const normalizedPhone = phoneDigits(typedPhone);
    const emailMatches =
      normalizedEmail && (matchCandidate.email ?? '').trim().toLowerCase() === normalizedEmail;
    const phoneMatches = normalizedPhone && phoneDigits(matchCandidate.phone) === normalizedPhone;

    if (emailMatches || phoneMatches) {
      applyContact(matchCandidate);
      setMatchCandidate(null);
      setDismissedMatchId(null);
    }
  }, [dismissedMatchId, matchCandidate, open, selectedContactId, typedEmail, typedPhone]);

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
      if (startTime?.trim() && endTime?.trim()) {
        const startMinutes = parseTimeToMinutes(startTime);
        const endMinutes = parseTimeToMinutes(endTime);
        const earliestMinutes = 5 * 60;
        const latestMinutes = 23 * 60;
        if (startMinutes === null) {
          errors.startTime = 'Start time is invalid.';
        } else if (startMinutes < earliestMinutes || startMinutes > latestMinutes) {
          errors.startTime = 'Start time must be between 5:00 AM and 11:00 PM.';
        }
        if (endMinutes === null) {
          errors.endTime = 'End time is invalid.';
        } else if (endMinutes > latestMinutes) {
          errors.endTime = 'End time must be no later than 11:00 PM.';
        } else if (startMinutes !== null && endMinutes <= startMinutes) {
          errors.endTime = 'End time must be after start time.';
        }
      }
      if (email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.email = 'Email must be valid if provided.';
      }
      if (!email?.trim() && !formattedPhone?.trim()) {
        errors.general = 'At least one contact method is required (email or phone).';
      }
      if (!description?.trim()) {
        errors.description = 'Description is required.';
      } else if (description.trim().length > DESCRIPTION_MAX_LENGTH) {
        errors.description = `Description must be ${DESCRIPTION_MAX_LENGTH} characters or less.`;
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
        const normalizedFormEmail = email?.trim().toLowerCase() ?? '';
        const normalizedFormPhone = phoneDigits(formattedPhone ?? '');
        const normalizedFormName = name!.trim();
        const submitChangeState = getContactChangeState(selectedContact, {
          name: normalizedFormName,
          ward: ward ?? '',
          email: normalizedFormEmail,
          phone: normalizedFormPhone,
        });
        const willCreateNewContact = submitChangeState.willCreateNewContact;
        const hasContactEdits = submitChangeState.hasEdits;

        if (selectedContact && hasContactEdits && !willCreateNewContact) {
          const updateResult = await updateContact({
            id: selectedContact.id,
            name: name!.trim(),
            ward: ward!,
            email: email?.trim() || null,
            phone: formattedPhone || null,
          });
          if (!updateResult.success) {
            return {
              errors: {
                general: updateResult.error ?? 'Failed to update contact.',
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
        }

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
              email: email?.trim() ? email.trim().toLowerCase() : undefined,
              description: description!.trim(),
            },
            {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            }
          );
        });

        formRef.current?.reset();
        setSelectedWard('');
        setTypedName('');
        setTypedEmail('');
        setTypedPhone('');
        clearSelectedContact();
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
      setSelectedWard('');
      setTypedName('');
      setTypedEmail('');
      setTypedPhone('');
      clearSelectedContact();
      setMatchCandidate(null);
      setDismissedMatchId(null);
      setDescriptionValue('');
      setContactFocusField(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDescriptionValue(state.values?.description ?? '');
  }, [open, state.values?.description]);

  useEffect(() => {
    if (open) {
      setSelectedBuilding(defaultBuilding);
      setSelectedWard((state.values?.ward as Ward | undefined) ?? '');
    }
  }, [defaultBuilding, open, state.values?.ward]);

  const contactChangeState = useContactChangeState(selectedContact, {
    name: typedName,
    ward: selectedWard,
    email: typedEmail,
    phone: typedPhone,
  });
  const showLinkedState = !!selectedContactId && contactChangeState.showLinkedState;
  const linkedBannerTone = contactChangeState.hasEdits
    ? 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-100'
    : 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-100';
  const linkedBannerGuidanceTone = contactChangeState.hasEdits
    ? 'text-amber-800/80 dark:text-amber-100/80'
    : 'text-emerald-800/80 dark:text-emerald-100/80';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add New Event</DialogTitle>
          <DialogDescription>
            Fill in the event details below. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4" autoComplete="off">
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
            <Select
              name="building"
              value={selectedBuilding}
              onValueChange={(value) => setSelectedBuilding(value as Building)}
            >
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

          <div className="flex items-center gap-2 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact
            </h3>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Input
                ref={nameRef}
                id="name"
                name="name"
                placeholder="First and last name"
                defaultValue={state.values?.name}
                className={`${state.errors?.name ? 'border-destructive' : ''} ${
                  showLinkedState ? 'pr-24' : ''
                }`}
                autoComplete="new-password"
                onFocus={() => setContactFocusField('name')}
                onBlur={(event) => {
                  if (nameMatchRef.current?.contains(event.relatedTarget as Node)) return;
                  setContactFocusField(null);
                }}
                onKeyDown={handleContactMatchKeyDown({
                  open: contactFocusField === 'name' && (!!matchCandidate || !!nameMatchCandidate),
                  match: matchCandidate ?? nameMatchCandidate,
                  onTabFocus: () => {
                    window.setTimeout(() => {
                      const firstOption = nameMatchRef.current?.querySelector<HTMLButtonElement>(
                        'button[data-contact-option="true"]'
                      );
                      firstOption?.focus();
                    }, 0);
                  },
                  onUseMatch: (contact) => {
                    applyContact(contact);
                    setMatchCandidate(null);
                    setDismissedMatchId(null);
                    focusNextAfterMatch(contact);
                  },
                })}
                onChange={(event) => {
                  if (!selectedContactId) {
                    setSelectedContact(null);
                  }
                  setTypedName(event.target.value);
                }}
              />
              {showLinkedState && <MatchedContactBadge update={contactChangeState.changed.name} />}
              <ContactMatchPopover
                focusRef={nameMatchRef}
                open={
                  contactFocusField === 'name' &&
                  (searchingContacts || !!matchCandidate || !!nameMatchCandidate)
                }
                searching={searchingContacts}
                matchCandidate={matchCandidate}
                suggestedMatch={contactFocusField === 'name' ? nameMatchCandidate : null}
                suggestedMatches={contactFocusField === 'name' ? nameMatchCandidates : []}
                suggestedCount={contactFocusField === 'name' ? nameMatchCount : 0}
                formatPhone={formatPhone}
                onUseMatch={(contact) => {
                  applyContact(contact);
                  setMatchCandidate(null);
                  setDismissedMatchId(null);
                  focusNextAfterMatch(contact);
                }}
                onBlur={() => setContactFocusField(null)}
                onTabNext={() => phoneRef.current?.focus()}
                onTabPrev={() => nameRef.current?.focus()}
              />
            </div>
            {state.errors?.name && <p className="text-xs text-destructive">{state.errors.name}</p>}
          </div>

          {/* Phone + Email row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Input
                  ref={phoneRef}
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="(555) 000-0000"
                  defaultValue={state.values?.phone}
                  className={`${state.errors?.phone ? 'border-destructive' : ''} ${
                    showLinkedState ? 'pr-24' : ''
                  }`}
                  autoComplete="new-password"
                  onFocus={() => setContactFocusField('phone')}
                  onBlur={(event) => {
                    if (phoneMatchRef.current?.contains(event.relatedTarget as Node)) return;
                    setContactFocusField(null);
                  }}
                  onKeyDown={handleContactMatchKeyDown({
                    open: contactFocusField === 'phone' && (searchingContacts || !!matchCandidate),
                    match: matchCandidate,
                    onTabFocus: () => {
                      window.setTimeout(() => {
                        const firstOption = phoneMatchRef.current?.querySelector<HTMLButtonElement>(
                          'button[data-contact-option="true"]'
                        );
                        firstOption?.focus();
                      }, 0);
                    },
                    onUseMatch: (contact) => {
                      applyContact(contact);
                      setMatchCandidate(null);
                      setDismissedMatchId(null);
                      focusNextAfterMatch(contact);
                    },
                  })}
                  onChange={(event) => {
                    handlePhoneInput(event);
                    if (!selectedContactId) {
                      setSelectedContact(null);
                    }
                    setTypedPhone(event.target.value);
                  }}
                />
                {showLinkedState && (
                  <MatchedContactBadge update={contactChangeState.changed.phone} />
                )}
                <ContactMatchPopover
                  focusRef={phoneMatchRef}
                  open={contactFocusField === 'phone' && (searchingContacts || !!matchCandidate)}
                  searching={searchingContacts}
                  matchCandidate={matchCandidate}
                  suggestedMatch={null}
                  suggestedCount={0}
                  formatPhone={formatPhone}
                  onUseMatch={(contact) => {
                    applyContact(contact);
                    setMatchCandidate(null);
                    setDismissedMatchId(null);
                    focusNextAfterMatch(contact);
                  }}
                  onBlur={() => setContactFocusField(null)}
                  onTabNext={() => emailRef.current?.focus()}
                  onTabPrev={() => phoneRef.current?.focus()}
                />
              </div>
              {state.errors?.phone && (
                <p className="text-xs text-destructive">{state.errors.phone}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  placeholder="name@example.com (optional)"
                  defaultValue={state.values?.email}
                  className={`${state.errors?.email ? 'border-destructive' : ''} ${
                    showLinkedState ? 'pr-24' : ''
                  }`}
                  autoComplete="new-password"
                  onFocus={() => setContactFocusField('email')}
                  onBlur={(event) => {
                    if (emailMatchRef.current?.contains(event.relatedTarget as Node)) return;
                    setContactFocusField(null);
                  }}
                  onKeyDown={handleContactMatchKeyDown({
                    open: contactFocusField === 'email' && (searchingContacts || !!matchCandidate),
                    match: matchCandidate,
                    onTabFocus: () => {
                      window.setTimeout(() => {
                        const firstOption = emailMatchRef.current?.querySelector<HTMLButtonElement>(
                          'button[data-contact-option="true"]'
                        );
                        firstOption?.focus();
                      }, 0);
                    },
                    onUseMatch: (contact) => {
                      applyContact(contact);
                      setMatchCandidate(null);
                      setDismissedMatchId(null);
                      focusNextAfterMatch(contact);
                    },
                  })}
                  onChange={(event) => {
                    if (!selectedContactId) {
                      setSelectedContact(null);
                    }
                    setTypedEmail(event.target.value);
                  }}
                />
                {showLinkedState && (
                  <MatchedContactBadge update={contactChangeState.changed.email} />
                )}
                <ContactMatchPopover
                  focusRef={emailMatchRef}
                  open={contactFocusField === 'email' && (searchingContacts || !!matchCandidate)}
                  searching={searchingContacts}
                  matchCandidate={matchCandidate}
                  suggestedMatch={null}
                  suggestedCount={0}
                  formatPhone={formatPhone}
                  onUseMatch={(contact) => {
                    applyContact(contact);
                    setMatchCandidate(null);
                    setDismissedMatchId(null);
                    focusNextAfterMatch(contact);
                  }}
                  onBlur={() => setContactFocusField(null)}
                  onTabNext={() => wardTriggerRef.current?.focus()}
                  onTabPrev={() => emailRef.current?.focus()}
                />
              </div>
              {state.errors?.email && (
                <p className="text-xs text-destructive">{state.errors.email}</p>
              )}
            </div>
          </div>

          {/* Ward */}
          <div className="space-y-1.5">
            <Label htmlFor="ward">
              Ward <span className="text-destructive">*</span>
            </Label>
            <Select
              name="ward"
              value={selectedWard}
              onValueChange={(value) => setSelectedWard(value as Ward)}
            >
              <SelectTrigger
                id="ward"
                ref={wardTriggerRef}
                className={`relative ${state.errors?.ward ? 'border-destructive' : ''}`}
              >
                <SelectValue placeholder="Select a ward…" />
                {showLinkedState && (
                  <MatchedContactBadge
                    variant="select"
                    as="div"
                    update={contactChangeState.changed.ward}
                  />
                )}
              </SelectTrigger>
              <SelectContent>
                {prioritizedWards.priority.map((ward) => (
                  <SelectItem key={ward} value={ward}>
                    {ward}
                  </SelectItem>
                ))}
                {prioritizedWards.remaining.length > 0 && (
                  <SelectSeparator className="border-t border-dashed border-muted-foreground/40" />
                )}
                {prioritizedWards.remaining.map((ward) => (
                  <SelectItem key={ward} value={ward}>
                    {ward}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state.errors?.ward && <p className="text-xs text-destructive">{state.errors.ward}</p>}
          </div>

          {showLinkedState && selectedContact && (
            <div className={`rounded-md border p-3 text-xs ${linkedBannerTone}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Linked to contact <span className="font-semibold">{selectedContact.name}</span>.
                  {contactChangeState.changeSummary ? ` ${contactChangeState.changeSummary}` : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    setDismissedMatchId(selectedContact.id);
                    setMatchCandidate(null);
                    clearSelectedContact();
                    clearContactFormValues();
                    nameRef.current?.focus();
                  }}
                >
                  Unlink
                </Button>
                {contactChangeState.identifierGuidance && (
                  <span className={linkedBannerGuidanceTone}>
                    {contactChangeState.identifierGuidance}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Event
            </h3>
            <div className="h-px flex-1 bg-border/60" />
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 min-w-0 sm:col-span-1">
              <Label htmlFor="eventDate">
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                ref={eventDateRef}
                id="eventDate"
                name="eventDate"
                type="date"
                defaultValue={state.values?.eventDate ?? minEventDate}
                min={minEventDate}
                autoComplete="off"
                className={state.errors?.eventDate ? 'border-destructive' : ''}
              />
              {state.errors?.eventDate && (
                <p className="text-xs text-destructive">{state.errors.eventDate}</p>
              )}
            </div>
            <div className="space-y-1.5 min-w-0 sm:col-span-1">
              <Label htmlFor="startTime">
                Start <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startTime"
                name="startTime"
                type="time"
                min="05:00"
                max="23:00"
                autoComplete="off"
                defaultValue={state.values?.startTime}
                className={state.errors?.startTime ? 'border-destructive' : ''}
              />
              {state.errors?.startTime && (
                <p className="text-xs text-destructive">{state.errors.startTime}</p>
              )}
            </div>
            <div className="space-y-1.5 min-w-0 sm:col-span-1">
              <Label htmlFor="endTime">
                End <span className="text-destructive">*</span>
              </Label>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                min="05:00"
                max="23:00"
                autoComplete="off"
                defaultValue={state.values?.endTime}
                className={state.errors?.endTime ? 'border-destructive' : ''}
              />
              {state.errors?.endTime && (
                <p className="text-xs text-destructive">{state.errors.endTime}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="description">
              Event Description <span className="text-destructive">*</span>
            </Label>
            <Input
              id="description"
              name="description"
              placeholder="Short description (e.g., Wedding reception or Birthday party)"
              maxLength={DESCRIPTION_MAX_LENGTH}
              value={descriptionValue}
              onChange={(event) => setDescriptionValue(event.target.value)}
              autoComplete="off"
              className={state.errors?.description ? 'border-destructive' : ''}
            />
            <p className="text-xs text-muted-foreground">
              {descriptionValue.length}/{DESCRIPTION_MAX_LENGTH} characters
            </p>
            {state.errors?.description && (
              <p className="text-xs text-destructive">{state.errors.description}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">
              <SubmitButton />
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
