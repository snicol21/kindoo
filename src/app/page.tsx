import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarDays, Building2, Shield } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';


export default async function HomePage() {
  await connection();
  const session = await auth();

  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
      <div className="w-full max-w-4xl space-y-8 text-center">
        {/* Hero */}
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <CalendarDays className="h-12 w-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Event Tracker</h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Private event management for{' '}
            <span className="font-semibold text-foreground">Stake Center</span> and{' '}
            <span className="font-semibold text-foreground">Maples Building</span>. Track upcoming
            events, contact details, and more.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              icon: Building2,
              title: 'Two Buildings',
              desc: 'Separate event lists for Stake Center and Maples Building.',
            },
            {
              icon: Shield,
              title: 'Private & Secure',
              desc: 'Authentication required. Only your events are visible.',
            },
            {
              icon: CalendarDays,
              title: 'Easy Tracking',
              desc: 'Add events with contact info and descriptions instantly.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="text-left">
              <CardHeader className="pb-2">
                <Icon className="h-6 w-6 text-primary mb-2" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg">
            <Link href="/auth/signin">Sign In to Get Started</Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">Authorized personnel only.</p>
      </div>
    </div>
  );
}
