import type { Building, UserRole, Ward } from '@/schema/schema';
import { WARD_BUILDING } from '@/schema/schema';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  stake_manager: 'Stake Manager',
  ward_manager: 'Ward Manager',
  ward_user: 'Ward User',
};

export function canAccessUserAdmin(role: UserRole) {
  return role === 'admin' || role === 'stake_manager' || role === 'ward_manager';
}

export function canAssignRole(actorRole: UserRole, nextRole: UserRole) {
  if (actorRole === 'admin') return true;
  if (actorRole === 'stake_manager') {
    return nextRole === 'ward_manager' || nextRole === 'ward_user';
  }
  if (actorRole === 'ward_manager') {
    return nextRole === 'ward_user';
  }
  return false;
}

export function canManageUser(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === 'admin') return true;
  if (actorRole === 'stake_manager') {
    return targetRole === 'ward_manager' || targetRole === 'ward_user';
  }
  if (actorRole === 'ward_manager') {
    return targetRole === 'ward_user';
  }
  return false;
}

export function canManageUserInWard(args: {
  actorRole: UserRole;
  actorWard: Ward;
  targetRole: UserRole;
  targetWard: Ward;
}) {
  if (!canManageUser(args.actorRole, args.targetRole)) return false;
  if (args.actorRole === 'ward_manager') {
    return args.actorWard === args.targetWard;
  }
  return true;
}

export function canCreateEventForWard(role: UserRole, userWard: Ward, eventWard: Ward) {
  if (role === 'admin' || role === 'stake_manager') return true;
  return userWard === eventWard;
}

export function canCreateEventInBuildingForWard(
  role: UserRole,
  userWard: Ward,
  eventWard: Ward,
  building: Building
) {
  if (!canCreateEventForWard(role, userWard, eventWard)) return false;
  if (role === 'admin' || role === 'stake_manager') return true;
  return WARD_BUILDING[eventWard] === building;
}

export function canViewEvent(args: {
  role: UserRole;
  userId: string;
  userWard: Ward;
  eventUserId: string;
  eventWard: Ward;
}) {
  if (args.role === 'admin' || args.role === 'stake_manager') return true;
  if (args.role === 'ward_manager') return args.userWard === args.eventWard;
  return args.userId === args.eventUserId && args.userWard === args.eventWard;
}

export function canMutateEvent(args: {
  role: UserRole;
  userId: string;
  userWard: Ward;
  eventUserId: string;
  eventWard: Ward;
}) {
  if (args.role === 'admin' || args.role === 'stake_manager') return true;
  if (args.role === 'ward_manager') return args.userWard === args.eventWard;
  return args.userId === args.eventUserId && args.userWard === args.eventWard;
}
