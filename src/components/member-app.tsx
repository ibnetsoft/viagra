"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronRight,
  Home,
  ShoppingBag,
  Network,
  Leaf,
  LogOut,
  Package,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { bonusNames, date, money } from "@/lib/domain";
import { type MemberData, memberSnapshot } from "@/lib/member-data";
import { logout } from "@/app/actions";
import MemberNotifications from "./member-notifications";
import MemberBank from "./member-bank";
import MemberShop from "./member-shop";
import MemberOrganization from "./member-organization";
export type MemberSection =
  | "home"
  | "bonuses"
  | "orders"
  | "profile"
  | "products"
  | "organization"
  | "notifications";
const nav = [
  { id: "home", href: "/app", label: "홈", icon: Home },
  { id: "products", href: "/app/products", label: "상품", icon: ShoppingBag },
  {
    id: "organization",
    href: "/app/organization",
    label: "조직도",
    icon: Network,
  },
  { id: "bonuses", href: "/app/bonuses", label: "보너스", icon: Wallet },
  { id: "orders", href: "/app/orders", label: "구매·배송", icon: Package },
  { id: "profile", href: "/app/profile", label: "내 정보", icon: UserRound },
] as const;
export default function MemberApp({
  demo,
  initialData,
  section,
}: {
  demo: boolean;
  initialData: MemberData;
  section: MemberSection;
}) {
  const [data, setData] = useState(initialData),
    [filter, setFilter] = useState("all");
  const router = useRouter();
  useEffect(() => {
    setData(initialData);
    if (!demo) return;
    const sync = () => {
      try {
        const saved = localStorage.getItem("vital-partners-demo-v2");
        if (saved) setData(memberSnapshot(JSON.parse(saved), "demo-1"));
      } catch {}
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, [demo, initialData]);
  const { member, purchases, bonuses, centerName } = data;
  const remaining = Math.max(0, member.bonus_limit - member.bonus_paid);
  const percentage = member.bonus_limit
    ? Math.min(100, (member.bonus_paid / member.bonus_limit) * 100)
    : 0;
  const latest = [...purchases].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )[0];
  return (
    <div className="member-stage">
      <div className="member-frame">
        <header className="member-header">
          <Link href="/app" className="member-logo">
            <Leaf size={22} />
            활력<span>PARTNERS</span>
          </Link>
          <MemberNotifications demo={demo} memberId={member.id} />
          <Link
            href="/app/profile"
            className="member-avatar"
            aria-label="내 정보"
          >
            {member.name.slice(0, 1)}
          </Link>
        </header>
        <main className="member-content">
          {demo && (
            <div className="member-demo">회원 앱 미리보기 · 샘플 데이터</div>
          )}
          {section === "notifications" && (
            <MemberNotifications demo={demo} memberId={member.id} inbox />
          )}
          {section === "products" && (
            <MemberShop data={data} demo={demo} onChange={setData} />
          )}
          {section === "organization" && (
            <MemberOrganization demo={demo} memberId={member.id} />
          )}
          {section === "home" && (
            <>
              <div className="member-greeting">
                <p>오늘도 활력 있는 하루</p>
                <h1>
                  {member.name}님,
                  <br />
                  함께 성장해요<span>🌿</span>
                </h1>
                <span className="member-grade">
                  {member.grade ?? "에이전트"} · {member.member_code}
                </span>
              </div>
              <section className="member-wallet">
                <div className="member-wallet-top">
                  <span>나의 보너스</span>
                  <Wallet size={20} />
                </div>
                <h2>
                  {money(member.bonus_paid)}
                  <small>원</small>
                </h2>
                <p>지금까지 지급된 보너스</p>
                <Link href="/app/bonuses">
                  보너스 내역 보기
                  <ArrowUpRight size={17} />
                </Link>
              </section>
              <div className="member-mini-grid">
                <section>
                  <span>보유 PV</span>
                  <strong>
                    {money(member.pv)}
                    <small>PV</small>
                  </strong>
                </section>
                <section>
                  <span>나의 구매</span>
                  <strong>
                    {purchases.length}
                    <small>회</small>
                  </strong>
                </section>
              </div>
              <section className="member-card member-limit">
                <div className="member-section-heading">
                  <h2>더 받을 수 있는 보너스</h2>
                  <ShieldCheck size={18} />
                </div>
                <strong>
                  {money(remaining)}
                  <small>원</small>
                </strong>
                <div
                  className="member-progress"
                  role="progressbar"
                  aria-label="보너스 지급 한도 사용률"
                  aria-valuenow={Math.round(percentage)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${percentage}%` }} />
                </div>
                <div className="member-limit-labels">
                  <span>지급 {money(member.bonus_paid)}원</span>
                  <span>총 한도 {money(member.bonus_limit)}원</span>
                </div>
                <p>
                  구매할 때마다 한도 <b>150만원</b>이 추가돼요.
                </p>
              </section>
              <section className="member-card">
                <div className="member-section-heading">
                  <h2>나의 배송</h2>
                  <Link href="/app/orders">
                    전체 보기
                    <ChevronRight size={14} />
                  </Link>
                </div>
                {latest ? (
                  <Link href="/app/orders" className="member-order-preview">
                    <span className="member-package">
                      <Package />
                    </span>
                    <div>
                      <strong>{latest.product_name ?? "활력단 15개"}</strong>
                      <p>
                        {date(latest.created_at)} 구매 ·{" "}
                        {latest.kind === "initial" ? "첫 구매" : "재구매"}
                      </p>
                    </div>
                    <span className={`member-status ${latest.shipping_status}`}>
                      {latest.shipping_status === "delivered"
                        ? "배송완료"
                        : "미배송"}
                    </span>
                  </Link>
                ) : (
                  <p className="member-empty">
                    첫 구매 후 배송 현황을 확인할 수 있어요.
                  </p>
                )}
              </section>
              <aside className="member-tip">
                <Leaf size={20} />
                <div>
                  <strong>건강한 일상, 함께하는 성장</strong>
                  <p>나의 모든 파트너 활동을 여기에서 확인하세요.</p>
                </div>
              </aside>
            </>
          )}
          {section === "bonuses" && (
            <>
              <div className="member-page-title">
                <p>MY REWARDS</p>
                <h1>나의 보너스</h1>
              </div>
              <section className="member-wallet">
                <div className="member-wallet-top">
                  <span>누적 지급액</span>
                  <Wallet size={20} />
                </div>
                <h2>
                  {money(member.bonus_paid)}
                  <small>원</small>
                </h2>
                <p>남은 한도 {money(remaining)}원</p>
              </section>
              <div className="member-filter">
                <button
                  className={filter === "all" ? "on" : ""}
                  onClick={() => setFilter("all")}
                >
                  전체
                </button>
                <button
                  className={filter === "paid" ? "on" : ""}
                  onClick={() => setFilter("paid")}
                >
                  지급 내역
                </button>
                <button
                  className={filter === "expired" ? "on" : ""}
                  onClick={() => setFilter("expired")}
                >
                  소멸 내역
                </button>
              </div>
              <section className="member-card">
                {bonuses
                  .filter(
                    (b) =>
                      filter === "all" ||
                      (filter === "paid" ? b.paid > 0 : b.expired > 0),
                  )
                  .map((b) => (
                    <div key={b.id} className="member-bonus-row">
                      <div>
                        <strong>{bonusNames[b.kind] ?? b.kind}</strong>
                        <p>
                          {date(b.created_at)} · 발생 {money(b.gross)}원
                        </p>
                        {b.expired > 0 && (
                          <small>
                            소멸 {money(b.expired)}원 · {b.reason}
                          </small>
                        )}
                      </div>
                      <b>+{money(b.paid)}원</b>
                    </div>
                  ))}
                {!bonuses.some(
                  (b) =>
                    filter === "all" ||
                    (filter === "paid" ? b.paid > 0 : b.expired > 0),
                ) && (
                  <p className="member-empty">
                    아직 해당 보너스 내역이 없어요.
                  </p>
                )}
              </section>
              <p className="member-explanation">
                한도를 초과한 보너스는 소멸되며 이월되지 않아요. 재구매 이후
                새로 발생하는 보너스부터 지급돼요.
              </p>
            </>
          )}
          {section === "orders" && (
            <>
              <div className="member-page-title">
                <p>MY ORDERS</p>
                <h1>구매와 배송</h1>
                <span>구매한 상품의 배송 상태를 확인하세요.</span>
              </div>
              {purchases.length === 0 && (
                <section className="member-card">
                  <p className="member-empty">아직 구매 내역이 없어요.</p>
                </section>
              )}
              {[...purchases]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((p) => (
                  <section className="member-card member-order-card" key={p.id}>
                    <div className="member-section-heading">
                      <span>{date(p.created_at)} 구매</span>
                      <span className={`member-status ${p.shipping_status}`}>
                        {p.shipping_status === "delivered"
                          ? "배송완료"
                          : "미배송"}
                      </span>
                    </div>
                    <div className="member-order-preview">
                      <span className="member-package">
                        <Package size={28} />
                      </span>
                      <div>
                        <h2>{p.product_name ?? "활력단 15개"}</h2>
                        <p>
                          {p.kind === "initial" ? "최초 구매" : "재구매"} ·{" "}
                          {p.payment_method === "pv"
                            ? `${money(p.pv_spent ?? 0)} PV 결제`
                            : `${money(p.cash)}원`}
                        </p>
                      </div>
                    </div>
                    <div className="member-order-points">
                      <span>
                        {p.payment_method === "pv"
                          ? `−${money(p.pv_spent ?? 0)}`
                          : `+${money(p.pv)}`}{" "}
                        PV
                      </span>
                      <span>한도 +{money(p.cap_added)}원</span>
                    </div>
                    <div className="member-delivery">
                      <Truck size={16} />
                      <div>
                        <strong>
                          {p.recipient} · {p.phone}
                        </strong>
                        <p>{p.address}</p>
                        {p.tracking && <p>운송장 · {p.tracking}</p>}
                      </div>
                    </div>
                  </section>
                ))}
              <p className="member-explanation">
                상품 메뉴에서 PV로 구매할 수 있어요. PV 충전은 입금 확인 후
                관리자가 처리해요. 배송지 변경은 발송 전에 관리자에게 문의해
                주세요.
              </p>
            </>
          )}
          {section === "profile" && (
            <>
              <div className="member-page-title">
                <p>MY ACCOUNT</p>
                <h1>내 정보</h1>
              </div>
              <section className="member-card member-profile">
                <span className="member-avatar">{member.name.slice(0, 1)}</span>
                <h2>{member.name}</h2>
                <span className="member-grade">
                  {member.grade ?? "에이전트"}
                </span>
                <p>{member.member_code}</p>
              </section>
              <section className="member-card">
                <h2>기본 정보</h2>
                <dl className="member-details">
                  <div>
                    <dt>이메일</dt>
                    <dd>{member.email}</dd>
                  </div>
                  <div>
                    <dt>연락처</dt>
                    <dd>{member.phone}</dd>
                  </div>
                  <div>
                    <dt>소속 센터</dt>
                    <dd>{centerName ?? "미배정"}</dd>
                  </div>
                </dl>
              </section>
              <section className="member-card">
                <h2>나의 배송지</h2>
                <p className="member-address">
                  ({member.postcode}) {member.address}
                  <br />
                  {member.address_detail}
                </p>
                <p className="member-explanation">
                  연락처와 주소 변경은 관리자에게 요청해 주세요.
                </p>
              </section>
              <MemberBank data={data} demo={demo} onChange={setData} />
              <button
                className="member-logout"
                onClick={() =>
                  demo ? router.push("/login") : void logout("member")
                }
              >
                <LogOut size={17} />
                로그아웃
              </button>
            </>
          )}
          <footer className="member-footer">
            VITAL PARTNERS · 함께하는 건강한 일상
          </footer>
        </main>
        <nav className="member-bottom-nav" aria-label="회원 앱 메뉴">
          {nav.map((item) => (
            <Link
              href={item.href}
              key={item.id}
              aria-current={section === item.id ? "page" : undefined}
              className={section === item.id ? "current" : ""}
            >
              <item.icon size={21} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
