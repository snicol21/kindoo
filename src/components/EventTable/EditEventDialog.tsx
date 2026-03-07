'use client';

import { useEffect, useRef, useState } from 'react';
import type { Building, Ward } from '@/schema/schema';
import { BUILDINGS, WARDS } from '@/schema/schema';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/_ui/dialog';
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { Loader2 } from 'lucide-react';
import {
  ContactMatchPopover,
  handleContactMatchKeyDown,
  type ContactMatch,
} from '@/components/ContactMatchPopover';
import { MatchedContactBadge } from '@/components/MatchedContactBadge';
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog';
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';
import type { ContactChangeState, LinkedContactSnapshot } from '@/lib/contact-linking';

type EditEventDialogProps = {
  open: boolean;
  editBuilding: Building;
  editWard: Ward | '';
  editName: string;
  editEventDate: string;
  editStartTime: string;
  editEndTime: string;
  editPhone: string;
  editEmail: string;
  editDescription: string;
  isSavingEdit: boolean;
  canSave: boolean;
  onCloseAction: () => void;
  onSubmitAction: () => Promise<void>;
  setEditBuildingAction: (value: Building) => void;
  setEditWardAction: (value: Ward | '') => void;
  setEditNameAction: (value: string) => void;
  setEditEventDateAction: (value: string) => void;
  setEditStartTimeAction: (value: string) => void;
  setEditEndTimeAction: (value: string) => void;
  setEditPhoneAction: (value: string) => void;
  setEditEmailAction: (value: string) => void;
  setEditDescriptionAction: (value: string) => void;
  formatPhoneAction: (value?: string | null) => string;
  matchCandidate: ContactMatch | null;
  nameMatchCandidates: ContactMatch[];
  nameMatchCandidate: ContactMatch | null;
  nameMatchCount: number;
  matchedContactId: string | null;
  linkedContact?: LinkedContactSnapshot | null;
  searchingContacts: boolean;
  contactFocusField: 'name' | 'phone' | 'email' | null;
  onContactFocus: (field: 'name' | 'phone' | 'email') => void;
  onContactBlur: () => void;
  onUseMatch: (contact: ContactMatch) => void;
  onClearLinkedContact: () => void;
  contactChangeState: ContactChangeState;
};

export function EditEventDialog({
  open,
  editBuilding,
  editWard,
  editName,
  editEventDate,
  editStartTime,
  editEndTime,
  editPhone,
  editEmail,
  editDescription,
  isSavingEdit,
  canSave,
  onCloseAction,
  onSubmitAction,
  setEditBuildingAction,
  setEditWardAction,
  setEditNameAction,
  setEditEventDateAction,
  setEditStartTimeAction,
  setEditEndTimeAction,
  setEditPhoneAction,
  setEditEmailAction,
  setEditDescriptionAction,
  formatPhoneAction,
  matchCandidate,
  nameMatchCandidates,
  nameMatchCandidate,
  nameMatchCount,
  matchedContactId,
  linkedContact,
  searchingContacts,
  contactFocusField,
  onContactFocus,
  onContactBlur,
  onUseMatch,
  onClearLinkedContact,
  contactChangeState,
}: EditEventDialogProps) {
  type Snapshot = Record<string, string>;
  const initialSnapshotRef = useRef<Snapshot | null>(null);
  const wasOpenRef = useRef(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const isNameFocus = contactFocusField === 'name';
  const isPhoneFocus = contactFocusField === 'phone';
  const isEmailFocus = contactFocusField === 'email';
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const wardTriggerRef = useRef<HTMLButtonElement>(null);
  const eventDateRef = useRef<HTMLInputElement>(null);
  const nameMatchRef = useRef<HTMLDivElement>(null);
  const phoneMatchRef = useRef<HTMLDivElement>(null);
  const emailMatchRef = useRef<HTMLDivElement>(null);

  const focusNextAfterMatch = (contact: ContactMatch) => {
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
      phoneInputRef.current?.focus();
    } else if (nextField === 'email') {
      emailInputRef.current?.focus();
    } else if (nextField === 'ward') {
      wardTriggerRef.current?.focus();
    } else {
      eventDateRef.current?.focus();
    }
  };

  const handleUseMatch = (contact: ContactMatch) => {
    onUseMatch(contact);
    focusNextAfterMatch(contact);
  };

  const showLinkedState = !!matchedContactId && contactChangeState.showLinkedState;
  const linkedBannerTone = contactChangeState.hasEdits
    ? 'border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-100'
    : 'border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-100';
  const linkedBannerGuidanceTone = contactChangeState.hasEdits
    ? 'text-amber-800/80 dark:text-amber-100/80'
    : 'text-emerald-800/80 dark:text-emerald-100/80';

  const getCurrentSnapshot = (): Snapshot => ({
    building: String(editBuilding),
    ward: String(editWard),
    name: editName.trim(),
    eventDate: editEventDate,
    startTime: editStartTime,
    endTime: editEndTime,
    phone: editPhone.trim(),
    email: editEmail.trim(),
    description: editDescription.trim(),
  });

  const isDirty = () => {
    const initial = initialSnapshotRef.current;
    if (!initial) return false;
    const current = getCurrentSnapshot();
    return Object.entries(initial).some(([key, value]) => value !== current[key]);
  };

  const handleRequestClose = () => {
    if (isDirty()) {
      setShowDiscardDialog(true);
      return;
    }
    onCloseAction();
  };

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      initialSnapshotRef.current = null;
      return;
    }
    if (wasOpenRef.current) return;
    const snapshot = getCurrentSnapshot();
    const snapshotReady = !!(snapshot.eventDate && snapshot.startTime && snapshot.endTime);
    if (!snapshotReady) return;
    initialSnapshotRef.current = snapshot;
    wasOpenRef.current = true;
  }, [
    open,
    editBuilding,
    editWard,
    editName,
    editEventDate,
    editStartTime,
    editEndTime,
    editPhone,
    editEmail,
    editDescription,
  ]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && handleRequestClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>Update the event details and save your changes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-building">Building</Label>
            <Select
              value={editBuilding}
              onValueChange={(value) => setEditBuildingAction(value as Building)}
            >
              <SelectTrigger id="edit-building">
                <SelectValue placeholder="Select building" />
              </SelectTrigger>
              <SelectContent>
                {BUILDINGS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contact
            </h3>
            <div className="h-px flex-1 bg-border/60" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <div className="relative">
              <Input
                ref={nameInputRef}
                id="edit-name"
                autoComplete="new-password"
                value={editName}
                className={matchedContactId ? 'pr-24' : ''}
                onFocus={() => onContactFocus('name')}
                onBlur={(event) => {
                  if (nameMatchRef.current?.contains(event.relatedTarget as Node)) return;
                  onContactBlur();
                }}
                onKeyDown={handleContactMatchKeyDown({
                  open:
                    isNameFocus && (searchingContacts || !!matchCandidate || !!nameMatchCandidate),
                  match: matchCandidate ?? nameMatchCandidate,
                  onTabFocus: () => {
                    window.setTimeout(() => {
                      const firstOption = nameMatchRef.current?.querySelector<HTMLButtonElement>(
                        'button[data-contact-option="true"]'
                      );
                      firstOption?.focus();
                    }, 0);
                  },
                  onUseMatch: handleUseMatch,
                })}
                onChange={(e) => setEditNameAction(e.target.value)}
              />
              {showLinkedState && <MatchedContactBadge update={contactChangeState.changed.name} />}
              <ContactMatchPopover
                focusRef={nameMatchRef}
                open={
                  isNameFocus && (searchingContacts || !!matchCandidate || !!nameMatchCandidate)
                }
                searching={searchingContacts}
                matchCandidate={matchCandidate}
                suggestedMatch={isNameFocus ? nameMatchCandidate : null}
                suggestedMatches={isNameFocus ? nameMatchCandidates : []}
                suggestedCount={isNameFocus ? nameMatchCount : 0}
                formatPhone={formatPhoneAction}
                onUseMatch={handleUseMatch}
                onBlur={onContactBlur}
                onTabNext={() => phoneInputRef.current?.focus()}
                onTabPrev={() => nameInputRef.current?.focus()}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <div className="relative">
                <Input
                  ref={phoneInputRef}
                  id="edit-phone"
                  type="tel"
                  autoComplete="new-password"
                  value={editPhone}
                  className={matchedContactId ? 'pr-24' : ''}
                  onFocus={() => onContactFocus('phone')}
                  onBlur={(event) => {
                    if (phoneMatchRef.current?.contains(event.relatedTarget as Node)) return;
                    onContactBlur();
                  }}
                  onKeyDown={handleContactMatchKeyDown({
                    open: isPhoneFocus && (searchingContacts || !!matchCandidate),
                    match: matchCandidate,
                    onTabFocus: () => {
                      window.setTimeout(() => {
                        const firstOption = phoneMatchRef.current?.querySelector<HTMLButtonElement>(
                          'button[data-contact-option="true"]'
                        );
                        firstOption?.focus();
                      }, 0);
                    },
                    onUseMatch: handleUseMatch,
                  })}
                  onChange={(e) => setEditPhoneAction(formatPhoneAction(e.target.value))}
                />
                {showLinkedState && (
                  <MatchedContactBadge update={contactChangeState.changed.phone} />
                )}
                <ContactMatchPopover
                  focusRef={phoneMatchRef}
                  open={isPhoneFocus && (searchingContacts || !!matchCandidate)}
                  searching={searchingContacts}
                  matchCandidate={matchCandidate}
                  suggestedMatch={null}
                  suggestedCount={0}
                  formatPhone={formatPhoneAction}
                  onUseMatch={handleUseMatch}
                  onBlur={onContactBlur}
                  onTabNext={() => emailInputRef.current?.focus()}
                  onTabPrev={() => phoneInputRef.current?.focus()}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <div className="relative">
                <Input
                  ref={emailInputRef}
                  id="edit-email"
                  type="email"
                  autoComplete="new-password"
                  value={editEmail}
                  className={matchedContactId ? 'pr-24' : ''}
                  onFocus={() => onContactFocus('email')}
                  onBlur={(event) => {
                    if (emailMatchRef.current?.contains(event.relatedTarget as Node)) return;
                    onContactBlur();
                  }}
                  onKeyDown={handleContactMatchKeyDown({
                    open: isEmailFocus && (searchingContacts || !!matchCandidate),
                    match: matchCandidate,
                    onTabFocus: () => {
                      window.setTimeout(() => {
                        const firstOption = emailMatchRef.current?.querySelector<HTMLButtonElement>(
                          'button[data-contact-option="true"]'
                        );
                        firstOption?.focus();
                      }, 0);
                    },
                    onUseMatch: handleUseMatch,
                  })}
                  onChange={(e) => setEditEmailAction(e.target.value)}
                />
                {showLinkedState && (
                  <MatchedContactBadge update={contactChangeState.changed.email} />
                )}
                <ContactMatchPopover
                  focusRef={emailMatchRef}
                  open={isEmailFocus && (searchingContacts || !!matchCandidate)}
                  searching={searchingContacts}
                  matchCandidate={matchCandidate}
                  suggestedMatch={null}
                  suggestedCount={0}
                  formatPhone={formatPhoneAction}
                  onUseMatch={handleUseMatch}
                  onBlur={onContactBlur}
                  onTabNext={() => wardTriggerRef.current?.focus()}
                  onTabPrev={() => emailInputRef.current?.focus()}
                />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-ward">Ward</Label>
            <div className="relative">
              <Select value={editWard} onValueChange={(value) => setEditWardAction(value as Ward)}>
                <SelectTrigger id="edit-ward" ref={wardTriggerRef} className="relative">
                  <SelectValue placeholder="Select ward" />
                  {showLinkedState && (
                    <MatchedContactBadge
                      variant="select"
                      as="div"
                      update={contactChangeState.changed.ward}
                    />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {WARDS.map((ward) => (
                    <SelectItem key={ward} value={ward}>
                      {ward}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showLinkedState && (
            <div className={`rounded-md border p-3 text-xs ${linkedBannerTone}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  Linked to contact{' '}
                  <span className="font-semibold">{linkedContact?.name ?? editName}</span>.
                  {contactChangeState.changeSummary ? ` ${contactChangeState.changeSummary}` : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => {
                    onClearLinkedContact();
                    nameInputRef.current?.focus();
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="edit-event-date">Date</Label>
              <Input
                ref={eventDateRef}
                id="edit-event-date"
                type="date"
                autoComplete="off"
                value={editEventDate}
                onChange={(e) => setEditEventDateAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="edit-start-time">Start</Label>
              <Input
                id="edit-start-time"
                type="time"
                min="05:00"
                max="23:00"
                step={900}
                autoComplete="off"
                value={editStartTime}
                onChange={(e) => setEditStartTimeAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="edit-end-time">End</Label>
              <Input
                id="edit-end-time"
                type="time"
                min="05:00"
                max="23:00"
                step={900}
                autoComplete="off"
                value={editEndTime}
                onChange={(e) => setEditEndTimeAction(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Input
              id="edit-description"
              autoComplete="off"
              value={editDescription}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setEditDescriptionAction(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {editDescription.length}/{DESCRIPTION_MAX_LENGTH} characters
            </p>
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleRequestClose}>
            Cancel
          </Button>
          <Button
            className="w-full gap-2 sm:w-auto"
            onClick={() => {
              void onSubmitAction();
            }}
            disabled={!canSave || isSavingEdit}
          >
            {isSavingEdit ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
      <UnsavedChangesDialog
        open={showDiscardDialog}
        onCancel={() => setShowDiscardDialog(false)}
        onConfirm={() => {
          setShowDiscardDialog(false);
          onCloseAction();
        }}
      />
    </Dialog>
  );
}
