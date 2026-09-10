import { z } from "zod";
export const domesticBanks = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "KDB산업은행",
  "Sh수협은행",
  "SC제일은행",
  "한국씨티은행",
  "카카오뱅크",
  "케이뱅크",
  "토스뱅크",
  "iM뱅크",
  "부산은행",
  "경남은행",
  "광주은행",
  "전북은행",
  "제주은행",
  "농·축협",
  "신협",
  "새마을금고",
  "산림조합",
  "우체국",
  "저축은행",
] as const;
export const bankFields = z.object({
  bank_name: z.enum(domesticBanks),
  account_number: z
    .string()
    .trim()
    .regex(/^[0-9\- ]+$/)
    .transform((v) => v.replace(/[- ]/g, ""))
    .pipe(z.string().regex(/^[0-9]{8,20}$/)),
  account_holder: z.string().trim().min(1).max(80),
});
