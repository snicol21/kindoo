'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/_ui/avatar';
import { Button } from '@/components/_ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/_ui/dialog';
import { Input } from '@/components/_ui/input';
import { Label } from '@/components/_ui/label';
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';

const MAX_PREVIEW_SIZE = 512;
const MAX_UPLOAD_SIZE = 3 * 1024 * 1024;
const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type ProfileImageUploaderProps = {
  initialImageUrl: string | null;
  initials: string;
  displayName: string;
};

async function createImage(source: string) {
  if ('createImageBitmap' in window) {
    const response = await fetch(source);
    const blob = await response.blob();
    return await createImageBitmap(blob);
  }

  const image = new Image();
  image.src = source;
  await image.decode();
  return image;
}

async function getCroppedBlob(imageSrc: string, cropArea: Area) {
  const image = await createImage(imageSrc);
  const target = Math.min(MAX_PREVIEW_SIZE, Math.round(cropArea.width));

  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process image.');
  }

  ctx.drawImage(
    image as CanvasImageSource,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    target,
    target
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.82)
  );

  if (!blob) {
    throw new Error('Unable to compress image.');
  }

  return blob;
}

export function ProfileImageUploader({
  initialImageUrl,
  initials,
  displayName,
}: ProfileImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);

  const activeImageUrl = useMemo(
    () => previewUrl ?? initialImageUrl,
    [previewUrl, initialImageUrl]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = () => {
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    if (!SUPPORTED_TYPES.includes(file.type)) {
      setError('Profile photo must be a JPG, PNG, or WebP image.');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setPreviewUrl(objectUrl);
  };

  const handleChooseFile = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleCropComplete = (_: Area, croppedAreaPixelsValue: Area) => {
    setCroppedAreaPixels(croppedAreaPixelsValue);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError('Please choose an image to upload.');
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE) {
      setError('Profile photo must be 3MB or less.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (!previewUrl || !croppedAreaPixels) {
        throw new Error('Please crop the image before uploading.');
      }

      const compressed = await getCroppedBlob(previewUrl, croppedAreaPixels);
      const formData = new FormData();
      formData.append('image', compressed, 'profile.webp');

      const response = await fetch('/api/profile-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error || 'Failed to update profile photo.';
        throw new Error(message);
      }

      window.location.href = '/account?imageUpdated=1';
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('remove', '1');

      const response = await fetch('/api/profile-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message = payload?.error || 'Failed to remove profile photo.';
        throw new Error(message);
      }

      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setPreviewUrl(null);
      window.location.href = '/account?imageUpdated=1';
    } catch (removeError) {
      const message = removeError instanceof Error ? removeError.message : 'Remove failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 border-t border-border pt-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-16 w-16 border border-border">
            <AvatarImage src={activeImageUrl ?? undefined} alt={displayName} />
            <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
          </Avatar>
          {activeImageUrl && (
            <Button
              type="button"
              variant="ghost"
              className="absolute -right-2 -top-2 h-7 w-7 rounded-full border border-border bg-background p-0 text-destructive hover:text-destructive"
              onClick={() => setIsRemoveDialogOpen(true)}
              disabled={isSubmitting}
              aria-label="Remove profile photo"
              title="Remove photo"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">Profile photo</p>
          <p className="text-xs text-muted-foreground">JPG, PNG, or WebP. Max 3MB.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="secondary" className="ml-auto">
              Upload photo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit profile photo</DialogTitle>
              <DialogDescription>
                Upload an image and crop it to a square for the best fit.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="image">Choose image</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    ref={inputRef}
                    id="image"
                    name="image"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <Button type="button" variant="outline" onClick={handleChooseFile}>
                    Select image
                  </Button>
                  {previewUrl && (
                    <span className="text-xs text-muted-foreground">Image selected</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG, or WebP. Max 3MB. Image is cropped and compressed.
                </p>
                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>

              {previewUrl ? (
                <div className="space-y-3">
                  <div className="relative h-60 w-full overflow-hidden rounded-md border border-border bg-muted">
                    <Cropper
                      image={previewUrl}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={handleCropComplete}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zoom">Zoom</Label>
                    <Input
                      id="zoom"
                      type="range"
                      min={1}
                      max={3}
                      step={0.1}
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Select an image to preview and crop.
                </div>
              )}

              <DialogFooter>
                <Button type="submit" variant="secondary" disabled={isSubmitting}>
                  {isSubmitting ? 'Uploading...' : 'Save profile photo'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={isRemoveDialogOpen} onOpenChange={setIsRemoveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove profile photo?</DialogTitle>
              <DialogDescription>
                This will clear your current profile photo. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsRemoveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  void handleRemove();
                  setIsRemoveDialogOpen(false);
                }}
                disabled={isSubmitting}
              >
                Remove photo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
