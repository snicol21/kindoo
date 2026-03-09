export type LicenseJobEventStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type LicenseJobEvent = {
  type: 'license-job-updated';
  userId: string;
  jobId: string;
  eventId: string;
  status: LicenseJobEventStatus;
  completionType?: 'temporary-license-created' | 'existing-active-license' | null;
};

type Listener = (event: LicenseJobEvent) => void;

const listeners = new Set<Listener>();

export function subscribeLicenseJobEvents(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishLicenseJobEvent(event: LicenseJobEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener failures; streaming should not break route handlers.
    }
  }
}
