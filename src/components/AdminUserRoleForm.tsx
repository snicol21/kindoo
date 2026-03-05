'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserRole } from '@/schema/schema';

interface AdminUserRoleFormProps {
  userId: string;
  initialRole: UserRole;
  roles: readonly UserRole[];
  action: (formData: FormData) => void | Promise<void>;
}

export function AdminUserRoleForm({ userId, initialRole, roles, action }: AdminUserRoleFormProps) {
  const [role, setRole] = useState<UserRole>(initialRole);
  const hasChanges = role !== initialRole;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />
      <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
        <SelectTrigger className="w-35">
          <SelectValue placeholder="Select role" />
        </SelectTrigger>
        <SelectContent>
          {roles.map((roleOption) => (
            <SelectItem key={roleOption} value={roleOption}>
              {roleOption}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" size="sm" variant="outline" disabled={!hasChanges}>
        Update role
      </Button>
    </form>
  );
}
