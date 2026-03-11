import { getMessageTemplates } from '@/actions/message-templates';
import { MessageTemplatesEditor } from '@/components/MessageTemplatesEditor';
import { PageContainer } from '@/components/PageContainer';
import { Button } from '@/components/_ui/button';
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/message-templates';
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';

export const metadata: Metadata = {
  title: 'Message Templates',
};

export default async function MessageTemplatesPage() {
  await connection();
  const result = await getMessageTemplates();
  if (!result.success && result.error === 'Not authenticated.') {
    redirect('/auth/signin');
  }

  const resolvedTemplates = result.success && result.data ? result.data : DEFAULT_MESSAGE_TEMPLATES;
  const hasAnyTemplate = Object.values(resolvedTemplates).some((value) => value.trim().length > 0);
  const templates = hasAnyTemplate ? resolvedTemplates : DEFAULT_MESSAGE_TEMPLATES;

  return (
    <PageContainer width="narrow">
      <div className="sticky top-2 z-10 mb-6 w-fit rounded-md bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 sm:static sm:bg-transparent sm:backdrop-blur-none">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Message templates</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Customize the messages you copy for members. Use placeholders to insert event data.
          </p>
        </div>

        <MessageTemplatesEditor initialTemplates={templates} />
      </div>

      <div className="mt-8">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    </PageContainer>
  );
}
