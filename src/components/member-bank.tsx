"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import BankFields from "./bank-fields";
import { saveMyBank } from "@/app/actions";
import { bankFields } from "@/lib/bank-details";
import { type MemberData, memberSnapshot } from "@/lib/member-data";
import { seedDemo } from "@/lib/demo";
export default function MemberBank({
  data,
  demo,
  onChange,
}: {
  data: MemberData;
  demo: boolean;
  onChange: (d: MemberData) => void;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  const m = data.member;
  return (
    <section className="member-card">
      <div className="member-section-heading">
        <h2>계좌 정보</h2>
        <button
          className="text-button"
          onClick={() => {
            setEditing(!editing);
            setMessage("");
          }}
          disabled={busy}
        >
          {editing ? "취소" : m.bank_name ? "수정" : "계좌 등록"}
        </button>
      </div>
      {editing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const f = new FormData(e.currentTarget);
            try {
              const parsed = bankFields.safeParse(Object.fromEntries(f));
              if (!parsed.success)
                throw new Error(
                  "은행, 계좌번호(숫자 8~20자리), 예금주를 확인하세요.",
                );
              if (demo) {
                const stored = localStorage.getItem("vital-partners-demo-v2");
                const updated = stored ? JSON.parse(stored) : seedDemo();
                Object.assign(
                  updated.members.find((v: { id: string }) => v.id === m.id),
                  parsed.data,
                );
                localStorage.setItem(
                  "vital-partners-demo-v2",
                  JSON.stringify(updated),
                );
                onChange(memberSnapshot(updated, m.id));
              } else {
                const r = await saveMyBank(f);
                if (r.error) throw new Error(r.error);
                router.refresh();
              }
              setEditing(false);
              setMessage("계좌 정보가 저장됐습니다.");
            } catch (e) {
              setMessage(
                e instanceof Error ? e.message : "저장하지 못했습니다.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <BankFields member={m} />
          <button className="member-primary" disabled={busy}>
            {busy ? "저장 중…" : "계좌 정보 저장"}
          </button>
        </form>
      ) : m.bank_name ? (
        <dl className="member-details">
          <div>
            <dt>은행</dt>
            <dd>{m.bank_name}</dd>
          </div>
          <div>
            <dt>계좌번호</dt>
            <dd>{m.account_number}</dd>
          </div>
          <div>
            <dt>예금주</dt>
            <dd>{m.account_holder}</dd>
          </div>
        </dl>
      ) : (
        <p className="member-empty">등록된 계좌가 없습니다.</p>
      )}
      {message && (
        <p role="status" className="member-explanation">
          {message}
        </p>
      )}
    </section>
  );
}
