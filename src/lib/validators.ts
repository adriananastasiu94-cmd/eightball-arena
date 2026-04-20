import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(64)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(64)
});

export const shotSchema = z.object({
  angle: z.number().finite(),
  power: z.number().min(0.05).max(1),
  spin: z
    .object({
      x: z.number().min(-1).max(1),
      y: z.number().min(-1).max(1)
    })
    .optional()
});