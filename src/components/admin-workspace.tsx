"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  CreditCard,
  GitBranch,
  LayoutDashboard,
  Leaf,
  LogOut,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { mutate, logout } from "@/app/actions";
import {
  type AppData,
  type Member,
  type Purchase,
  bonusNames,
  date,
  money,
  rank,
  terms,
} from "@/lib/domain";
import { demoCredit, seedDemo } from "@/lib/demo";
import BankFields from "./bank-fields";
import AdminAnnouncements from "./admin-announcements";
import SalesReport from "./sales-report";

type Tab =
  | "overview"
  | "sales"
  | "members"
  | "credit"
  | "shipping"
  | "organization"
  | "bonuses"
  | "settings"
  | "announcements";
const tabs = [
  { id: "announcements", label: "공지 관리", icon: CircleHelp },
  { id: "overview", label: "대시보드", icon: LayoutDashboard },
  { id: "sales", label: "매출 관리", icon: CreditCard },
  { id: "members", label: "회원 관리", icon: Users },
  { id: "credit", label: "PV 충전", icon: Wallet },
  { id: "shipping", label: "배송 관리", icon: Truck },
  { id: "organization", label: "조직도", icon: GitBranch },
  { id: "bonuses", label: "보너스 내역", icon: CreditCard },
  { id: "settings", label: "운영 설정", icon: Settings2 },
] as const;
const titles: Record<Tab, [string, string]> = {
  announcements: [
    "공지 관리",
    "회원에게 공지를 보내고 수신과 읽음 현황을 확인하세요.",
  ],
  sales: [
    "매출 관리",
    "구매 승인일을 기준으로 기간별 매출과 구매 현황을 확인하세요.",
  ],
  overview: [
    "운영 현황을 한눈에",
    "오늘의 회원 활동과 처리할 업무를 확인하세요.",
  ],
  members: ["회원 관리", "회원 정보와 추천·후원 관계를 관리하세요."],
  credit: ["PV 충전", "입금을 확인하고 회원의 보유 PV를 충전하세요."],
  shipping: ["배송 관리", "구매 당시의 배송지와 상품 발송 상태를 확인하세요."],
  organization: [
    "파트너 조직도",
    "추천 관계와 좌·우 후원 배치를 각각 확인하세요.",
  ],
  bonuses: [
    "보너스 내역",
    "발생액부터 지급액과 소멸액까지 투명하게 확인하세요.",
  ],
  settings: [
    "운영 설정",
    "보상 기준, 센터, 일일 정산과 작업 기록을 관리하세요.",
  ],
};
const demoStorage = "vital-partners-demo-v2";

export default function AdminWorkspace({
  demo,
  initialData,
  userId,
}: {
  demo: boolean;
  initialData: AppData | null;
  userId: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<AppData>(() => initialData ?? seedDemo());
  const [tab, setTab] = useState<Tab>("overview"),
    [search, setSearch] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false);
  const [creditId, setCreditId] = useState<string | null>(null),
    [edit, setEdit] = useState<Member | null>(null),
    [shipping, setShipping] = useState<Purchase | null>(null);
  const [filter, setFilter] = useState("all"),
    [orgMode, setOrgMode] = useState<"sponsor" | "referral">("sponsor");
  const [orgRoot, setOrgRoot] = useState(userId),
    [page, setPage] = useState(1);
  const requestId = useRef("");
  const [serviceMemberId, setServiceMemberId] = useState<string | null>(null);
  useEffect(() => {
    if (initialData) setData(initialData);
  }, [initialData]);
  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem(demoStorage);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (
            Array.isArray(parsed.members) &&
            Array.isArray(parsed.purchases) &&
            Array.isArray(parsed.bonuses) &&
            Array.isArray(parsed.audits) &&
            Array.isArray(parsed.centers)
          )
            setData(parsed);
        }
      } catch {}
    }
  }, [demo]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const me = data.members.find((m) => m.id === userId) ?? data.members[0];
  const member = (id: string | null) => data.members.find((m) => m.id === id);
  const selectTab = (t: Tab) => {
    setTab(t);
    setSearch("");
    setFilter("all");
    setPage(1);
  };
  const persist = (next: AppData) => {
    if (demo) localStorage.setItem(demoStorage, JSON.stringify(next));
    setData(next);
  };
  async function perform(
    action: string,
    payload: Record<string, unknown>,
    apply: () => AppData,
  ) {
    if (busy) return false;
    setBusy(true);
    try {
      if (demo) {
        persist(apply());
      } else {
        const result = await mutate(action, payload);
        if (result.error) throw new Error(result.error);
        router.refresh();
      }
      setToast("저장되었습니다.");
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const openCredit = (id: string) => {
    requestId.current = crypto.randomUUID();
    setCreditId(id);
  };
  const filtered = data.members.filter(
    (m) =>
      `${m.name} ${m.member_code} ${m.phone}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter !== "suspended" || m.status === "suspended") &&
      (filter !== "pending" || m.bonus_limit === 0),
  );
  const pending = data.purchases.filter((p) => p.shipping_status === "pending");
  const purchased = data.members.filter((m) => m.bonus_limit > 0).length;
  const sales = (data.topups ?? []).reduce((a, p) => a + p.cash, 0),
    paid = data.bonuses.reduce((a, b) => a + b.paid, 0);
  const creditMember = member(creditId);
  const serviceMember = member(serviceMemberId);
  const serviceOrders = data.purchases
    .filter((p) => p.member_id === serviceMemberId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const creditKind = (data.topups ?? []).some((p) => p.member_id === creditId)
    ? "repeat"
    : "initial";
  const creditTerms = terms[creditKind];
  const allBonuses = data.bonuses.filter(
    (b) => filter === "all" || b.kind === filter,
  );
  const shipments = data.purchases.filter(
    (p) =>
      (filter === "all" || p.shipping_status === filter) &&
      `${p.recipient} ${member(p.member_id)?.member_code ?? ""}`.includes(
        search,
      ),
  );
  function demoAudit(next: AppData, action: string, detail: string) {
    next.audits.unshift({
      id: crypto.randomUUID(),
      action,
      actor: "데모 관리자",
      detail,
      created_at: new Date().toISOString(),
    });
    return next;
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/admin" className="brand">
          <span className="brand-symbol">
            <Leaf size={23} />
          </span>
          <span>
            활력 파트너스<small>VITAL PARTNERS</small>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="status-dot" />
          관리자 운영 사이트
          <ShieldCheck size={14} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? "active" : ""}`}
              onClick={() => selectTab(t.id)}
            >
              <t.icon size={19} />
              <span>{t.label}</span>
              {t.id === "shipping" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <CircleHelp size={19} />
            <strong>함께, 더 건강한 성장</strong>
            <p>
              파트너의 모든 활동을
              <br />
              한곳에서 관리하세요.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">{me?.name.slice(0, 1)}</span>
            <div>
              <strong>{me?.name}</strong>
              <small>{"Administrator"}</small>
            </div>
            <button
              aria-label="로그아웃"
              onClick={() => {
                if (demo) router.push("/admin/login");
                else void logout("admin");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            워크스페이스 <ChevronRight size={14} />
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="connection">
              <span className="status-dot" />
              {demo ? "샘플 데이터" : "서비스 연결됨"}
            </span>
            <span className="top-avatar">{me?.name.slice(0, 1)}</span>
          </div>
        </header>
        <main className="content">
          {demo && (
            <div className="demo-banner">
              <span>
                <ShieldCheck size={15} /> 미리보기 모드 · 샘플 데이터로 충전과
                배송 처리를 체험할 수 있습니다.
              </span>
              <button
                onClick={() => {
                  persist(seedDemo());
                  setToast("샘플 데이터를 초기화했습니다.");
                }}
              >
                초기화
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {tab === "overview"
                  ? "YOUR BUSINESS, AT A GLANCE"
                  : "VITAL PARTNERS WORKSPACE"}
              </span>
              <h1>{titles[tab][0]}</h1>
              <p>{titles[tab][1]}</p>
            </div>
            {
              <button
                className="button primary"
                onClick={() => openCredit(me.id)}
              >
                <Plus size={17} />
                수동 충전
              </button>
            }
          </div>
          {tab === "overview" && (
            <>
              <div className="stat-grid">
                <Stat
                  label={"전체 회원"}
                  value={money(data.members.length)}
                  unit={"명"}
                  icon={<Users size={20} />}
                  foot={`구매 회원 ${purchased}명 · 가입 대기 ${data.members.length - purchased}명`}
                />
                <Stat
                  label={"누적 충전 입금액"}
                  value={money(sales)}
                  unit="원"
                  icon={<Wallet size={20} />}
                  foot={`최초 구매 ${data.purchases.filter((p) => p.kind === "initial").length}건 · 재구매 ${data.purchases.filter((p) => p.kind === "repeat").length}건`}
                />
                <Stat
                  label="누적 보너스 지급"
                  value={money(paid)}
                  unit="원"
                  icon={<CreditCard size={20} />}
                  foot="한도 내 지급액 기준"
                />
                <Stat
                  label="미배송 주문"
                  value={money(pending.length)}
                  unit="건"
                  icon={<Package size={20} />}
                  foot="배송 상태를 확인해 주세요"
                  accent
                />
              </div>
              <div className="overview-grid">
                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>최근 구매 현황</h2>
                      <p>현금 구매와 PV 상품 구매 내역입니다.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => selectTab("credit")}
                    >
                      전체 보기 <ArrowUpRight size={15} />
                    </button>
                  </div>
                  <PurchaseTable
                    rows={data.purchases.slice(0, 5)}
                    members={data.members}
                  />
                </section>
                <section className="cap-card">
                  <span className="eyebrow">OPERATIONS SUMMARY</span>
                  <div className="cap-title">
                    <h2>배송 처리 현황</h2>
                    <span className="light-badge">전체 주문</span>
                  </div>
                  <div className="cap-value">
                    {pending.length}
                    <span>건</span>
                  </div>
                  <p>배송 처리가 필요한 주문</p>
                  <div className="progress-track">
                    <div
                      style={{
                        width: `${data.purchases.length ? ((data.purchases.length - pending.length) / data.purchases.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="cap-labels">
                    <span>
                      배송완료 {data.purchases.length - pending.length}건
                    </span>
                    <span>전체 {data.purchases.length}건</span>
                  </div>
                  <div className="cap-note">
                    <ShieldCheck size={18} />
                    <span>
                      회원이 PV로 구매한 주문을 관리하세요.
                      <br />
                      <small>회원별 한도는 회원 관리에서 확인합니다.</small>
                    </span>
                  </div>
                </section>
              </div>
              <div className="overview-grid bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        처리할 배송{" "}
                        <span className="count">{pending.length}</span>
                      </h2>
                      <p>PV 결제가 완료된 주문입니다.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => selectTab("shipping")}
                    >
                      배송 관리 <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {pending.slice(0, 3).map((p) => (
                    <div className="task-row" key={p.id}>
                      <span className="soft-icon">
                        <Package size={19} />
                      </span>
                      <div>
                        <strong>{p.recipient}</strong>
                        <p>
                          활력단 15개 ·{" "}
                          {p.payment_method === "pv"
                            ? "PV 구매"
                            : p.kind === "initial"
                              ? "최초 구매"
                              : "재구매"}{" "}
                          <span>· {date(p.created_at)}</span>
                        </p>
                      </div>
                      <Badge status="pending" />
                      {
                        <button
                          className="icon-button"
                          aria-label={`${p.recipient} 배송 관리`}
                          onClick={() => setShipping(p)}
                        >
                          <ChevronRight size={18} />
                        </button>
                      }
                    </div>
                  ))}
                  {!pending.length && (
                    <Empty text="모든 주문의 배송이 완료되었습니다." />
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>최근 보너스</h2>
                      <p>발생한 보너스와 실제 지급액입니다.</p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => selectTab("bonuses")}
                    >
                      전체 보기 <ArrowUpRight size={15} />
                    </button>
                  </div>
                  {data.bonuses.slice(0, 3).map((b) => (
                    <div className="task-row" key={b.id}>
                      <span className="soft-icon mint">
                        <ArrowDownLeft size={18} />
                      </span>
                      <div>
                        <strong>{bonusNames[b.kind] ?? b.kind}</strong>
                        <p>
                          {member(b.member_id)?.name} · {date(b.created_at)}
                        </p>
                      </div>
                      <strong className="amount-positive">
                        +{money(b.paid)}
                        <small> 원</small>
                      </strong>
                    </div>
                  ))}
                  {!data.bonuses.length && (
                    <Empty text="아직 발생한 보너스가 없습니다." />
                  )}
                </section>
              </div>
            </>
          )}
          {tab === "announcements" && (
            <AdminAnnouncements demo={demo} members={data.members} />
          )}
          {tab === "sales" && (
            <SalesReport
              purchases={data.purchases}
              topups={data.topups ?? []}
            />
          )}
          {tab === "members" && (
            <section className="panel">
              {serviceMember && (
                <section
                  className="member-service"
                  aria-label="선택 회원 충전 및 배송"
                >
                  <div className="panel-heading">
                    <div>
                      <h2>{serviceMember.name} · 충전 및 배송</h2>
                      <p>
                        {serviceMember.member_code} · {serviceMember.phone}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="회원 처리 패널 닫기"
                      onClick={() => setServiceMemberId(null)}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="member-service-summary">
                    <div>
                      <span>현재 PV</span>
                      <strong>{money(serviceMember.pv)} PV</strong>
                    </div>
                    <div>
                      <span>남은 보너스 한도</span>
                      <strong>
                        {money(
                          serviceMember.bonus_limit - serviceMember.bonus_paid,
                        )}
                        원
                      </strong>
                    </div>
                    <div>
                      <span>미배송 주문</span>
                      <strong>
                        {
                          serviceOrders.filter(
                            (p) => p.shipping_status === "pending",
                          ).length
                        }
                        건
                      </strong>
                    </div>
                    <button
                      className="button primary"
                      disabled={serviceMember.status !== "active" || busy}
                      onClick={() => openCredit(serviceMember.id)}
                    >
                      <Plus size={16} />
                      입금 확인 · PV 충전
                    </button>
                  </div>
                  <p className="member-service-help">
                    충전은 PV 잔액만 늘어납니다. 회원이 상품을 구매하면 배송
                    주문이 생성됩니다. 아래에서 주문별 배송 상태를 처리하세요.
                    {serviceMember.status !== "active" &&
                      " 이용 정지 회원은 충전할 수 없습니다."}
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>구매일 / 구분</th>
                          <th>금액 / 충전 PV</th>
                          <th>주문 배송지</th>
                          <th>배송 상태</th>
                          <th>처리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceOrders.map((p) => (
                          <tr key={p.id}>
                            <td>
                              {date(p.created_at)}
                              <small className="table-sub">
                                {p.payment_method === "pv"
                                  ? "PV 구매"
                                  : p.kind === "initial"
                                    ? "최초 구매"
                                    : "재구매"}
                              </small>
                            </td>
                            <td>
                              {money(p.cash)}원
                              <small className="table-sub">
                                {p.payment_method === "pv"
                                  ? `−${money(p.pv_spent ?? 0)}`
                                  : money(p.pv)}{" "}
                                PV
                              </small>
                            </td>
                            <td className="address-cell">
                              {p.address}
                              {p.tracking && (
                                <small className="table-sub">
                                  {p.tracking}
                                </small>
                              )}
                            </td>
                            <td>
                              <Badge status={p.shipping_status} />
                            </td>
                            <td>
                              <button
                                className="button compact"
                                disabled={busy}
                                onClick={() => setShipping(p)}
                              >
                                배송 처리
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!serviceOrders.length && (
                    <Empty text="아직 상품 구매 내역이 없습니다. 충전 후 회원 앱에서 상품을 구매하세요." />
                  )}
                </section>
              )}
              <div className="table-toolbar">
                <div className="segmented">
                  {[
                    ["all", "전체 회원"],
                    ["pending", "첫 구매 대기"],
                    ["suspended", "정지 회원"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={filter === v ? "selected" : ""}
                      onClick={() => {
                        setFilter(v);
                        setPage(1);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <SearchBox
                  value={search}
                  onChange={(s) => {
                    setSearch(s);
                    setPage(1);
                  }}
                  placeholder="이름, 회원번호, 연락처 검색"
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>회원</th>
                      <th>등급 / 상태</th>
                      <th>충전 PV</th>
                      <th>남은 보너스 한도</th>
                      <th>추천인</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice((page - 1) * 10, page * 10).map((m) => (
                      <tr key={m.id}>
                        <td>
                          <Person member={m} />
                        </td>
                        <td>
                          {rank(m, data.members, data.centers)}
                          <small className="table-sub">
                            {m.status === "active" ? "정상" : "이용 정지"}
                          </small>
                        </td>
                        <td>
                          {money(m.pv)} <small>PV</small>
                        </td>
                        <td>{money(m.bonus_limit - m.bonus_paid)}원</td>
                        <td>{member(m.referrer_id)?.name ?? "미배정"}</td>
                        <td>
                          <button
                            className="button compact member-service-button"
                            onClick={() => setServiceMemberId(m.id)}
                            aria-pressed={serviceMemberId === m.id}
                          >
                            충전·배송
                          </button>
                          <button
                            className="button compact"
                            onClick={() => setEdit(m)}
                          >
                            정보 수정
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length && <Empty text="검색 결과가 없습니다." />}
              <Pagination
                total={filtered.length}
                page={page}
                setPage={setPage}
              />
            </section>
          )}
          {tab === "credit" && (
            <>
              <div className="purchase-plans">
                {(["initial", "repeat"] as const).map((k) => (
                  <section className="panel plan" key={k}>
                    <span className="soft-icon">
                      <Package />
                    </span>
                    <div>
                      <span className="eyebrow">
                        {k === "initial" ? "FIRST TOPUP" : "REPEAT TOPUP"}
                      </span>
                      <h2>
                        {k === "initial" ? "최초 PV 충전" : "추가 PV 충전"}
                      </h2>
                      <p>{money(terms[k].pv)} PV 충전</p>
                    </div>
                    <strong>
                      {money(terms[k].cash)}
                      <small>원</small>
                    </strong>
                    <span className="badge green">상품 구매 시 한도 추가</span>
                  </section>
                ))}
              </div>
              {
                <section className="panel credit-picker">
                  <div>
                    <h2>입금 확인 후 수동 충전</h2>
                    <p>
                      입금액에 해당하는 PV만 충전합니다. 상품 주문은 회원 앱에서
                      진행합니다.
                    </p>
                  </div>
                  <select
                    aria-label="충전할 회원"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) openCredit(e.target.value);
                    }}
                  >
                    <option value="">충전할 회원을 선택하세요</option>
                    {data.members
                      .filter((m) => m.status === "active")
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.member_code}
                        </option>
                      ))}
                  </select>
                </section>
              }
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>PV 충전 기록</h2>
                    <p>입금 확인과 PV 충전 기록을 보관합니다.</p>
                  </div>
                </div>
                <TopupTable
                  rows={(data.topups ?? []).slice((page - 1) * 10, page * 10)}
                  members={data.members}
                />
                <Pagination
                  total={data.topups?.length ?? 0}
                  page={page}
                  setPage={setPage}
                />
              </section>
            </>
          )}
          {tab === "shipping" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="segmented">
                  {[
                    ["all", "전체 주문"],
                    ["pending", "미배송"],
                    ["delivered", "배송완료"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={filter === v ? "selected" : ""}
                      onClick={() => {
                        setFilter(v);
                        setPage(1);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <SearchBox
                  value={search}
                  onChange={(s) => {
                    setSearch(s);
                    setPage(1);
                  }}
                  placeholder="수령인 또는 회원번호 검색"
                />
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>수령인 / 구매일</th>
                      <th>상품</th>
                      <th>배송지</th>
                      <th>배송 상태</th>
                      <th>운송장</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.slice((page - 1) * 10, page * 10).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.recipient}</strong>
                          <small className="table-sub">
                            {date(p.created_at)} · {p.phone}
                          </small>
                        </td>
                        <td>
                          활력단 15개
                          <small className="table-sub">
                            {p.payment_method === "pv"
                              ? "PV 구매"
                              : p.kind === "initial"
                                ? "최초 구매"
                                : "재구매"}
                          </small>
                        </td>
                        <td className="address-cell">{p.address}</td>
                        <td>
                          <Badge status={p.shipping_status} />
                        </td>
                        <td>{p.tracking || "—"}</td>
                        {
                          <td>
                            <button
                              className="button compact"
                              onClick={() => setShipping(p)}
                            >
                              배송 처리
                            </button>
                          </td>
                        }
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!shipments.length && <Empty text="해당하는 주문이 없습니다." />}
              <Pagination
                total={shipments.length}
                page={page}
                setPage={setPage}
              />
            </section>
          )}
          {tab === "organization" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="segmented">
                  <button
                    className={orgMode === "sponsor" ? "selected" : ""}
                    onClick={() => setOrgMode("sponsor")}
                  >
                    후원 배치도
                  </button>
                  <button
                    className={orgMode === "referral" ? "selected" : ""}
                    onClick={() => setOrgMode("referral")}
                  >
                    추천 관계도
                  </button>
                </div>
                <select
                  aria-label="조직도 기준 회원"
                  value={orgRoot}
                  onChange={(e) => setOrgRoot(e.target.value)}
                >
                  {data.members.map((m) => (
                    <option value={m.id} key={m.id}>
                      {m.name} · {m.member_code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="tree-canvas">
                <TreeNode
                  id={orgRoot}
                  members={data.members}
                  mode={orgMode}
                  depth={0}
                />
              </div>
              <div className="panel-footer">
                {orgMode === "sponsor"
                  ? "좌·우 배치는 추천인과 별도로 관리됩니다."
                  : "추천 관계를 기준으로 표시합니다. 후원 배치와 다를 수 있습니다."}{" "}
                · 최대 3개 세대 표시, 기준 회원을 바꿔 하위 조직을 확인하세요.
              </div>
            </section>
          )}
          {tab === "bonuses" && (
            <>
              <div className="stat-grid three">
                <Stat
                  label="총 발생액"
                  value={money(data.bonuses.reduce((a, b) => a + b.gross, 0))}
                  unit="원"
                  icon={<CreditCard size={20} />}
                  foot="지급액 + 소멸액"
                />
                <Stat
                  label="실제 지급액"
                  value={money(paid)}
                  unit="원"
                  icon={<Wallet size={20} />}
                  foot="보너스 한도 내 반영"
                />
                <Stat
                  label="소멸액"
                  value={money(data.bonuses.reduce((a, b) => a + b.expired, 0))}
                  unit="원"
                  icon={<ShieldCheck size={20} />}
                  foot="재구매해도 소급 지급하지 않습니다"
                />
              </div>
              <section className="panel">
                <div className="table-toolbar">
                  <h2>보너스 원장</h2>
                  <select
                    aria-label="보너스 종류"
                    value={filter}
                    onChange={(e) => {
                      setFilter(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="all">전체 보너스</option>
                    {Object.entries(bonusNames).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>발생일</th>
                        <th>회원</th>
                        <th>종류</th>
                        <th>발생액</th>
                        <th>지급액</th>
                        <th>소멸액 / 사유</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allBonuses.slice((page - 1) * 10, page * 10).map((b) => (
                        <tr key={b.id}>
                          <td>{date(b.created_at)}</td>
                          <td>{member(b.member_id)?.name ?? "회원"}</td>
                          <td>{bonusNames[b.kind]}</td>
                          <td>{money(b.gross)}원</td>
                          <td className="amount-positive">{money(b.paid)}원</td>
                          <td>
                            {money(b.expired)}원
                            <small className="table-sub">{b.reason}</small>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!allBonuses.length && (
                  <Empty text="해당하는 보너스가 없습니다." />
                )}
                <Pagination
                  total={allBonuses.length}
                  page={page}
                  setPage={setPage}
                />
              </section>
            </>
          )}
          {tab === "settings" && (
            <>
              <div className="overview-grid">
                <section className="panel padded">
                  <h2>확정된 보상 기준</h2>
                  <dl className="rules">
                    <div>
                      <dt>최초 충전</dt>
                      <dd>37만원 입금 → 30만 PV 충전</dd>
                    </div>
                    <div>
                      <dt>추가 충전</dt>
                      <dd>27만원 입금 → 20만 PV 충전</dd>
                    </div>
                    <div>
                      <dt>PV 상품 구매</dt>
                      <dd>30만 PV 차감 · 한도 150만원 추가</dd>
                    </div>
                    <div>
                      <dt>추천 보너스</dt>
                      <dd>1대 30% · 2대 10% (최초 PV)</dd>
                    </div>
                    <div>
                      <dt>삼각 보너스</dt>
                      <dd>9만원 / 9만원 × 2 / 6만원 × 4</dd>
                    </div>
                    <div>
                      <dt>후원 롤업</dt>
                      <dd>1대당 10,000원 × 최대 13대</dd>
                    </div>
                    <div>
                      <dt>센터 등급</dt>
                      <dd>소속 회원 구매 PV의 5%</dd>
                    </div>
                    <div>
                      <dt>한도 초과</dt>
                      <dd>초과분 소멸 · 적립/이월 없음</dd>
                    </div>
                  </dl>
                  <p className="notice">
                    원장의 지급액은 보너스 적립 기록입니다. 은행 계좌로 자동
                    송금하는 기능은 포함하지 않습니다.
                  </p>
                </section>
                <section className="panel padded">
                  <h2>직급 보너스 일일 정산</h2>
                  <p className="muted">
                    재구매 PV의 20%는 팀장·본부장, 10%는 본부장에게 균등
                    배분합니다. 한국 시간 기준 마감된 날짜만 처리할 수 있습니다.
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      if (demo) {
                        setToast(
                          "일일 직급 정산은 실제 데이터베이스 연결 후 사용합니다.",
                        );
                        return;
                      }
                      await perform("close", { day: f.get("day") }, () => data);
                    }}
                  >
                    <label>
                      정산일
                      <input
                        type="date"
                        name="day"
                        required
                        max={new Date(Date.now() - 86400000).toLocaleDateString(
                          "en-CA",
                          { timeZone: "Asia/Seoul" },
                        )}
                      />
                    </label>
                    <button className="button primary" disabled={busy || demo}>
                      선택일 정산 실행
                    </button>
                  </form>
                  <p className="muted small">
                    자동 마감은 Supabase의 예약 작업 설치 후 매일 00:01에
                    실행됩니다. 이미 정산한 날짜는 중복 지급하지 않습니다.
                  </p>
                </section>
              </div>
              <section className="panel padded">
                <h2>센터 관리</h2>
                <p className="muted small">
                  센터 수령 회원은 센터 등급으로 표시됩니다. 소속은 회원 정보
                  수정에서 배정하며, 30만 PV 상품 구매마다 15,000원이
                  발생합니다.
                </p>
                <div className="center-list">
                  {data.centers.map((c) => (
                    <span className="badge green" key={c.id}>
                      {c.name} · {member(c.owner_id)?.name}
                    </span>
                  ))}
                </div>
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form);
                    const name = String(f.get("name")),
                      owner = String(f.get("owner"));
                    if (
                      await perform("center", { name, owner }, () => {
                        if (data.centers.some((c) => c.name === name))
                          throw new Error("이미 존재하는 센터명입니다.");
                        const next = structuredClone(data);
                        next.centers.push({
                          id: crypto.randomUUID(),
                          name,
                          owner_id: owner,
                        });
                        return demoAudit(next, "센터 생성", name);
                      })
                    )
                      form.reset();
                  }}
                >
                  <label>
                    센터명
                    <input
                      name="name"
                      required
                      maxLength={80}
                      placeholder="센터 이름"
                    />
                  </label>
                  <label>
                    센터 등급 회원 / 보너스 수령인
                    <select name="owner" required>
                      <option value="">회원 선택</option>
                      {data.members.map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name} · {m.member_code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button primary" disabled={busy}>
                    센터 추가
                  </button>
                </form>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>관리자 작업 기록</h2>
                </div>
                {data.audits.slice(0, 20).map((a) => (
                  <div className="task-row" key={a.id}>
                    <span className="soft-icon">
                      <ShieldCheck size={18} />
                    </span>
                    <div>
                      <strong>{a.action}</strong>
                      <p>{a.detail}</p>
                    </div>
                    <small className="muted">{date(a.created_at)}</small>
                  </div>
                ))}
                {!data.audits.length && (
                  <Empty text="충전과 변경 이력이 여기에 기록됩니다." />
                )}
              </section>
            </>
          )}
          <footer className="footer">
            <span>© 2026 활력 파트너스</span>
            <span>건강한 연결, 함께하는 성장</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="알림 닫기" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {creditMember && (
        <Modal
          title="입금 확인 · 수동 충전"
          subtitle={`${creditMember.name} · ${creditMember.member_code}`}
          close={() => {
            if (!busy) setCreditId(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const note = String(f.get("note"));
              if (
                await perform(
                  "credit",
                  { member: creditMember.id, request: requestId.current, note },
                  () =>
                    demoCredit(data, creditMember.id, note, requestId.current),
                )
              )
                setCreditId(null);
            }}
          >
            <div className="order-summary">
              <span>
                {creditKind === "initial" ? "최초 PV 충전" : "추가 PV 충전"}
              </span>
              <strong>{money(creditTerms.cash)}원</strong>
              <dl>
                <div>
                  <dt>충전 PV</dt>
                  <dd>+{money(creditTerms.pv)} PV</dd>
                </div>
                <div>
                  <dt>추가 보너스 한도</dt>
                  <dd>충전 시 추가 없음 · 상품 구매 시 150만원</dd>
                </div>
              </dl>
            </div>
            <label>
              입금 확인 메모
              <input
                name="note"
                required
                maxLength={500}
                placeholder="예: 9/10 김민준 입금 확인"
              />
            </label>
            <div className="delivery-preview">
              <strong>상품 배송지</strong>
              <p>
                ({creditMember.postcode}) {creditMember.address}{" "}
                {creditMember.address_detail}
              </p>
              <span>{creditMember.phone}</span>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" required />
              현금 {money(creditTerms.cash)}원 입금을 확인했습니다.
            </label>
            <button className="button primary wide" disabled={busy}>
              {busy ? "충전 중…" : "PV 충전 확정"}
            </button>
          </form>
        </Modal>
      )}
      {shipping && (
        <Modal
          title="배송 상태 변경"
          subtitle={`${shipping.recipient} · 활력단 15개`}
          close={() => {
            if (!busy) setShipping(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const status = String(
                f.get("status"),
              ) as Purchase["shipping_status"];
              const tracking = String(f.get("tracking"));
              if (
                await perform(
                  "shipping",
                  { purchase: shipping.id, status, tracking },
                  () => {
                    const next = structuredClone(data);
                    const p = next.purchases.find((p) => p.id === shipping.id)!;
                    p.shipping_status = status;
                    p.tracking = tracking;
                    return demoAudit(
                      next,
                      "배송 수정",
                      `${shipping.recipient} · ${status === "delivered" ? "배송완료" : "미배송"}`,
                    );
                  },
                )
              )
                setShipping(null);
            }}
          >
            <div className="delivery-preview">
              <strong>
                {shipping.recipient} · {shipping.phone}
              </strong>
              <p>{shipping.address}</p>
            </div>
            <label>
              배송 상태
              <select name="status" defaultValue={shipping.shipping_status}>
                <option value="pending">미배송</option>
                <option value="delivered">배송완료</option>
              </select>
            </label>
            <label>
              택배사 / 운송장 번호 (선택)
              <input
                name="tracking"
                defaultValue={shipping.tracking}
                maxLength={100}
                placeholder="예: CJ대한통운 1234567890"
              />
            </label>
            <button className="button primary wide" disabled={busy}>
              {busy ? "저장 중…" : "배송 상태 저장"}
            </button>
          </form>
        </Modal>
      )}
      {edit && (
        <Modal
          title="회원 정보 수정"
          subtitle={edit.member_code}
          close={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const payload = {
                ...edit,
                name: String(f.get("name")),
                phone: String(f.get("phone")),
                postcode: String(f.get("postcode")),
                address: String(f.get("address")),
                address_detail: String(f.get("address_detail")),
                bank_name: String(f.get("bank_name") ?? ""),
                account_number: String(f.get("account_number") ?? "").replace(
                  /[- ]/g,
                  "",
                ),
                account_holder: String(f.get("account_holder") ?? ""),
                status: String(f.get("status")) as Member["status"],
                referrer_id: String(f.get("referrer_id") || "") || null,
                sponsor_id: String(f.get("sponsor_id") || "") || null,
                position: (String(f.get("position") || "") ||
                  null) as Member["position"],
                center_id: String(f.get("center_id") || "") || null,
              };
              if (
                await perform("member", payload, () => {
                  if (payload.id === userId && payload.status !== "active")
                    throw new Error("자신의 계정을 정지할 수 없습니다.");
                  if (Boolean(payload.sponsor_id) !== Boolean(payload.position))
                    throw new Error("후원인과 좌·우 위치를 함께 선택하세요.");
                  if (
                    data.members.some(
                      (m) =>
                        m.id !== payload.id &&
                        m.sponsor_id &&
                        m.sponsor_id === payload.sponsor_id &&
                        m.position === payload.position,
                    )
                  )
                    throw new Error("이미 사용 중인 후원 자리입니다.");
                  for (const key of ["referrer_id", "sponsor_id"] as const) {
                    let id = payload[key];
                    const visited = new Set<string>();
                    while (id) {
                      if (id === payload.id || visited.has(id))
                        throw new Error("순환 관계는 등록할 수 없습니다.");
                      visited.add(id);
                      id = member(id)?.[key] ?? null;
                    }
                  }
                  const next = structuredClone(data);
                  next.members = next.members.map((m) =>
                    m.id === edit.id ? payload : m,
                  );
                  return demoAudit(next, "회원 수정", edit.member_code);
                })
              )
                setEdit(null);
            }}
          >
            <div className="form-grid">
              <label>
                이름
                <input
                  name="name"
                  defaultValue={edit.name}
                  required
                  maxLength={80}
                />
              </label>
              <label>
                연락처
                <input
                  name="phone"
                  defaultValue={edit.phone}
                  required
                  pattern="[0-9+\- ]{9,20}"
                />
              </label>
            </div>
            <label>
              우편번호
              <input
                name="postcode"
                defaultValue={edit.postcode}
                required
                pattern="[0-9]{5}"
                maxLength={5}
              />
            </label>
            <label>
              기본 주소
              <input
                name="address"
                defaultValue={edit.address}
                required
                maxLength={200}
              />
            </label>
            <label>
              상세 주소
              <input
                name="address_detail"
                defaultValue={edit.address_detail}
                maxLength={200}
              />
            </label>
            <h3>계좌 정보</h3>
            <BankFields member={edit} required={false} />
            <label>
              회원 상태
              <select name="status" defaultValue={edit.status}>
                <option value="active">정상</option>
                <option value="suspended">이용 정지</option>
              </select>
            </label>
            <fieldset>
              <legend>추천 · 후원 관계</legend>
              <p className="muted small">
                구매 이력과 관계없이 관리자가 수정할 수 있습니다. 하위 회원은
                현재 회원을 따라 이동하며, 기존 보너스 기록은 유지됩니다.
              </p>
              {(["referrer_id", "sponsor_id"] as const).map((key) => (
                <label key={key}>
                  {key === "referrer_id" ? "추천인" : "후원 배치 상위 회원"}
                  <select name={key} defaultValue={edit[key] ?? ""}>
                    <option value="">미배정</option>
                    {data.members
                      .filter((m) => m.id !== edit.id)
                      .map((m) => (
                        <option value={m.id} key={m.id}>
                          {m.name} · {m.member_code}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label>
                후원 위치
                <select name="position" defaultValue={edit.position ?? ""}>
                  <option value="">미배정</option>
                  <option value="L">좌측</option>
                  <option value="R">우측</option>
                </select>
              </label>
            </fieldset>
            <label>
              소속 센터
              <select name="center_id" defaultValue={edit.center_id ?? ""}>
                <option value="">미배정</option>
                {data.centers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary wide" disabled={busy}>
              {busy ? "저장 중…" : "회원 정보 저장"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  icon,
  foot,
  accent = false,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  foot: string;
  accent?: boolean;
}) {
  return (
    <section className={`stat-card ${accent ? "accent" : ""}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{foot}</p>
    </section>
  );
}
function Person({ member }: { member: Member }) {
  return (
    <div className="person">
      <span className="avatar small-avatar">{member.name.slice(0, 1)}</span>
      <div>
        <strong>{member.name}</strong>
        <small>{member.member_code}</small>
      </div>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status === "delivered" ? "green" : "amber"}`}>
      <span />
      {status === "delivered" ? "배송완료" : "미배송"}
    </span>
  );
}
function PurchaseTable({
  rows,
  members,
}: {
  rows: Purchase[];
  members: Member[];
}) {
  return (
    <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>회원</th>
              <th>구매 구분</th>
              <th>구매 금액</th>
              <th>충전 PV</th>
              <th>배송 상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.recipient}</strong>
                  <small className="table-sub">
                    {members.find((m) => m.id === p.member_id)?.member_code} ·{" "}
                    {date(p.created_at)}
                  </small>
                </td>
                <td>
                  <span
                    className={`type-badge ${p.kind === "repeat" ? "repeat" : ""}`}
                  >
                    {p.payment_method === "pv"
                      ? "PV 구매"
                      : p.kind === "initial"
                        ? "최초 구매"
                        : "재구매"}
                  </span>
                </td>
                <td>{money(p.cash)}원</td>
                <td>
                  {p.payment_method === "pv"
                    ? `−${money(p.pv_spent ?? 0)}`
                    : money(p.pv)}{" "}
                  <small>PV</small>
                </td>
                <td>
                  <Badge status={p.shipping_status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <Empty text="아직 구매 내역이 없습니다." />}
    </>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Package size={27} />
      <p>{text}</p>
    </div>
  );
}
function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
}) {
  return (
    <div className="search">
      <Search size={17} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
function Pagination({
  total,
  page,
  setPage,
}: {
  total: number;
  page: number;
  setPage: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>총 {money(total)}건</span>
      <div>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          이전
        </button>
        <span>
          {page} / {Math.max(1, Math.ceil(total / 10))}
        </span>
        <button disabled={page * 10 >= total} onClick={() => setPage(page + 1)}>
          다음
        </button>
      </div>
    </div>
  );
}
function Modal({
  title,
  subtitle,
  close,
  children,
}: {
  title: string;
  subtitle: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      className="modal"
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button className="icon-button" aria-label="닫기" onClick={close}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function TreeNode({
  id,
  members,
  mode,
  depth,
}: {
  id: string;
  members: Member[];
  mode: "sponsor" | "referral";
  depth: number;
}) {
  const m = members.find((m) => m.id === id);
  if (!m) return null;
  const children = members
    .filter((m) =>
      mode === "sponsor" ? m.sponsor_id === id : m.referrer_id === id,
    )
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));
  return (
    <div className="tree-branch">
      <div className={`tree-node ${depth === 0 ? "root-node" : ""}`}>
        <span className="avatar">{m.name.slice(0, 1)}</span>
        <strong>{m.name}</strong>
        <small>{m.member_code}</small>
        <span className="tree-position">
          {depth === 0
            ? "기준 회원"
            : mode === "sponsor"
              ? m.position === "L"
                ? "좌측"
                : "우측"
              : "직접 추천"}
        </span>
      </div>
      {depth < 2 && children.length > 0 && (
        <div className="tree-children">
          {children.map((c) => (
            <TreeNode
              key={c.id}
              id={c.id}
              members={members}
              mode={mode}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TopupTable({
  rows,
  members,
}: {
  rows: NonNullable<AppData["topups"]>;
  members: Member[];
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>충전일</th>
            <th>회원</th>
            <th>입금액</th>
            <th>충전 PV</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>{date(p.created_at)}</td>
              <td>{members.find((m) => m.id === p.member_id)?.name}</td>
              <td>{money(p.cash)}원</td>
              <td>+{money(p.pv)} PV</td>
              <td>{p.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">충전 기록이 없습니다.</p>}
    </div>
  );
}
