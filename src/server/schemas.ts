import { z } from 'zod';

export const loginSchema = z.object({ password: z.string().min(1).max(512) });

export const locationSchema = z.object({
  floorId: z.enum(['basement', 'ground', 'first']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: z.string().trim().min(1).max(120),
});

export const locationPatchSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export const captureFieldsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(''),
  capturedAt: z.string().datetime({ offset: true }),
  initialYaw: z.coerce.number().min(0).max(359.999).default(0),
  tags: z.string().max(500).default(''),
});
