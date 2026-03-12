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
  accessRequests?: AccessRequestListItem[];
}

export type AccessRequestListItem = {
  id: string;
  email: string;
  name: string;
  phone: string;
  ward: Ward;
  comments: string | null;
  requestedRole: UserRole | null;
  status: 'pending' | 'approved' | 'denied';
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  reviewedByEmail: string | null;
  reviewNote: string | null;
};
