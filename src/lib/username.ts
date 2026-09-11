import { z } from "zod";
export const usernameField = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_]{3,19}$/);
