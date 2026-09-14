"use client";
import { useState } from "react";
import { type AppData, type Member, money } from "@/lib/domain";

export default function AdminCenters({
  data,
  busy,
  onSave,
  onEditMember,
}: {
  data: AppData;
  busy: boolean;
  onSave: (id: string | null, name: string, owner: string) => Promise<boolean>;
  onEditMember: (member: Member) => void;
}) {
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [query, setQuery] = useState("");
  const [ownerQuery, setOwnerQuery] = useState("");
  const members = data.members.filter((m) => m.role === "member");
  const selectedOwner = members.find(
    (m) => m.id === owner && m.status === "active",
  );
  const ownerMatches = ownerQuery.trim()
    ? members.filter(
        (m) =>
          m.status === "active" &&
          `${m.name} ${m.username ?? ""} ${m.member_code}`
            .toLocaleLowerCase()
            .includes(ownerQuery.trim().toLocaleLowerCase()),
      )
    : [];
  const introducedCenters = (id: string) =>
    data.centers.filter((c) =>
      members.some((m) => m.id === c.owner_id && m.referrer_id === id),
    );
  const center = data.centers.find((c) => c.id === selected) ?? data.centers[0];
  const leader = members.find((m) => m.id === center?.owner_id);
  const referrer = members.find((m) => m.id === leader?.referrer_id);
  const enrolled = members.filter((m) => m.center_id === center?.id);
  const findName = (id: string) =>
    members.find((m) => m.id === id)?.name ?? "미지정";
  const stats = data.centerStats?.find((s) => s.center_id === center?.id);
  const paid = (kind: string) =>
    data.bonuses
      .filter(
        (b) =>
          b.kind === kind &&
          (kind === "center"
            ? b.event_key.endsWith(`:${center?.id}`)
            : b.event_key.includes(`:${center?.id}:`)),
      )
      .reduce((sum, b) => sum + b.paid, 0);
  const unpaid = (data.centerUnpaid ?? [])
    .filter(
      (r) =>
        r.center_id === center?.id ||
        (!("center_id" in r) && r.center_name === center?.name),
    )
    .reduce((sum, r) => sum + r.amount, 0);
  return (
    <>
      <section className="panel padded">
        <h2>{editing ? "센터 정보 수정" : "센터 추가"}</h2>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!selectedOwner) return;
            if (await onSave(editing, name.trim(), owner)) {
              setEditing(null);
              setName("");
              setOwner("");
              setOwnerQuery("");
            }
          }}
        >
          <label>
            센터명
            <input
              required
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 서울센터"
            />
          </label>
          <div className="center-owner-search">
            <label htmlFor="center-owner-query">센터장 검색</label>
            <input
              id="center-owner-query"
              value={ownerQuery}
              autoComplete="off"
              placeholder="회원명 또는 아이디 입력"
              onChange={(e) => {
                setOwnerQuery(e.target.value);
                setOwner("");
              }}
            />
            {selectedOwner ? (
              <p className="notice" role="status">
                선택된 센터장: <strong>{selectedOwner.name}</strong> ·{" "}
                {selectedOwner.username ?? selectedOwner.member_code}
              </p>
            ) : ownerQuery.trim() ? (
              <div
                className="center-owner-results"
                aria-label="센터장 검색 결과"
              >
                {ownerMatches.slice(0, 20).map((m) => (
                  <button
                    className="button"
                    type="button"
                    key={m.id}
                    onClick={() => {
                      setOwner(m.id);
                      setOwnerQuery(m.name);
                    }}
                  >
                    {m.name} · {m.username ?? m.member_code}
                    <small>{m.member_code}</small>
                  </button>
                ))}
                {!ownerMatches.length && (
                  <p role="status">일치하는 정상 회원이 없습니다.</p>
                )}
                {ownerMatches.length > 20 && (
                  <p>상위 20명 표시 · 검색어를 더 입력해 주세요.</p>
                )}
              </div>
            ) : (
              <p className="muted small">검색 결과에서 회원을 선택하세요.</p>
            )}
          </div>
          <button className="button primary" disabled={busy || !selectedOwner}>
            {editing ? "센터 정보 저장" : "센터 추가"}
          </button>
          {editing && (
            <button
              type="button"
              className="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setOwner("");
                setOwnerQuery("");
              }}
            >
              취소
            </button>
          )}
        </form>
        <p className="muted small">
          센터장은 센터 등급으로 표시됩니다. 센터장 변경은 이후 구매부터
          적용되며, 기존 매출과 보너스 기록은 유지됩니다.
        </p>
      </section>
      <section className="panel">
        <div className="table-toolbar">
          <h2>센터 목록 · {data.centers.length}개</h2>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>센터명</th>
                <th>센터장</th>
                <th>센터장 추천인</th>
                <th>직접 소개한 센터 / 센터장</th>
                <th>소속 회원</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {data.centers.map((c) => {
                const m = members.find((m) => m.id === c.owner_id);
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="button"
                        onClick={() => {
                          setSelected(c.id);
                          setQuery("");
                        }}
                      >
                        {c.name}
                      </button>
                    </td>
                    <td>{findName(c.owner_id)}</td>
                    <td>
                      {m?.referrer_id
                        ? findName(m.referrer_id)
                        : "없음 · 2% 미지급 누적"}
                    </td>
                    <td>
                      {introducedCenters(c.owner_id).length
                        ? introducedCenters(c.owner_id).map((child) => (
                            <div key={child.id}>
                              <button
                                type="button"
                                className="button"
                                onClick={() => {
                                  setSelected(child.id);
                                  setQuery("");
                                }}
                              >
                                {child.name}
                              </button>
                              <small className="table-sub">
                                {findName(child.owner_id)} ·{" "}
                                {members.find((m) => m.id === child.owner_id)
                                  ?.username ??
                                  members.find((m) => m.id === child.owner_id)
                                    ?.member_code}
                              </small>
                            </div>
                          ))
                        : "없음"}
                    </td>
                    <td>
                      {members.filter((m) => m.center_id === c.id).length}명
                    </td>
                    <td>
                      <button
                        className="button"
                        onClick={() => {
                          setEditing(c.id);
                          setName(c.name);
                          setOwner(c.owner_id);
                          setOwnerQuery(findName(c.owner_id));
                        }}
                      >
                        센터 수정
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.centers.length && (
          <p className="muted" style={{ padding: 24 }}>
            등록된 센터가 없습니다. 센터명과 센터장을 선택해 추가하세요.
          </p>
        )}
      </section>
      {center && (
        <>
          <section className="panel padded">
            <h2>{center.name} · 운영 현황</h2>
            <p>
              센터장 {leader?.name ?? "미지정"} · 센터소개 수령인{" "}
              {referrer?.name ?? "없음 (센터장추천미지급 누적)"}
            </p>
            <p className="muted small">
              직접 소개한 센터는 이 센터장이 직접 추천한 회원이 센터장으로
              지정된 센터입니다. 현재 추천 관계를 기준으로 표시합니다.
            </p>
            <dl className="rules">
              <div>
                <dt>오늘 구매 매출</dt>
                <dd>{money(stats?.today_pv ?? 0)} PV</dd>
              </div>
              <div>
                <dt>누적 구매 매출</dt>
                <dd>{money(stats?.sales_pv ?? 0)} PV</dd>
              </div>
              <div>
                <dt>센터 보너스 지급액 · 3%</dt>
                <dd>{money(paid("center"))}원</dd>
              </div>
              <div>
                <dt>센터소개 보너스 지급액 · 2%</dt>
                <dd>{money(paid("center_referral"))}원</dd>
              </div>
              <div>
                <dt>센터장추천미지급 누적</dt>
                <dd>{money(unpaid)}원</dd>
              </div>
            </dl>
            <p className="muted small">
              매출은 2026년 9월 14일 새 기준 적용 이후 구매 당시 소속으로
              집계합니다. 오늘 매출은 한국 시간 기준이며, 보너스는 다음 날 00:01
              정산됩니다. 두 보너스 모두 150만원 한도에서 제외됩니다.
            </p>
          </section>
          <section className="panel">
            <div className="table-toolbar">
              <h2>소속 회원 · {enrolled.length}명</h2>
              <label>
                회원 배정 / 변경
                <select
                  aria-label="센터 소속 변경 회원"
                  value=""
                  onChange={(e) => {
                    const m = members.find((m) => m.id === e.target.value);
                    if (m) onEditMember(m);
                  }}
                >
                  <option value="">회원 선택 후 소속 센터 수정</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} · {m.member_code}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-toolbar">
              <input
                aria-label="센터 소속 회원 검색"
                placeholder="이름, 아이디, 회원번호 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>회원</th>
                    <th>아이디</th>
                    <th>연락처</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolled
                    .filter((m) =>
                      `${m.name} ${m.username ?? ""} ${m.member_code}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((m) => (
                      <tr key={m.id}>
                        <td>
                          {m.name}
                          <small className="table-sub">{m.member_code}</small>
                        </td>
                        <td>{m.username ?? "-"}</td>
                        <td>{m.phone}</td>
                        <td>
                          <button
                            className="button"
                            onClick={() => onEditMember(m)}
                          >
                            회원 정보 수정
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {!enrolled.length && (
              <p className="muted" style={{ padding: 24 }}>
                소속 회원이 없습니다. 위에서 회원을 선택해 소속 센터를
                배정하세요.
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
