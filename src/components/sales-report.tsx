"use client";
import { useState } from "react";
import { type Purchase, type Topup, money, date } from "@/lib/domain";
const localDay = (s: string) =>
  new Date(s).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
export default function SalesReport({
  purchases,
  topups,
}: {
  purchases: Purchase[];
  topups: Topup[];
}) {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const invalid = Boolean(from && to && from > to);
  const rows = invalid
    ? []
    : purchases.filter(
        (p) =>
          (!from || localDay(p.created_at) >= from) &&
          (!to || localDay(p.created_at) <= to),
      );
  const deposits = invalid
    ? []
    : topups.filter(
        (p) =>
          (!from || localDay(p.created_at) >= from) &&
          (!to || localDay(p.created_at) <= to),
      );
  const initial = deposits.filter((p) => p.kind === "initial"),
    repeat = deposits.filter((p) => p.kind === "repeat");
  const sum = (list: Topup[]) => list.reduce((total, p) => total + p.cash, 0);
  return (
    <>
      <section className="panel padded">
        <div className="inline-form">
          <label>
            시작일
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            종료일
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            전체 기간
          </button>
        </div>
        {invalid && (
          <p role="alert" className="notice">
            종료일은 시작일 이후로 선택하세요.
          </p>
        )}
      </section>
      <div className="stat-grid three">
        {[
          ["총 충전 입금액", money(sum(deposits)), `${deposits.length}건 충전`],
          ["최초 충전 입금액", money(sum(initial)), `${initial.length}건`],
          ["추가 충전 입금액", money(sum(repeat)), `${repeat.length}건`],
        ].map(([label, value, note]) => (
          <section className="stat-card" key={label}>
            <div className="stat-top">{label}</div>
            <div className="stat-value">
              {value}
              <small>원</small>
            </div>
            <p>{note}</p>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>기간별 상품 구매</h2>
          <span className="muted small">
            한국 시간 · 현금 매출과 PV 사용 구분
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>승인일</th>
                <th>회원</th>
                <th>구매 구분</th>
                <th>결제 방식</th>
                <th>PV 충전 / 사용</th>
                <th>배송</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{date(p.created_at)}</td>
                  <td>{p.recipient}</td>
                  <td>
                    {p.payment_method === "pv"
                      ? "PV 구매"
                      : p.kind === "initial"
                        ? "최초 구매"
                        : "재구매"}
                  </td>
                  <td>PV 결제</td>
                  <td>
                    {p.payment_method === "pv"
                      ? `−${money(p.pv_spent ?? 0)}`
                      : money(p.pv)}{" "}
                    PV
                  </td>
                  <td>
                    {p.shipping_status === "delivered" ? "배송완료" : "미배송"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">선택한 기간의 구매가 없습니다.</div>
        )}
      </section>
    </>
  );
}
