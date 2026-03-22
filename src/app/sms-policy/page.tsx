import { PageContainer } from '@/components/PageContainer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SMS Messaging Policy',
  description: 'DigitalFob SMS consent, opt-in, opt-out, and support policy.',
};

export default function SmsPolicyPage() {
  const supportEmail = 'spencer.nicol@gmail.com';

  return (
    <PageContainer width="narrow" className="py-8 sm:py-12">
      <div
        className="bg-card"
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: '0.75rem',
        }}
      >
        <div
          className="mx-auto max-w-3xl"
          style={{
            padding: '28px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2rem',
          }}
        >
          <header className="space-y-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              SMS Consent & Messaging Policy
            </h1>
            <p className="text-sm text-muted-foreground sm:text-base">
              Effective date: March 21, 2026. This policy describes how DigitalFob sends SMS
              notifications and how recipients can manage consent.
            </p>
          </header>

          <section id="program-description" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Program Description</h2>
            <p>
              DigitalFob sends transactional SMS notifications related to account and operations
              activity. Current notification types include new access request alerts, Kindoo worker
              job status notifications (completed or failed), and new event creation notifications.
            </p>
            <p>
              Messages are operational and informational only. DigitalFob does not use this program
              for marketing or promotional campaigns.
            </p>
          </section>

          <section id="consent" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">How Consent Is Collected</h2>
            <p>Users opt in through the application by completing this workflow:</p>
            <div className="space-y-1">
              <p>1. Sign in to their account.</p>
              <p>2. Open Account Settings.</p>
              <p>3. Enable SMS notifications.</p>
              <p>4. Provide or confirm a phone number.</p>
              <p>5. Choose which notification types they want to receive.</p>
            </div>
            <p>Proof of consent is retained in the application as:</p>
            <div className="space-y-1">
              <p>Stored SMS preference flags for the user account.</p>
              <p>Stored phone destination value used for opted-in notifications.</p>
              <p>Ability for the user to disable SMS preferences at any time.</p>
            </div>
            <p>
              Consent preferences are stored in the application database and can be updated at any
              time by the user.
            </p>
            <p>Users can revoke SMS consent by disabling SMS notifications in Account Settings.</p>
          </section>

          <section id="frequency" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Message Frequency</h2>
            <p>
              Message frequency varies based on account activity and selected notification
              preferences. Some users may receive no messages during periods with no operational
              events.
            </p>
          </section>

          <section id="rates" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Fees</h2>
            <p>
              Message and data rates may apply according to your mobile carrier plan. DigitalFob
              does not charge separate SMS subscription fees.
            </p>
          </section>

          <section id="opt-out" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Opt-Out</h2>
            <p>
              To opt out, disable SMS notifications in Account Settings. This setting is applied to
              future SMS notifications sent by the DigitalFob application.
            </p>
          </section>

          <section id="help" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Help</h2>
            <p>
              Contact support at{' '}
              <a className="underline underline-offset-2" href={`mailto:${supportEmail}`}>
                {supportEmail}
              </a>
              .
            </p>
          </section>

          <section id="sample-messages" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Sample Messages</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/60" />
                <div className="max-w-2xl rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
                  <div className="text-foreground/90">
                    DigitalFob: New access request from Jane Doe (3rd Ward). Review in the admin
                    access requests queue.
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/60" />
                <div className="max-w-2xl rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
                  <div className="text-foreground/90">
                    DigitalFob: Kindoo license job failed for 2026-03-21 18:00-20:00 (Stake Center).
                    Review in dashboard.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="privacy" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Privacy</h2>
            <p>
              DigitalFob uses your phone number only to deliver opted-in operational SMS
              notifications and related support communication. SMS preferences can be changed at any
              time in Account Settings.
            </p>
          </section>

          <section id="terms" className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Terms</h2>
            <p>
              By opting in, you agree to receive transactional notifications associated with your
              DigitalFob account and operations workflow. Opt-out is managed in Account Settings.
            </p>
          </section>
        </div>
      </div>
    </PageContainer>
  );
}
