import type { UserRole, Ward } from '@/schema/schema';

export type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  ward: Ward;
  phone: string;
};

export interface AdminUsersClientProps {
  users: ManagedUser[];
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserWard: string;
  searchQuery?: string;
}
