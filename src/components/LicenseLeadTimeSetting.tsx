'use client';

import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateLicenseLeadDays } from '@/actions/auth';
import { toast } from 'sonner';

const STORAGE_KEY = 'kindoo.licenseLeadDays';
const DEFAULT_DAYS = 2;
const MAX_DAYS = 14;

function normalizeLeadDays(value: string | number | null | undefined) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  const normalized = Math.round(parsed);
  if (normalized < 0 || normalized > MAX_DAYS) return DEFAULT_DAYS;
  return normalized;
}

interface LicenseLeadTimeSettingProps {
  initialLeadDays?: number | null;
}

export function LicenseLeadTimeSetting({ initialLeadDays }: LicenseLeadTimeSettingProps) {
  const [leadDays, setLeadDays] = useState(() => normalizeLeadDays(initialLeadDays));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (Number.isFinite(initialLeadDays)) {
      const normalized = normalizeLeadDays(initialLeadDays ?? DEFAULT_DAYS);
      setLeadDays(normalized);
      window.localStorage.setItem(STORAGE_KEY, String(normalized));
      return;
    }

    const stored = window.localStorage.getItem(STORAGE_KEY);
    setLeadDays(normalizeLeadDays(stored));
  }, [initialLeadDays]);

  const handleLeadDaysChange = async (value: string) => {
    const next = normalizeLeadDays(value);
    const previous = leadDays;
    setLeadDays(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
    setIsSaving(true);

    const result = await updateLicenseLeadDays({ leadDays: next });
    setIsSaving(false);

    if (!result.success) {
      setLeadDays(previous);
      window.localStorage.setItem(STORAGE_KEY, String(previous));
      toast.error(result.error ?? 'Failed to update license lead time.');
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="license-lead-days">License lead time</Label>
      <Select value={String(leadDays)} onValueChange={handleLeadDaysChange} disabled={isSaving}>
        <SelectTrigger id="license-lead-days">
          <SelectValue placeholder="Select days" />
        </SelectTrigger>
        <SelectContent>
          {Array.from({ length: MAX_DAYS + 1 }, (_, index) => index).map((days) => (
            <SelectItem key={days} value={String(days)}>
              {days === 0 ? 'Same day' : `${days} day${days === 1 ? '' : 's'}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Controls when the Kindoo License button enables before an event.
      </p>
    </div>
  );
}
