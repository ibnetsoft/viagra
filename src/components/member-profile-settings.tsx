"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveMyAddress, saveMyProfile } from "@/app/actions";
import { type MemberData, memberSnapshot } from "@/lib/member-data";
import { seedDemo } from "@/lib/demo";

export function MemberBasicInfo({
  data,
  demo,
  centerName,
  onChange,
}: {
  data: MemberData;
  demo: boolean;
  centerName: string | null;
  onChange: (d: MemberData) => void;
}) {
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  const member = data.member;
  return (
    <section className="member-card">
      <div className="member-section-heading">
        <h2>기본 정보</h2>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setEditing(!editing);
            setMessage("");
          }}
        >
          {editing ? "취소" : "기본정보 변경"}
        </button>
      </div>
      <dl className="member-details">
        <div>
          <dt>아이디</dt>
          <dd>{member.username ?? member.member_code.toLowerCase()}</dd>
        </div>
        <div>
          <dt>소속 센터</dt>
          <dd>{centerName ?? "미배정"}</dd>
        </div>
      </dl>
      {editing ? (
        <form
          className="member-edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            const form = new FormData(event.currentTarget);
            try {
              if (demo) {
                const stored = localStorage.getItem("vital-partners-demo-v2");
                const updated = stored ? JSON.parse(stored) : seedDemo();
                const target = updated.members.find((m: { id: string }) => m.id === member.id);
                Object.assign(target, {
                  email: String(form.get("email") ?? ""),
                  phone: String(form.get("phone") ?? ""),
                });
                localStorage.setItem("vital-partners-demo-v2", JSON.stringify(updated));
                onChange(memberSnapshot(updated, member.id));
              } else {
                const result = await saveMyProfile(form);
                if (result.error) throw new Error(result.error);
                router.refresh();
              }
              setEditing(false);
              setMessage("기본 정보가 저장됐습니다.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            이메일
            <input name="email" type="email" defaultValue={member.email} required />
          </label>
          <label>
            전화번호
            <input name="phone" defaultValue={member.phone} required pattern="[0-9+\- ]{9,20}" />
          </label>
          <label>
            새 비밀번호
            <input name="password" type="password" minLength={8} maxLength={128} placeholder="변경할 때만 입력" />
          </label>
          <button className="member-primary" disabled={busy}>{busy ? "저장 중…" : "기본 정보 저장"}</button>
        </form>
      ) : (
        <dl className="member-details">
          <div>
            <dt>이메일</dt>
            <dd>{member.email}</dd>
          </div>
          <div>
            <dt>전화번호</dt>
            <dd>{member.phone}</dd>
          </div>
        </dl>
      )}
      {message && <p role="status" className="member-explanation">{message}</p>}
    </section>
  );
}

export function MemberAddress({
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
  const member = data.member;
  const hasAddress = Boolean(member.postcode || member.address || member.address_detail);
  return (
    <section className="member-card">
      <div className="member-section-heading">
        <h2>나의 배송지</h2>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setEditing(!editing);
            setMessage("");
          }}
        >
          {editing ? "취소" : hasAddress ? "수정" : "배송지 등록"}
        </button>
      </div>
      {editing ? (
        <form
          className="member-edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            const form = new FormData(event.currentTarget);
            try {
              if (demo) {
                const stored = localStorage.getItem("vital-partners-demo-v2");
                const updated = stored ? JSON.parse(stored) : seedDemo();
                const target = updated.members.find((m: { id: string }) => m.id === member.id);
                Object.assign(target, {
                  postcode: String(form.get("postcode") ?? ""),
                  address: String(form.get("address") ?? ""),
                  address_detail: String(form.get("address_detail") ?? ""),
                });
                localStorage.setItem("vital-partners-demo-v2", JSON.stringify(updated));
                onChange(memberSnapshot(updated, member.id));
              } else {
                const result = await saveMyAddress(form);
                if (result.error) throw new Error(result.error);
                router.refresh();
              }
              setEditing(false);
              setMessage("배송지가 저장됐습니다.");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "저장하지 못했습니다.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            우편번호
            <input name="postcode" defaultValue={member.postcode} pattern="[0-9]{5}" maxLength={5} placeholder="5자리 우편번호" />
          </label>
          <label>
            기본 주소
            <input name="address" defaultValue={member.address} maxLength={200} placeholder="도로명 및 건물번호" />
          </label>
          <label>
            상세 주소
            <input name="address_detail" defaultValue={member.address_detail} maxLength={200} placeholder="동·호수 등" />
          </label>
          <button className="member-primary" disabled={busy}>{busy ? "저장 중…" : "배송지 저장"}</button>
        </form>
      ) : hasAddress ? (
        <p className="member-address">
          ({member.postcode}) {member.address}
          <br />
          {member.address_detail}
        </p>
      ) : (
        <p className="member-empty">등록된 배송지가 없습니다.</p>
      )}
      {message && <p role="status" className="member-explanation">{message}</p>}
    </section>
  );
}
