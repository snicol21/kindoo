import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { events } from '@/schema/schema';
import { eq, and } from 'drizzle-orm';
import { DashboardClient } from '@/components/DashboardClient';
import type { Metadata } from 'next';
import type { Building } from '@/schema/schema';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Dashboard',
};


export default async function DashboardPage() {
  await connection();
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Initial data fetch for both buildings (runs in parallel)
  const [stakeCenterEvents, maplesEvents] = await Promise.all([
    db
      .select()
      .from(events)
      .where(
        and(eq(events.userId, session.user.id), eq(events.building, 'Stake Center' as Building))
      )
      .orderBy(events.createdAt),
    db
      .select()
      .from(events)
      .where(
        and(eq(events.userId, session.user.id), eq(events.building, 'Maples Building' as Building))
      )
      .orderBy(events.createdAt),
  ]);

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }}
      initialStakeCenterEvents={stakeCenterEvents}
      initialMaplesEvents={maplesEvents}
    />
  );
}
