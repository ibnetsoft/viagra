import type { AppData, Member, Purchase, Bonus, Product } from "./domain";
export type MemberData = {
  products?: Product[];
  purchaseCount?: number;
  member: Member;
  purchases: Purchase[];
  bonuses: Bonus[];
  centerName: string | null;
};
export function memberSnapshot(data: AppData, id: string): MemberData {
  const member = data.members.find((m) => m.id === id);
  if (!member) throw new Error("회원 정보를 찾을 수 없습니다.");
  return {
    member,
    products: demoProducts,
    purchases: data.purchases.filter((p) => p.member_id === id),
    bonuses: data.bonuses.filter((b) => b.member_id === id),
    centerName:
      data.centers.find((c) => c.id === member.center_id)?.name ?? null,
  };
}

export const demoProducts: Product[] = [
  {
    id: "caa14000-0000-4000-8000-000000000001",
    name: "활력단 15개",
    description: "활력단 15개 구성 · 등록된 배송지로 배송됩니다.",
    pv_price: 300000,
    active: true,
  },
];
export type OrganizationNode = {
  id: string;
  name: string;
  member_code: string;
  position: "L" | "R" | null;
  has_children?: boolean;
};
export type OrganizationData = {
  root: OrganizationNode;
  children: OrganizationNode[];
  total: number;
};
export function demoOrganization(
  data: AppData,
  me: string,
  mode: "referral" | "sponsor",
  root = me,
  offset = 0,
): OrganizationData {
  data = { ...data, members: data.members.filter((m) => m.role === "member") };
  if (
    !data.members.some((m) => m.id === me) ||
    !data.members.some((m) => m.id === root)
  )
    throw new Error("회원만 조직도를 조회할 수 있습니다.");
  const key = mode === "referral" ? "referrer_id" : "sponsor_id";
  const visited = new Set<string>();
  let ancestor: string | null = root;
  while (ancestor && ancestor !== me && !visited.has(ancestor)) {
    visited.add(ancestor);
    ancestor = data.members.find((m) => m.id === ancestor)?.[key] ?? null;
  }
  if (ancestor !== me) throw new Error("본인 산하만 조회할 수 있습니다.");
  const node = (m: Member): OrganizationNode => ({
    id: m.id,
    name: m.name,
    member_code: m.member_code,
    position: mode === "sponsor" ? m.position : null,
    has_children: data.members.some((c) => c[key] === m.id),
  });
  const children = data.members
    .filter((m) => m[key] === root)
    .sort((a, b) => a.member_code.localeCompare(b.member_code));
  return {
    root: node(data.members.find((m) => m.id === root)!),
    children: children.slice(offset, offset + 50).map(node),
    total: children.length,
  };
}
