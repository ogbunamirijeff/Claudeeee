import type { UploadTicket } from '@jiko/shared';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { ApiError, authed } from './api';

/** Lets the user pick (or shoot) a photo. Returns null if they cancel. */
export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

export async function pickPhoto(source: 'library' | 'camera'): Promise<PickedPhoto | null> {
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted)
    throw new ApiError({
      statusCode: 0,
      code: 'PERMISSION',
      message: 'Allow photo access in Settings to add photos.',
    });
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, exif: false };
  const r =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.canceled ? undefined : r.assets[0];
  return a ? { uri: a.uri, width: a.width, height: a.height } : null;
}

/**
 * Resizes on the device (max 1600px, JPEG 75%) so a 4 MB camera photo uploads as ~200 KB —
 * seconds instead of minutes on a weak connection — then uploads straight to storage.
 */
export async function uploadPhoto(
  photo: PickedPhoto,
  kind: string,
  jobId?: string,
): Promise<{ fileId: string; uri: string }> {
  const MAX_EDGE = 1600;
  const ctx = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_EDGE) {
    ctx.resize(photo.width >= photo.height ? { width: MAX_EDGE } : { height: MAX_EDGE }); // never upscale
  }
  const rendered = await ctx.renderAsync();
  const small = await rendered.saveAsync({ compress: 0.75, format: SaveFormat.JPEG });
  const size = (await fetch(small.uri).then((r) => r.blob())).size;

  const ticket = await authed<UploadTicket>('/v1/files/uploads', {
    method: 'POST',
    body: JSON.stringify({
      kind,
      mimeType: 'image/jpeg',
      sizeBytes: size,
      ...(jobId ? { jobId } : {}),
    }),
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(ticket.fields)) form.append(k, v);
  if (Platform.OS === 'web') {
    form.append('file', await fetch(small.uri).then((r) => r.blob()), 'photo.jpg');
  } else {
    // React Native's FormData accepts a { uri, name, type } file descriptor.
    form.append('file', {
      uri: small.uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    } as unknown as Blob);
  }
  const up = await fetch(ticket.url, { method: 'POST', body: form });
  if (!up.ok)
    throw new ApiError({
      statusCode: up.status,
      code: 'UPLOAD_FAILED',
      message: 'Photo upload failed. Check your connection and try again.',
    });
  await authed(`/v1/files/${ticket.fileId}/complete`, { method: 'POST' });
  return { fileId: ticket.fileId, uri: small.uri };
}
