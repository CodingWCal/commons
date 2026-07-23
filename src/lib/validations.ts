import { z } from "zod";

export const signupSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(40, "Name is too long"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(200),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200, "Password is too long"),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  password: z.string().min(1, "Password is required").max(200),
});

export const messageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Message can't be empty")
    .max(4000, "Message is too long (max 4000 characters)"),
  nonce: z.string().max(100).optional(),
});

export const channelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Channel name must be at least 2 characters")
    .max(40, "Channel name is too long"),
  description: z.string().trim().max(200, "Description is too long").optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type MessageInput = z.infer<typeof messageSchema>;
export type ChannelInput = z.infer<typeof channelSchema>;
