import { Button } from '@/components/_ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { auth } from '@/lib/auth';
import { Building2, CalendarDays, ClipboardList, Shield, Users, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

const features = [
  {
    icon: Building2,
    title: 'Two buildings',
    desc: 'Dedicated event views for Stake Center and Maples Building, kept cleanly separate.',
  },
  {
    icon: Users,
    title: 'Role-based access',
    desc: 'Admins, stake managers, ward managers, and ward users each see only what they need.',
  },
  {
    icon: CalendarDays,
    title: 'Event scheduling',
    desc: 'Create and manage events with dates, locations, contact info, and descriptions.',
  },
  {
    icon: ClipboardList,
    title: 'License queue',
    desc: 'Kindoo license jobs are queued, claimed by workers, and tracked through completion.',
  },
  {
    icon: Zap,
    title: 'Automation',
    desc: 'Reusable message templates and queue-based processing reduce repetitive manual work.',
  },
  {
    icon: Shield,
    title: 'Private & secure',
    desc: 'Authentication required. Access is scoped to your role and assigned ward.',
  },
];

export default async function HomePage() {
  await connection();
  const session = await auth();
  if (session?.user) redirect('/dashboard');

  return (
    <div className="flex min-h-[calc(100vh-4rem)] justify-center px-4 pt-[10vh]">
      <div className="w-full max-w-4xl space-y-8 text-left">
        {/* Hero */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 ring-1 ring-primary/15">
              <Image src="/icons/favicon.svg" alt="DigitalFob" width={40} height={40} />
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">DigitalFob</h1>
          </div>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Private operations dashboard for{' '}
            <span className="font-semibold text-foreground">Stake Center</span> and{' '}
            <span className="font-semibold text-foreground">Maples Building</span> — covering event
            scheduling, role-based access, contact management, and Kindoo license automation.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="text-left">
              <CardHeader className="pb-2">
                <Icon className="mb-2 h-5 w-5 text-primary" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="flex justify-center">
          <Button asChild size="lg">
            <Link href="/auth/signin">Sign in to get started</Link>
          </Button>
        </div>

        <p className="mb-10 text-center text-sm text-muted-foreground">
          Authorized personnel only.
        </p>
      </div>
    </div>
  );
}
