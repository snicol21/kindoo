CREATE TABLE message_template_default (
  key text PRIMARY KEY NOT NULL,
  body text NOT NULL,
  created_at integer NOT NULL DEFAULT (unixepoch()),
  updated_at integer NOT NULL DEFAULT (unixepoch())
);

INSERT INTO message_template_default (key, body)
VALUES
  ('availability_inquiry', 'Hey {firstName}, thanks for reaching out. Let me check the calendar to see if we have some availability for your private event ({description}) on {eventDate} ({timeRange}) at the {building}. I''ll follow up as soon as I confirm availability.'),
  ('calendar_item', 'Member: {fullName}\nEvent details: {description}\nWard: {ward}\nPhone: {phone}\nEmail: {email}'),
  ('availability_confirmed', '{firstName}, I was able to confirm availability for your private event on {eventDate} from {timeRange} at the {building}.\n\nWe will need your email address that you use on your church membership record so we can issue your temporary Kindoo access.\n\nAlso we require you to please review the Stake Meetinghouse Use Policies here:\n{policyLink}'),
  ('license_created', 'Hi {firstName}, we just created a temporary Kindoo license for you. Your access window is {licenseWindow}. You should receive an invitation email shortly with a link to download the app. After installing, sign in with the same email/Church account. You''ll be prompted to allow Bluetooth and Location on your phone—these permissions let the app detect the door so the Open button works. At the entrance, open the app and tap Open to unlock the door.');
