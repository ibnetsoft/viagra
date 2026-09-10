import type { AppData, Member, Purchase, Bonus } from "./domain";
export type MemberData = {
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
    purchases: data.purchases.filter((p) => p.member_id === id),
    bonuses: data.bonuses.filter((b) => b.member_id === id),
    centerName:
      data.centers.find((c) => c.id === member.center_id)?.name ?? null,
  };
}
