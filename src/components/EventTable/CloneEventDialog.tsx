'use client';

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
import { DESCRIPTION_MAX_LENGTH } from '@/utils/eventConstants';

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
}: CloneEventDialogProps) {
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
          <div className="space-y-1.5">
            <Label htmlFor="clone-ward">Ward</Label>
            <Select value={cloneWard} onValueChange={(value) => setCloneWardAction(value as Ward)}>
              <SelectTrigger id="clone-ward">
                <SelectValue placeholder="Select ward" />
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
          <div className="space-y-1.5">
            <Label htmlFor="clone-name">Member Name</Label>
            <Input
              id="clone-name"
              value={cloneName}
              onChange={(e) => setCloneNameAction(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="clone-event-date">Date</Label>
              <Input
                id="clone-event-date"
                type="date"
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
                value={cloneEndTime}
                onChange={(e) => setCloneEndTimeAction(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-phone">Phone</Label>
            <Input
              id="clone-phone"
              type="tel"
              value={clonePhone}
              onChange={(e) => setClonePhoneAction(formatPhoneAction(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-email">Email</Label>
            <Input
              id="clone-email"
              type="email"
              value={cloneEmail}
              onChange={(e) => setCloneEmailAction(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="clone-description">Description</Label>
            <Input
              id="clone-description"
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
