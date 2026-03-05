import type { UserRole } from '@/schema/schema';

export type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
};

export interface AdminUsersClientProps {
  users: ManagedUser[];
  currentUserId: string;
  searchQuery?: string;
}
