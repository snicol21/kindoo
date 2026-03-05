import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { events, users, type UserRole } from '@/schema/schema';
import { and, eq } from 'drizzle-orm';
import { DashboardClient } from '@/components/DashboardClient';
import type { Metadata } from 'next';
import type { Building } from '@/schema/schema';
import { connection } from 'next/server';
import { getMessageTemplates } from '@/actions/message-templates';
import { EMPTY_MESSAGE_TEMPLATES } from '@/lib/message-templates';
import { isAdminEmail } from '@/lib/admin';

type DashboardTab = 'stake-center' | 'maples-building';

function normalizeDashboardTab(value: string | null | undefined): DashboardTab | null {
  if (value === 'stake-center' || value === 'maples-building') {
    return value;
  }
  return null;
}

export const metadata: Metadata = {
  title: { absolute: 'Event Tracker' },
};

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  await connection();
  const session = await auth();
  const params = await searchParams;

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const role: UserRole = isAdminEmail(session.user.email ?? null)
    ? 'admin'
    : ((session.user.role ?? 'user') as UserRole);

  const userPreference = await db
    .select({
      licenseLeadDays: users.licenseLeadDays,
      defaultBuilding: users.defaultBuilding,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const initialDefaultBuilding = userPreference[0]?.defaultBuilding ?? 'Stake Center';
  const fallbackTab =
    initialDefaultBuilding === 'Maples Building' ? 'maples-building' : 'stake-center';
  const rawBuilding = Array.isArray(params.building) ? params.building[0] : params.building;
  const normalizedBuilding = normalizeDashboardTab(rawBuilding);

  if (rawBuilding && !normalizedBuilding) {
    const nextParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          nextParams.append(key, entry);
        }
      } else if (typeof value === 'string') {
        nextParams.set(key, value);
      }
    }
    nextParams.set('building', fallbackTab);
    redirect(`/dashboard?${nextParams.toString()}`);
  }

  const initialTab = normalizedBuilding ?? fallbackTab;

  // Initial data fetch for both buildings (runs in parallel)
  const [stakeCenterEvents, maplesEvents] = await Promise.all([
    db
      .select({
        id: events.id,
        building: events.building,
        ward: events.ward,
        name: events.name,
        eventDate: events.eventDate,
        startTime: events.startTime,
        endTime: events.endTime,
        phone: events.phone,
        email: events.email,
        description: events.description,
        kindooLicenseCreated: events.kindooLicenseCreated,
        userId: events.userId,
        createdAt: events.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(events)
      .innerJoin(users, eq(events.userId, users.id))
      .where(
        role === 'user'
          ? and(eq(events.building, 'Stake Center' as Building), eq(events.userId, session.user.id))
          : eq(events.building, 'Stake Center' as Building)
      )
      .orderBy(events.createdAt),
    db
      .select({
        id: events.id,
        building: events.building,
        ward: events.ward,
        name: events.name,
        eventDate: events.eventDate,
        startTime: events.startTime,
        endTime: events.endTime,
        phone: events.phone,
        email: events.email,
        description: events.description,
        kindooLicenseCreated: events.kindooLicenseCreated,
        userId: events.userId,
        createdAt: events.createdAt,
        creatorName: users.name,
        creatorEmail: users.email,
      })
      .from(events)
      .innerJoin(users, eq(events.userId, users.id))
      .where(
        role === 'user'
          ? and(
              eq(events.building, 'Maples Building' as Building),
              eq(events.userId, session.user.id)
            )
          : eq(events.building, 'Maples Building' as Building)
      )
      .orderBy(events.createdAt),
  ]);

  const templatesResult = await getMessageTemplates();
  const messageTemplates =
    templatesResult.success && templatesResult.data
      ? templatesResult.data
      : EMPTY_MESSAGE_TEMPLATES;

  return (
    <DashboardClient
      initialLicenseLeadDays={userPreference[0]?.licenseLeadDays ?? null}
      initialDefaultBuilding={initialDefaultBuilding}
      initialTab={initialTab}
      initialStakeCenterEvents={stakeCenterEvents}
      initialMaplesEvents={maplesEvents}
      messageTemplates={messageTemplates}
    />
  );
}
