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
}: EditEventDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCloseAction()}>
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
          <div className="space-y-1.5">
            <Label htmlFor="edit-ward">Ward</Label>
            <Select value={editWard} onValueChange={(value) => setEditWardAction(value as Ward)}>
              <SelectTrigger id="edit-ward">
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
            <Label htmlFor="edit-name">Member Name</Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditNameAction(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 min-w-0">
              <Label htmlFor="edit-event-date">Date</Label>
              <Input
                id="edit-event-date"
                type="date"
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
                value={editEndTime}
                onChange={(e) => setEditEndTimeAction(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhoneAction(formatPhoneAction(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmailAction(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-description">Description</Label>
            <Input
              id="edit-description"
              value={editDescription}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setEditDescriptionAction(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {editDescription.length}/{DESCRIPTION_MAX_LENGTH} characters
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
            disabled={!canSave || isSavingEdit}
          >
            {isSavingEdit ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              'Save changes'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
