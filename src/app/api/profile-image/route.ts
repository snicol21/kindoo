import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/schema/schema';
import { eq } from 'drizzle-orm';

const MAX_PROFILE_IMAGE_SIZE = 3 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function sanitizeFilename(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const formData = await request.formData();
  const remove = formData.get('remove');

  if (remove === '1') {
    await db.update(users).set({ image: null }).where(eq(users.id, userId));
    return NextResponse.json({ url: null });
  }

  const image = formData.get('image');

  if (!image || typeof image === 'string') {
    return NextResponse.json({ error: 'Please choose an image to upload.' }, { status: 400 });
  }

  if (!ALLOWED_PROFILE_IMAGE_TYPES.has(image.type)) {
    return NextResponse.json(
      { error: 'Profile photo must be a JPG, PNG, or WebP image.' },
      { status: 400 }
    );
  }

  if (image.size > MAX_PROFILE_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Profile photo must be 3MB or less.' }, { status: 400 });
  }

  const safeName = sanitizeFilename(image.name || 'profile-image');
  const blob = await put(`profiles/${userId}/${Date.now()}-${safeName}`, image, {
    access: 'public',
    contentType: image.type,
  });

  await db.update(users).set({ image: blob.url }).where(eq(users.id, userId));
  return NextResponse.json({ url: blob.url });
}
