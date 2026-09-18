import type { AppData, Member, Purchase, Bonus, Product, Withdrawal } from "./domain";
export type MemberData = {
  totalPaid?: number;
  products?: Product[];
  purchaseCount?: number;
  member: Member;
  purchases: Purchase[];
  bonuses: Bonus[];
  withdrawals: Withdrawal[];
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
    withdrawals: (data.withdrawals ?? []).filter((w) => w.member_id === id),
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
    repeat_pv_price: 200000,
    active: true,
  },
];
export type OrganizationNode = {
  id: string;
  name: string;
  member_code: string;
  username?: string;
  phone?: string;
  created_at?: string;
  sales_pv?: number;
  parent_id?: string | null;
  depth?: number;
  position: "L" | "R" | null;
  has_children?: boolean;
  children?: OrganizationNode[];
};
export type OrganizationData = {
  root: OrganizationNode;
  children: OrganizationNode[];
  nodes?: OrganizationNode[];
  total: number;
};
export function demoOrganization(
  data: AppData,
  me: string,
  mode: "referral" | "sponsor",
  root = me,
  offset = 0,
  depthLimit = 1,
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
  const node = (m: Member, depth = 0, parent: string | null = null): OrganizationNode => {
    const direct = data.members
      .filter((c) => c[key] === m.id)
      .sort((a, b) =>
        mode === "sponsor"
          ? `${a.position ?? ""}${a.member_code}`.localeCompare(`${b.position ?? ""}${b.member_code}`)
          : a.member_code.localeCompare(b.member_code),
      );
    const includeChildren = depthLimit === 0 || depth < depthLimit;
    return {
      id: m.id,
      name: m.name,
      member_code: m.member_code,
      username: m.username,
      phone: m.phone,
      created_at: m.created_at,
      sales_pv: data.purchases
        .filter((p) => p.member_id === m.id && p.payment_method === "pv")
        .reduce((sum, p) => sum + p.pv, 0),
      parent_id: parent,
      depth,
      position: mode === "sponsor" ? m.position : null,
      has_children: direct.length > 0,
      children: includeChildren ? direct.map((c) => node(c, depth + 1, m.id)) : [],
    };
  };
  const rootMember = data.members.find((m) => m.id === root)!;
  const rootNode = node(rootMember);
  return {
    root: rootNode,
    children: rootNode.children ?? [],
    total: countDescendants(rootNode),
  };
}

function countDescendants(node: OrganizationNode): number {
  return (node.children ?? []).reduce(
    (sum, child) => sum + 1 + countDescendants(child),
    0,
  );
}
