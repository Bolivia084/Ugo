import { z } from 'zod';

export const email = z.email().max(254).transform((v) => v.trim().toLowerCase());
/** At least 10 characters with a letter and a number. Long passphrases are welcome. */
export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letters and at least one number');
const name = z.string().trim().min(1).max(80);
const dateOnly = z.iso.date();

export const registerSchema = z
  .object({
    role: z.enum(['LEARNER', 'PARENT']),
    email,
    password,
    fullName: name,
    displayName: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N} _.-]+$/u, 'Letters, numbers, spaces, dots, dashes and underscores only'),
    dateOfBirth: dateOnly,
    /** Required when a learner under 18 signs up alone. */
    parentEmail: email.optional(),
    acceptedTermsVersion: z.string().min(1).max(20),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();
export const mfaVerifySchema = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) }).strict();
export const verifyEmailSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const resetRequestSchema = z.object({ email }).strict();
export const resetConfirmSchema = z.object({ email, code: z.string().regex(/^\d{6}$/), newPassword: password }).strict();
export const mfaMethodSchema = z.object({ method: z.enum(['EMAIL_OTP', 'SMS_OTP', 'TOTP']), phone: z.string().regex(/^\+\d{8,15}$/).optional() }).strict();
export const totpConfirmSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const deleteAccountSchema = z.object({ email, password: z.string().min(1).max(200) }).strict();
export const confirmPasswordSchema = z.object({ password: z.string().min(1).max(200) }).strict();
