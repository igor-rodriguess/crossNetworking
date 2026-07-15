import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("e-mail inválido"),
  senha: z.string().min(1, "senha é obrigatória"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refresh_token: z.string().trim().min(1, "refresh_token é obrigatório"),
});
export type RefreshInput = z.infer<typeof refreshSchema>;
