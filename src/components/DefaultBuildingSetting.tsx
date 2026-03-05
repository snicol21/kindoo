'use client';

import { useState } from 'react';
import { Label } from '@/components/_ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/_ui/select';
import { updateDefaultBuilding } from '@/actions/auth';
import { BUILDINGS, type Building } from '@/schema/schema';
import { toast } from 'sonner';

interface DefaultBuildingSettingProps {
  initialDefaultBuilding?: Building | null;
}

export function DefaultBuildingSetting({
  initialDefaultBuilding = 'Stake Center',
}: DefaultBuildingSettingProps) {
  const [defaultBuilding, setDefaultBuilding] = useState<Building>(
    initialDefaultBuilding ?? 'Stake Center'
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleDefaultBuildingChange = async (value: string) => {
    const next = value as Building;
    const previous = defaultBuilding;

    setDefaultBuilding(next);
    setIsSaving(true);

    const result = await updateDefaultBuilding({ defaultBuilding: next });
    setIsSaving(false);

    if (!result.success) {
      setDefaultBuilding(previous);
      toast.error(result.error ?? 'Failed to update default building.');
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="default-building">Default building</Label>
      <Select
        value={defaultBuilding}
        onValueChange={handleDefaultBuildingChange}
        disabled={isSaving}
      >
        <SelectTrigger id="default-building">
          <SelectValue placeholder="Select a building" />
        </SelectTrigger>
        <SelectContent>
          {BUILDINGS.map((building) => (
            <SelectItem key={building} value={building}>
              {building}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Used as your default dashboard tab and default building in the Add Event form.
      </p>
    </div>
  );
}
