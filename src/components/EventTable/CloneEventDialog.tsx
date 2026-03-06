'use client';

import { useRef } from 'react';
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
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';
import type { ContactChangeState, LinkedContactSnapshot } from '@/lib/contact-linking';

type CloneEventDialogProps = {
  open: boolean;
  cloneBuilding: Building;
  cloneWard: Ward | '';
  cloneName: string;
  cloneEventDate: string;
  cloneStartTime: string;
  cloneEndTime: string;
  clonePhone: string;
  cloneEmail: string;
  cloneDescription: string;
  isSavingClone: boolean;
  canSave: boolean;
  onCloseAction: () => void;
  onSubmitAction: () => Promise<void>;
  setCloneBuildingAction: (value: Building) => void;
  setCloneWardAction: (value: Ward | '') => void;
  setCloneNameAction: (value: string) => void;
  setCloneEventDateAction: (value: string) => void;
  setCloneStartTimeAction: (value: string) => void;
  setCloneEndTimeAction: (value: string) => void;
  setClonePhoneAction: (value: string) => void;
  setCloneEmailAction: (value: string) => void;
  setCloneDescriptionAction: (value: string) => void;
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

export function CloneEventDialog({
  open,
  cloneBuilding,
  cloneWard,
  cloneName,
  cloneEventDate,
  cloneStartTime,
  cloneEndTime,
  clonePhone,
  cloneEmail,
  cloneDescription,
  isSavingClone,
  canSave,
  onCloseAction,
  onSubmitAction,
  setCloneBuildingAction,
  setCloneWardAction,
  setCloneNameAction,
  setCloneEventDateAction,
  setCloneStartTimeAction,
  setCloneEndTimeAction,
  setClonePhoneAction,
  setCloneEmailAction,
  setCloneDescriptionAction,
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
}: CloneEventDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCloseAction()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Clone event</DialogTitle>
          <DialogDescription>Adjust the details and save as a new event.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="clone-building">Building</Label>
            <Select
              value={cloneBuilding}
              onValueChange={(value) => setCloneBuildingAction(value as Building)}
            >
              <SelectTrigger id="clone-building">
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
            <Label htmlFor="clone-name">Name</Label>
            <div className="relative">
              <Input
                ref={nameInputRef}
                id="clone-name"
                autoComplete="new-password"
                value={cloneName}
                className={showLinkedState ? 'pr-24' : ''}
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
                onChange={(e) => setCloneNameAction(e.target.value)}
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
          <div className="space-y-1.5">
            <Label htmlFor="clone-phone">Phone</Label>
            <div className="relative">
              <Input
                ref={phoneInputRef}
                id="clone-phone"
                type="tel"
                autoComplete="new-password"
                value={clonePhone}
                className={showLinkedState ? 'pr-24' : ''}
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
                onChange={(e) => setClonePhoneAction(formatPhoneAction(e.target.value))}
              />
              {showLinkedState && <MatchedContactBadge update={contactChangeState.changed.phone} />}
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
            <Label htmlFor="clone-email">Email</Label>
            <div className="relative">
              <Input
                ref={emailInputRef}
                id="clone-email"
                type="email"
                autoComplete="new-password"
                value={cloneEmail}
                className={showLinkedState ? 'pr-24' : ''}
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
                onChange={(e) => setCloneEmailAction(e.target.value)}
              />
              {showLinkedState && <MatchedContactBadge update={contactChangeState.changed.email} />}
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
          <div className="space-y-1.5">
            <Label htmlFor="clone-ward">Ward</Label>
            <div className="relative">
              <Select
                value={cloneWard}
                onValueChange={(value) => setCloneWardAction(value as Ward)}
              >
                <SelectTrigger id="clone-ward" ref={wardTriggerRef} className="relative">
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
                  <span className="font-semibold">{linkedContact?.name ?? cloneName}</span>.
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
              <Label htmlFor="clone-event-date">Date</Label>
              <Input
                ref={eventDateRef}
                id="clone-event-date"
                type="date"
                autoComplete="off"
                value={cloneEventDate}
                onChange={(e) => setCloneEventDateAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="clone-start-time">Start</Label>
              <Input
                id="clone-start-time"
                type="time"
                min="05:00"
                max="23:00"
                autoComplete="off"
                value={cloneStartTime}
                onChange={(e) => setCloneStartTimeAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="clone-end-time">End</Label>
              <Input
                id="clone-end-time"
                type="time"
                min="05:00"
                max="23:00"
                autoComplete="off"
                value={cloneEndTime}
                onChange={(e) => setCloneEndTimeAction(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-description">Description</Label>
            <Input
              id="clone-description"
              autoComplete="off"
              value={cloneDescription}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setCloneDescriptionAction(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {cloneDescription.length}/{DESCRIPTION_MAX_LENGTH} characters
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCloseAction}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void onSubmitAction();
            }}
            disabled={!canSave || isSavingClone}
          >
            {isSavingClone ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save new event'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
