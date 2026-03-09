import { auth } from '@/lib/auth';
import { subscribeLicenseJobEvents } from '@/lib/license-job-events';

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof globalThis.setInterval> | null = null;

  const cleanup = () => {
    if (heartbeat) {
      globalThis.clearInterval(heartbeat);
      heartbeat = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (eventName: string, payload: unknown) => {
        const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      send('connected', { ok: true, userId });

      unsubscribe = subscribeLicenseJobEvents((event) => {
        if (event.userId !== userId) return;
        send('license-job-updated', event);
      });

      heartbeat = globalThis.setInterval(() => {
        controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 25000);
    },
    cancel() {
      cleanup();
    },
  });

  request.signal.addEventListener('abort', cleanup, { once: true });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
