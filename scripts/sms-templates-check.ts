// Run: pnpm dlx tsx scripts/sms-templates-check.ts
import assert from 'node:assert/strict';
import {
  buildAccessRequestSubmittedSms,
  buildEventCreatedSms,
  buildLicenseJobCompletedSms,
  buildLicenseJobFailedSms,
  formatEventDate,
  formatTimeRange,
  friendlyFailureReason,
  gsmLength,
  smsSegments,
} from '../src/lib/sms-message-templates';

const ev = {
  description: 'Youth Activity Night',
  eventType: 'Ward',
  eventDate: '2026-10-17',
  startTime: '18:00',
  endTime: '21:00',
  building: 'Stake Center',
  ward: '3rd Ward',
  contactName: 'Jane Smith',
  contactPhone: '801-555-0123',
};

assert.equal(formatEventDate('2026-10-17'), 'Sat Oct 17');
assert.equal(formatTimeRange('18:00', '21:00'), '6:00-9:00 PM');
assert.equal(formatTimeRange('11:00', '13:00'), '11:00 AM-1:00 PM');
assert.equal(formatTimeRange('00:30', '12:00'), '12:30 AM-12:00 PM');
assert.equal(friendlyFailureReason('Login did not reach an authenticated page before timeout.'), 'Kindoo login timed out');
assert.equal(friendlyFailureReason('weird'), 'Automation error, see dashboard');

const samples = {
  created: buildEventCreatedSms(ev),
  ready: buildLicenseJobCompletedSms(ev),
  failed: buildLicenseJobFailedSms({ ...ev, details: 'Login did not reach an authenticated page before timeout.' }),
  access: buildAccessRequestSubmittedSms({ name: 'Jane Smith', ward: '3rd Ward', email: 'jane.smith@example.com' }),
  longDesc: buildEventCreatedSms({ ...ev, description: '“Super” long description — with fancy… chars ✨ and more and more text here' }),
  sparse: buildEventCreatedSms({ ...ev, description: '', contactPhone: null, ward: null }),
};

for (const [name, msg] of Object.entries(samples)) {
  assert.ok(!/https?:\/\//.test(msg), `${name} has link`);
  assert.ok(!/[\u2013\u2014\u2026\u201C\u201D]/.test(msg), `${name} has non-GSM punctuation`);
  assert.ok(gsmLength(msg) <= 306, `${name} too long`);
  console.log(`--- ${name} (${gsmLength(msg)} chars, ${smsSegments(msg)} segment(s))\n${msg}\n`);
}
assert.ok(samples.sparse.includes('\nPrivate') === false && samples.sparse.includes('Ward event'));
console.log('OK');
