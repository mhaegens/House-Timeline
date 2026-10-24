import { z } from 'zod';

export const loginSchema = z.object({ password: z.string().min(1).max(512) });

export const locationSchema = z.object({
  floorId: z.enum(['basement', 'ground', 'first']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  label: z.string().trim().min(1).max(120),
});

export const locationPatchSchema = locationSchema.partial().strict().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'At least one location field is required.' },
);

export const placementSchema = locationSchema.extend({ scope: z.enum(['capture', 'location']) }).strict();

export const captureFieldsSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(''),
  capturedAt: z.string().datetime({ offset: true }),
  initialYaw: z.coerce.number().min(0).max(359.999).default(0),
  tags: z.string().max(500).default(''),
});

export const capturePatchSchema = z.object({
  locationId: z.string().uuid(),
}).partial().extend({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  initialYaw: z.number().min(0).max(359.999).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
}).strict().refine((input) => Object.keys(input).length > 0);

