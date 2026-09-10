export type Member = {
  id: string;
  member_code: string;
  name: string;
  email: string;
  phone: string;
  postcode: string;
  address: string;
  address_detail: string;
  role: "admin" | "member";
  grade?: string;
  status: "active" | "suspended";
  referrer_id: string | null;
  sponsor_id: string | null;
  position: "L" | "R" | null;
  center_id: string | null;
  pv: number;
  bonus_limit: number;
  bonus_paid: number;
  created_at: string;
};
export type Product = {
  id: string;
  name: string;
  description: string;
  pv_price: number;
  active: boolean;
};
export type Purchase = {
  payment_method?: "cash" | "pv";
  product_id?: string | null;
  product_name?: string;
  pv_spent?: number;
  id: string;
  member_id: string;
  kind: "initial" | "repeat";
  cash: number;
  pv: number;
  cap_added: number;
  shipping_status: "pending" | "delivered";
  recipient: string;
  phone: string;
  address: string;
  tracking: string;
  note: string;
  created_at: string;
};
export type Bonus = {
  id: string;
  member_id: string;
  event_key: string;
  kind: string;
  gross: number;
  paid: number;
  expired: number;
  reason: string;
  created_at: string;
};
export type Audit = {
  id: string;
  action: string;
  actor: string;
  detail: string;
  created_at: string;
};
export type Center = { id: string; name: string; owner_id: string };
export type AppData = {
  members: Member[];
  purchases: Purchase[];
  bonuses: Bonus[];
  audits: Audit[];
  centers: Center[];
};
export const terms = {
  initial: { cash: 370000, pv: 300000, cap: 1500000 },
  repeat: { cash: 270000, pv: 200000, cap: 1500000 },
} as const;
export const money = (n: number) => new Intl.NumberFormat("ko-KR").format(n);
export const date = (s: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(s));
export const bonusNames: Record<string, string> = {
  referral: "추천 보너스",
  triangle1: "삼각 1",
  triangle2: "삼각 2",
  triangle3: "삼각 3",
  rollup: "후원 롤업",
  center: "센터 보너스",
  team: "팀장 공동 보너스",
  head: "본부장 공동 보너스",
};
export function allocateBonus(gross: number, limit: number, paid: number) {
  if (![gross, limit, paid].every((n) => Number.isSafeInteger(n) && n >= 0))
    throw new Error("금액은 0 이상의 정수여야 합니다.");
  const actual = Math.min(gross, Math.max(0, limit - paid));
  return { gross, paid: actual, expired: gross - actual };
}
export function rank(
  member: Member,
  members: Member[],
  centers: Center[] = [],
): string {
  if (centers.some((center) => center.owner_id === member.id)) return "센터";
  if (member.grade) return member.grade;
  const agents = (id: string) =>
    members.filter(
      (m) => m.referrer_id === id && m.bonus_limit > 0 && m.status === "active",
    );
  if (agents(member.id).filter((m) => agents(m.id).length >= 5).length >= 3)
    return "본부장";
  return agents(member.id).length >= 5 ? "팀장" : "에이전트";
}
