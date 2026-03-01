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

const STORAGE_KEY = 'kindoo.licenseLeadDays';
const DEFAULT_DAYS = 2;
const MAX_DAYS = 14;

function parseLeadDays(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DAYS;
  const normalized = Math.round(parsed);
  if (normalized < 0 || normalized > MAX_DAYS) return DEFAULT_DAYS;
  return normalized;
}

export function LicenseLeadTimeSetting() {
  const [leadDays, setLeadDays] = useState(DEFAULT_DAYS);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setLeadDays(parseLeadDays(stored));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(leadDays));
  }, [leadDays]);

  return (
    <div className="space-y-2">
      <Label htmlFor="license-lead-days">License lead time</Label>
      <Select value={String(leadDays)} onValueChange={(value) => setLeadDays(parseLeadDays(value))}>
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
