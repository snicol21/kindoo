import { completeForcedPasswordReset } from '@/actions/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const formData = await request.formData();
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  const result = await completeForcedPasswordReset({
    newPassword,
    confirmPassword,
  });

  const baseUrl = new URL(request.url);

  if (!result.success) {
    const msg = encodeURIComponent(result.error ?? 'Failed to update password.');
    return NextResponse.redirect(new URL(`/change-password?error=${msg}`, baseUrl), {
      status: 303,
    });
  }

  return NextResponse.redirect(new URL('/dashboard', baseUrl), { status: 303 });
}
