import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/_ui/card';
import { PageContainer } from '@/components/PageContainer';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Legal & Policies',
  description: 'DigitalFob SMS messaging policy, privacy policy, and terms of service.',
  robots: { index: true, follow: true },
};

const SUPPORT_EMAIL = 'spencer.nicol@gmail.com';
const EFFECTIVE_DATE = 'March 27, 2026';

const SAMPLE_MESSAGES = [
  'DigitalFob: New access request from Jane Doe (3rd Ward). Review in the admin access requests queue.',
  'DigitalFob: Kindoo license job failed for 2026-03-21 18:00–20:00 (Stake Center). Review in dashboard.',
  'DigitalFob: License job completed for 2026-03-21 18:00–20:00 (Stake Center).',
];

const PROGRAM_DETAILS: [string, string][] = [
  ['Business name', 'DigitalFob'],
  ['Business contact', 'Spencer Nicol'],
  ['Support email', SUPPORT_EMAIL],
  ['Program type', 'Transactional / operational alerts only'],
  ['Marketing messages', 'None — not permitted under this program'],
  ['Opt-in method', 'Explicit written checkbox in Account Settings'],
  ['Opt-out method', 'Reply STOP to any message or disable in Account Settings'],
  ['Help', 'Reply HELP to any message or email support'],
  ['Audience', 'Authorized account holders only (closed user group)'],
];

function SectionDivider() {
  return <hr className="border-border" />;
}

function SubSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{heading}</h3>
      {children}
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-7 text-muted-foreground">{children}</p>;
}

function BulletList({ children }: { children: React.ReactNode }) {
  return (
    <ul
      style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}
      className="space-y-2 text-sm leading-7 text-muted-foreground"
    >
      {children}
    </ul>
  );
}

function NumberedList({ children }: { children: React.ReactNode }) {
  return (
    <ol
      style={{ listStyleType: 'decimal', paddingLeft: '1.5rem' }}
      className="space-y-2 text-sm leading-7 text-muted-foreground"
    >
      {children}
    </ol>
  );
}

export default function LegalPage() {
  return (
    <PageContainer width="narrow" className="py-8 sm:py-12">
      <div id="policies-page" className="mx-auto max-w-3xl space-y-6">
        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="space-y-1 px-1">
          <h1 className="text-2xl font-bold tracking-tight">Legal &amp; Policies</h1>
          <p className="text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}.</p>
        </div>

        {/* ── Inline nav ──────────────────────────────────────────── */}
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
          {[
            ['#sms-policy', 'SMS Policy'],
            ['#toll-free-verification', 'SMS Program'],
            ['#privacy', 'Privacy'],
            ['#terms', 'Terms'],
          ].map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all hover:bg-background hover:text-foreground hover:shadow"
            >
              {label}
            </a>
          ))}
        </div>

        {/* ── SMS Messaging Policy ─────────────────────────────────── */}
        <Card id="sms-policy" style={{ scrollMarginTop: '5rem' }}>
          <CardHeader>
            <CardTitle>
              <a href="#sms-policy" className="hover:underline underline-offset-2">
                SMS Messaging Policy
              </a>
            </CardTitle>
            <CardDescription>Effective {EFFECTIVE_DATE}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SectionDivider />

            <SubSection heading="1. Program Description">
              <Prose>
                DigitalFob is a private, access-controlled operations application available
                exclusively to authorized personnel. SMS notifications are an optional feature
                available only to users holding an active, administrator-granted account. DigitalFob
                transmits only transactional and operational text messages. No marketing,
                promotional, advertising, or unsolicited messages are sent under this program.
              </Prose>
              <Prose>Notification categories are limited to the following:</Prose>
              <BulletList>
                <li>
                  <strong>Access request alert</strong> — notifies an administrator when a new
                  account access request has been submitted for review.
                </li>
                <li>
                  <strong>Kindoo license job completed</strong> — confirms that a scheduled Kindoo
                  license automation job ran successfully.
                </li>
                <li>
                  <strong>Kindoo license job failed</strong> — alerts the user that a Kindoo license
                  job encountered an error and requires attention.
                </li>
                <li>
                  <strong>New event created</strong> — notifies users when a new building event has
                  been added to the schedule.
                </li>
              </BulletList>
            </SubSection>

            <SectionDivider />

            <SubSection heading="2. How to Opt In (Prior Express Written Consent)">
              <Prose>
                SMS enrollment requires prior express written consent obtained exclusively within
                the DigitalFob application. Consent is never assumed, inferred from account
                creation, or obtained as a condition of receiving application access. To enroll:
              </Prose>
              <NumberedList>
                <li>Sign in to your DigitalFob account.</li>
                <li>
                  Navigate to <strong>Account Settings</strong>.
                </li>
                <li>
                  Check the checkbox labelled:{' '}
                  <em>
                    &ldquo;I agree to receive SMS notifications from DigitalFob about account and
                    operations updates.&rdquo;
                  </em>
                </li>
                <li>Enter or confirm your mobile phone number.</li>
                <li>Select the specific notification categories you wish to receive.</li>
                <li>Save your settings.</li>
              </NumberedList>
              <Prose>
                Your consent is stored and associated with your account. You may modify or revoke it
                at any time by returning to Account Settings.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="3. Message Frequency">
              <Prose>
                <strong>Message frequency varies.</strong> Volume depends on your account activity
                and the notification categories you have enabled. Users with minimal activity may
                receive very few or no messages. There is no fixed or recurring message schedule.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="4. Fees and Costs">
              <Prose>
                <strong>Message and data rates may apply.</strong> Standard messaging and data rates
                from your mobile carrier may apply to messages you send or receive. DigitalFob does
                not impose any additional charges for SMS notifications.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="5. How to Opt Out (STOP)">
              <Prose>
                You may revoke consent and stop receiving messages from DigitalFob at any time:
              </Prose>
              <BulletList>
                <li>
                  Reply <strong>STOP</strong> to any message. Your number will be unsubscribed
                  immediately and you will receive a single confirmation. No further messages will
                  be sent.
                </li>
                <li>
                  Disable SMS in <strong>Account Settings</strong> and save your preferences.
                </li>
              </BulletList>
              <Prose>
                After opting out, no further messages will be sent unless you explicitly re-enable
                SMS notifications in Account Settings.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="6. Help and Support (HELP)">
              <Prose>
                Reply <strong>HELP</strong> to any message for support information, or contact us
                directly at{' '}
                <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="7. Sample Messages">
              <Prose>
                All messages identify DigitalFob as the sender and are strictly operational in
                nature.
              </Prose>
              <div className="space-y-3 pt-1">
                {SAMPLE_MESSAGES.map((msg, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-primary/20 bg-primary/5 px-4 py-3 text-sm whitespace-pre-wrap shadow-sm">
                      <div className="text-foreground/90">{msg}</div>
                    </div>
                  </div>
                ))}
              </div>
            </SubSection>
          </CardContent>
        </Card>

        {/* ── SMS Program Details ──────────────────────────────────── */}
        <Card id="toll-free-verification" style={{ scrollMarginTop: '5rem' }}>
          <CardHeader>
            <CardTitle>
              <a href="#toll-free-verification" className="hover:underline underline-offset-2">
                SMS Program Details
              </a>
            </CardTitle>
            <CardDescription>
              Business and carrier registration information for our toll-free SMS number.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-hidden rounded-lg border text-sm">
              <table className="w-full border-collapse">
                <tbody>
                  {PROGRAM_DETAILS.map(([label, value], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-muted/40' : ''}>
                      <td className="w-44 px-4 py-3 font-medium align-top whitespace-nowrap">
                        {label}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground align-top leading-6">
                        {label === 'Support email' ? (
                          <a className="underline underline-offset-2" href={`mailto:${value}`}>
                            {value}
                          </a>
                        ) : (
                          value
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Prose>
              This page is publicly accessible without a login or password. The complete opt-in
              workflow, STOP and HELP handling, sample messages, privacy policy, and terms of
              service are all documented in full on this page.
            </Prose>
          </CardContent>
        </Card>

        {/* ── Privacy Policy ───────────────────────────────────────── */}
        <Card id="privacy" style={{ scrollMarginTop: '5rem' }}>
          <CardHeader>
            <CardTitle>
              <a href="#privacy" className="hover:underline underline-offset-2">
                Privacy Policy
              </a>
            </CardTitle>
            <CardDescription>Effective {EFFECTIVE_DATE}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SectionDivider />

            <SubSection heading="Information We Collect">
              <Prose>
                DigitalFob collects only the information necessary to operate the application and
                deliver the services you use:
              </Prose>
              <BulletList>
                <li>Name and email address for account identification and authentication.</li>
                <li>Role, building, and ward assignment for access control purposes.</li>
                <li>Mobile phone number, if and only if you choose to enable SMS notifications.</li>
                <li>SMS notification preferences configured within Account Settings.</li>
              </BulletList>
            </SubSection>

            <SectionDivider />

            <SubSection heading="How We Use Your Information">
              <BulletList>
                <li>
                  Your mobile phone number is used exclusively to deliver the SMS notifications you
                  have expressly opted in to receive. It is not used for any other purpose.
                </li>
                <li>
                  We do not sell, rent, trade, or otherwise disclose your personal information to
                  any third party for advertising, marketing, or commercial purposes. The above
                  excludes text messaging originator opt-in data and consent; this information will
                  not be shared with any third parties.
                </li>
                <li>
                  SMS messages are transmitted via Twilio, our third-party SMS delivery provider.
                  Twilio processes your phone number solely to route and deliver your requested
                  notifications. Twilio&apos;s privacy practices are governed by their own privacy
                  policy.
                </li>
                <li>
                  Mobile information (including SMS opt-in consent) may be shared only with service
                  providers that directly assist in delivering our application services. It is never
                  shared with third parties for marketing or promotional purposes.
                </li>
              </BulletList>
            </SubSection>

            <SectionDivider />

            <SubSection heading="Your Rights and Controls">
              <BulletList>
                <li>You may disable SMS notifications at any time in Account Settings.</li>
                <li>You may reply STOP to any SMS message to immediately revoke your consent.</li>
                <li>
                  You may update your phone number, email address, or notification preferences at
                  any time in Account Settings.
                </li>
                <li>
                  You may request access to, correction of, or deletion of your personal data by
                  contacting us at the address below.
                </li>
              </BulletList>
            </SubSection>

            <SectionDivider />

            <SubSection heading="Data Retention">
              <Prose>
                Account and preference data is retained for as long as your account remains active.
                When an account is removed, associated personal information is deleted from our
                systems. Phone numbers are removed from active use immediately upon opt-out or
                account deactivation.
              </Prose>
            </SubSection>

            <SectionDivider />

            <Prose>
              For privacy questions, data access requests, or deletion requests, contact{' '}
              <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </Prose>
          </CardContent>
        </Card>

        {/* ── Terms of Service ─────────────────────────────────────── */}
        <Card id="terms" style={{ scrollMarginTop: '5rem' }}>
          <CardHeader>
            <CardTitle>
              <a href="#terms" className="hover:underline underline-offset-2">
                Terms of Service
              </a>
            </CardTitle>
            <CardDescription>Effective {EFFECTIVE_DATE}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <SectionDivider />

            <SubSection heading="1. Acceptance of Terms">
              <Prose>
                By accessing or using DigitalFob, you agree to be bound by these Terms of Service
                and all applicable laws and regulations. If you do not agree, you may not access or
                use the application.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="2. Authorized Use Only">
              <Prose>
                DigitalFob is a private application. Access is granted solely at the discretion of a
                system administrator to authorized personnel. You agree to use the application only
                for its intended operational purposes and in accordance with the role permissions
                assigned to your account. Unauthorized access, credential sharing, or misuse of the
                platform is strictly prohibited.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="3. SMS Notifications">
              <Prose>
                By enabling SMS notifications, you provide prior express written consent to receive
                transactional text messages from DigitalFob at the mobile number you provide. You
                acknowledge and agree that:
              </Prose>
              <BulletList>
                <li>
                  Message frequency varies based on your account activity and selected notification
                  categories.
                </li>
                <li>Message and data rates may apply as charged by your mobile carrier.</li>
                <li>
                  You may opt out at any time by replying STOP or by disabling SMS in Account
                  Settings.
                </li>
                <li>You may reply HELP at any time for support information.</li>
                <li>
                  Consent to receive SMS messages is not a condition of using DigitalFob or of being
                  granted account access.
                </li>
              </BulletList>
            </SubSection>

            <SectionDivider />

            <SubSection heading="4. Disclaimer of Warranties">
              <Prose>
                DigitalFob is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
                warranties of any kind, express or implied. To the fullest extent permitted by
                applicable law, DigitalFob and its operators disclaim all warranties, including
                implied warranties of merchantability, fitness for a particular purpose, and
                non-infringement.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="5. Limitation of Liability">
              <Prose>
                To the fullest extent permitted by applicable law, DigitalFob and its operators
                shall not be liable for any indirect, incidental, special, consequential, or
                punitive damages arising from your use of or inability to use the application or its
                SMS notification service.
              </Prose>
            </SubSection>

            <SectionDivider />

            <SubSection heading="6. Changes to These Terms">
              <Prose>
                We reserve the right to update these terms at any time. Updates are effective upon
                posting to this page. Continued use of the application following any update
                constitutes your acceptance of the revised terms.
              </Prose>
            </SubSection>

            <SectionDivider />

            <Prose>
              Questions about these terms? Contact{' '}
              <a className="underline underline-offset-2" href={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </a>
              .
            </Prose>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
