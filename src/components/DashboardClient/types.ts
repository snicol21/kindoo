import type { EventWithCreator } from '@/actions/events';
import type { MessageTemplateMap } from '@/lib/message-templates';
import type { Building, EventType, UserRole, Ward } from '@/schema/schema';

export type DashboardTab = 'stake-center' | 'maples-building';

export interface DashboardClientProps {
  initialStakeCenterEvents: EventWithCreator[];
  initialMaplesEvents: EventWithCreator[];
  initialDefaultBuilding?: Building;
  initialTab?: DashboardTab;
  messageTemplates: MessageTemplateMap;
  currentUserRole: UserRole;
  currentUserWard: Ward;
  canSelectAnyWard: boolean;
  fixedBuildingForWardUsers?: Building;
  defaultEventType: EventType;
}

export type DashboardCounts = {
  pendingLicense: { stake: number; maples: number; total: number };
  activeLicense: { stake: number; maples: number; total: number };
  upcoming: { stake: number; maples: number; total: number };
  past: { stake: number; maples: number; total: number };
};

export type WardBreakdownRow = {
  ward: string;
  pending: number;
  active: number;
  upcoming: number;
  past: number;
  total: number;
};

export type DotCalendarDay = {
  ymd: string;
  count: number;
  pending: number;
  active: number;
  upcoming: number;
};
