"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestMyWithdrawal } from "@/app/actions";
import { money, date } from "@/lib/domain";
import type { MemberData } from "@/lib/member-data";

const statusText = { pending: "승인대기", approved: "승인완료", rejected: "반려" } as const;

export default function MemberWithdrawals({ data }: { data: MemberData }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  const paid = data.bonuses.reduce((sum, bonus) => sum + bonus.paid, 0);
  const reserved = data.withdrawals
    .filter((row) => row.status === "pending" || row.status === "approved")
    .reduce((sum, row) => sum + row.amount, 0);
  const available = Math.max(0, paid - reserved);
  const hasBank = Boolean(data.member.bank_name && data.member.account_number && data.member.account_holder);
  return (
    <section className="member-card">
      <div className="member-section-heading">
        <h2>출금 신청</h2>
        <span>{money(available)}원 가능</span>
      </div>
      <p className="member-explanation">
        지급된 보너스에서 승인대기/승인완료 출금액을 제외한 금액만 신청할 수 있어요.
      </p>
      <form
        className="member-edit-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            const result = await requestMyWithdrawal(new FormData(event.currentTarget));
            if (result.error) throw new Error(result.error);
            event.currentTarget.reset();
            setMessage("출금 신청이 접수됐습니다.");
            router.refresh();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "신청하지 못했습니다.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          출금 금액
          <input name="amount" type="number" min={1} max={available || undefined} step={1} placeholder="출금할 금액" disabled={!hasBank || available <= 0 || busy} required />
        </label>
        <label>
          메모 (선택)
          <input name="note" maxLength={500} placeholder="관리자에게 전달할 메모" disabled={!hasBank || available <= 0 || busy} />
        </label>
        <button className="member-primary" disabled={!hasBank || available <= 0 || busy}>
          {busy ? "신청 중…" : "출금 신청"}
        </button>
      </form>
      {!hasBank && <p className="member-empty">내 정보에서 출금 계좌를 먼저 등록해 주세요.</p>}
      {message && <p role="status" className="member-explanation">{message}</p>}
      <div className="member-withdrawal-list">
        {data.withdrawals.map((row) => (
          <div key={row.id} className="member-bonus-row">
            <div>
              <strong>{statusText[row.status]}</strong>
              <p>{date(row.created_at)} · {row.bank_name} {row.account_number}</p>
              {(row.note || row.admin_note) && <small>{row.admin_note || row.note}</small>}
            </div>
            <b>{money(row.amount)}원</b>
          </div>
        ))}
        {!data.withdrawals.length && <p className="member-empty">아직 출금 신청 내역이 없어요.</p>}
      </div>
    </section>
  );
}
