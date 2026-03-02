import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { events, users } from '@/schema/schema';
import { eq } from 'drizzle-orm';
import { DashboardClient } from '@/components/DashboardClient';
import type { Metadata } from 'next';
import type { Building } from '@/schema/schema';
import { connection } from 'next/server';
import { getMessageTemplates } from '@/actions/message-templates';
import { EMPTY_MESSAGE_TEMPLATES } from '@/lib/message-templates';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardPage() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  const userPreference = await db
    .select({ licenseLeadDays: users.licenseLeadDays })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

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
      .where(eq(events.building, 'Stake Center' as Building))
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
      .where(eq(events.building, 'Maples Building' as Building))
      .orderBy(events.createdAt),
  ]);

  const templatesResult = await getMessageTemplates();
  const messageTemplates =
    templatesResult.success && templatesResult.data
      ? templatesResult.data
      : EMPTY_MESSAGE_TEMPLATES;

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      initialLicenseLeadDays={userPreference[0]?.licenseLeadDays ?? null}
      initialStakeCenterEvents={stakeCenterEvents}
      initialMaplesEvents={maplesEvents}
      messageTemplates={messageTemplates}
    />
  );
}
