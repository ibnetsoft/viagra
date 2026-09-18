"use client";
import { useEffect, useRef, useState } from "react";
import { Network, RotateCcw } from "lucide-react";
import {
  loadOrganizationTree,
  loadUnplacedMembers,
  placeReferredMember,
} from "@/app/actions";
import {
  demoOrganization,
  type OrganizationData,
  type OrganizationNode,
} from "@/lib/member-data";
import { seedDemo } from "@/lib/demo";
import { money } from "@/lib/domain";

const depthOptions = [
  { label: "전체", value: 0 },
  { label: "3단계", value: 3 },
  { label: "5단계", value: 5 },
  { label: "10단계", value: 10 },
  { label: "15단계", value: 15 },
  { label: "20단계", value: 20 },
] as const;

export default function MemberOrganization({
  demo,
  memberId,
}: {
  demo: boolean;
  memberId: string;
}) {
  const [mode, setMode] = useState<"referral" | "sponsor">("sponsor");
  const [path, setPath] = useState<OrganizationNode[]>([]);
  const [depthLimit, setDepthLimit] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [data, setData] = useState<OrganizationData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<
    { id: string; name: string; username?: string; member_code: string }[]
  >([]);
  const [chosen, setChosen] = useState("");
  const [placement, setPlacement] = useState<{
    memberId: string;
    memberName: string;
    sponsorId: string;
    sponsorName: string;
    position: "L" | "R";
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [panning, setPanning] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const root = path.at(-1)?.id ?? memberId;
  const fullDate = (s: string) =>
    new Intl.DateTimeFormat("ko-KR", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Seoul",
    }).format(new Date(s));
  const clampZoom = (value: number) => Math.min(1.8, Math.max(0.45, value));
  const setZoomStep = (delta: number) =>
    setZoom((value) => clampZoom(Number((value + delta).toFixed(2))));

  function normalizeTree(raw: OrganizationData): OrganizationData {
    if (raw.root.children) return raw;
    const nodes: OrganizationNode[] = (raw.nodes ?? []).map((node) => ({ ...node, children: [] }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const rootNode: OrganizationNode = { ...raw.root, children: [] };
    for (const node of nodes) {
      if (node.parent_id === raw.root.id) rootNode.children!.push(node);
      else byId.get(node.parent_id ?? "")?.children?.push(node);
    }
    const sortNodes = (items: OrganizationNode[]) => {
      items.sort((a, b) =>
        mode === "sponsor"
          ? `${a.position ?? ""}${a.name}`.localeCompare(`${b.position ?? ""}${b.name}`)
          : a.name.localeCompare(b.name),
      );
      items.forEach((item) => sortNodes(item.children ?? []));
    };
    sortNodes(rootNode.children ?? []);
    return { ...raw, root: rootNode, children: rootNode.children ?? [] };
  }

  async function confirmPlacement() {
    if (!placement || saving) return;
    setSaving(true);
    setError("");
    try {
      if (demo) {
        const saved = localStorage.getItem("vital-partners-demo-v2");
        const next = saved ? JSON.parse(saved) : seedDemo();
        demoOrganization(next, memberId, "sponsor", placement.sponsorId, 0, 1);
        const target = next.members.find(
          (m: any) =>
            m.id === placement.memberId &&
            m.referrer_id === memberId &&
            !m.sponsor_id,
        );
        if (!target || target.status !== "active" || target.id === placement.sponsorId)
          throw new Error("배치할 회원을 다시 확인하세요.");
        let ancestor = placement.sponsorId;
        while (ancestor) {
          if (ancestor === target.id) throw new Error("순환 배치할 수 없습니다.");
          ancestor = next.members.find((m: any) => m.id === ancestor)?.sponsor_id;
        }
        if (
          next.members.some(
            (m: any) =>
              m.sponsor_id === placement.sponsorId &&
              m.position === placement.position,
          )
        )
          throw new Error("이미 사용 중인 자리입니다.");
        target.sponsor_id = placement.sponsorId;
        target.position = placement.position;
        localStorage.setItem("vital-partners-demo-v2", JSON.stringify(next));
      } else {
        const result = await placeReferredMember(
          placement.memberId,
          placement.sponsorId,
          placement.position,
        );
        if (result.error) throw new Error(result.error);
      }
      setNotice("회원 배치가 완료되었습니다.");
      setChosen("");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "배치하지 못했습니다.");
    } finally {
      dialog.current?.close();
      setPlacement(null);
      setSaving(false);
      setRevision((v) => v + 1);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    async function load() {
      try {
        let result: OrganizationData;
        if (demo) {
          const saved = localStorage.getItem("vital-partners-demo-v2");
          result = demoOrganization(
            saved ? JSON.parse(saved) : seedDemo(),
            memberId,
            mode,
            root,
            0,
            depthLimit,
          );
        } else {
          const response = await loadOrganizationTree(mode, root, depthLimit);
          if (response.error) throw new Error(response.error);
          result = normalizeTree(response.data as OrganizationData);
        }
        const waiting = demo
          ? (
              JSON.parse(
                localStorage.getItem("vital-partners-demo-v2") ?? "null",
              ) ?? seedDemo()
            ).members.filter(
              (m: any) =>
                m.role === "member" &&
                m.status === "active" &&
                m.referrer_id === memberId &&
                !m.sponsor_id,
            )
          : await loadUnplacedMembers().then((r) => {
              if (r.error) throw new Error(r.error);
              return r.data;
            });
        if (!cancelled) {
          setData(result);
          setPending(waiting);
        }
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(e instanceof Error ? e.message : "조직도를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [demo, memberId, mode, root, depthLimit, revision]);


  useEffect(() => {
    if (!data) return;
    setPan({ x: 0, y: 0 });
  }, [data?.root.id, mode, depthLimit]);

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport || pinch.current) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    viewport.setPointerCapture?.(event.pointerId);
    setPanning(true);
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    const viewport = viewportRef.current;
    if (!current || !viewport || current.pointerId !== event.pointerId || pinch.current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      current.moved = true;
      suppressClick.current = true;
    }
    setPan({ x: current.panX + dx, y: current.panY + dy });
    if (current.moved) event.preventDefault();
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (drag.current?.pointerId === event.pointerId) {
      viewport?.releasePointerCapture?.(event.pointerId);
      drag.current = null;
    }
    setPanning(false);
  }

  return (
    <>
      <div className="member-page-title">
        <p>MY NETWORK</p>
        <h1>나의 조직도</h1>
        <span>단계와 배율을 조정해서 산하 트리를 한눈에 확인하세요.</span>
      </div>
      <div className="member-filter" aria-label="조직도 유형">
        {(["sponsor", "referral"] as const).map((value) => (
          <button
            key={value}
            className={mode === value ? "on" : ""}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setPath([]);
            }}
          >
            {value === "sponsor" ? "후원 조직도" : "추천 조직도"}
          </button>
        ))}
      </div>
      <div className="member-org-controls">
        <label>
          표시 단계
          <select
            value={depthLimit}
            onChange={(e) => setDepthLimit(Number(e.target.value))}
          >
            {depthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="member-zoom-controls" aria-label="조직도 확대 축소">
          <button type="button" onClick={() => setZoomStep(-0.1)}>
            축소
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={() => setZoomStep(0.1)}>
            확대
          </button>
        </div>
      </div>
      {mode === "sponsor" && (
        <section className="member-card">
          <h2>내가 추천한 미배치 회원 · {pending.length}명</h2>
          <label>
            배치할 회원
            <select
              aria-label="배치할 회원"
              value={chosen}
              disabled={loading || saving}
              onChange={(e) => setChosen(e.target.value)}
            >
              <option value="">회원 선택</option>
              {pending.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.username ?? m.member_code}
                </option>
              ))}
            </select>
          </label>
          <p className="member-explanation">
            회원을 선택한 뒤, 후원 조직도에서 원하는 빈 좌·우 자리를 누르세요.
          </p>
          {!pending.length && !loading && <p>현재 직접 추천한 미배치 회원이 없습니다.</p>}
        </section>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="member-org-path">
        <button
          onClick={() => {
            setPath([]);
          }}
        >
          <RotateCcw size={14} />
          나부터 보기
        </button>
        {path.length > 0 && (
          <button onClick={() => setPath(path.slice(0, -1))}>이전 단계</button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status" className="member-empty">
          조직도를 불러오는 중…
        </p>
      ) : (
        data && (
          <section
            className="member-card member-org"
            aria-label={mode === "sponsor" ? "후원 배치" : "추천 관계"}
          >
            <div
              ref={viewportRef}
              className={`member-org-viewport ${panning ? "is-panning" : ""}`}
              onPointerDown={beginPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onClickCapture={(event) => {
                if (!suppressClick.current) return;
                event.preventDefault();
                event.stopPropagation();
                suppressClick.current = false;
              }}
              onTouchStart={(event) => {
                if (event.touches.length !== 2) return;
                drag.current = null;
                setPanning(false);
                const [a, b] = Array.from(event.touches);
                pinch.current = {
                  distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                  zoom,
                };
              }}
              onTouchMove={(event) => {
                if (event.touches.length !== 2 || !pinch.current) return;
                event.preventDefault();
                const [a, b] = Array.from(event.touches);
                const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
                setZoom(clampZoom(pinch.current.zoom * (distance / pinch.current.distance)));
              }}
              onTouchEnd={(event) => {
                if (event.touches.length < 2) pinch.current = null;
              }}
            >
              <div
                className="member-org-scale"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                {renderNode(data.root, true)}
              </div>
            </div>
            {!data.total && (
              <p className="member-empty">아직 연결된 하위 회원이 없어요.</p>
            )}
          </section>
        )
      )}
      <p className="member-explanation">
        직접 추천한 미배치 회원만 내 후원 산하에 배치할 수 있습니다. 확정 후 이동은 관리자에게 요청하세요. 배치 전 구매 실적은 새 후원인에게 소급 반영되지 않습니다.
      </p>
      <dialog
        ref={dialog}
        className="signup-confirmation"
        aria-labelledby="placement-title"
        onCancel={(e) => {
          if (saving) e.preventDefault();
          else setPlacement(null);
        }}
      >
        <h2 id="placement-title">후원 배치 최종 확인</h2>
        <dl className="rules">
          <div>
            <dt>배치할 회원</dt>
            <dd>{placement?.memberName}</dd>
          </div>
          <div>
            <dt>후원인</dt>
            <dd>{placement?.sponsorName}</dd>
          </div>
          <div>
            <dt>자리</dt>
            <dd>{placement?.position === "L" ? "좌측" : "우측"}</dd>
          </div>
        </dl>
        <p>확정 후에는 관리자만 변경할 수 있습니다. 이 자리에 배치하시겠습니까?</p>
        <div className="signup-confirm-actions">
          <button
            type="button"
            className="button"
            disabled={saving}
            onClick={() => {
              dialog.current?.close();
              setPlacement(null);
            }}
          >
            취소
          </button>
          <button
            type="button"
            className="button primary"
            disabled={saving}
            onClick={() => void confirmPlacement()}
          >
            {saving ? "배치 중…" : "확인하고 배치"}
          </button>
        </div>
      </dialog>
    </>
  );

  function NodeDetails({ node }: { node: OrganizationNode }) {
    return (
      <small className="member-org-meta">
        <span>ID {node.username ?? node.member_code.toLowerCase()}</span>
        <span>가입일 {node.created_at ? fullDate(node.created_at) : "-"}</span>
        <span>매출PV {money(Number(node.sales_pv ?? 0))} PV</span>
      </small>
    );
  }

  function nodeCard(node: OrganizationNode, rootNode: boolean) {
    const content = (
      <>
        {rootNode && <Network size={21} />}
        <strong>{node.name}</strong>
        <NodeDetails node={node} />
        <span>{rootNode ? "기준 회원" : node.has_children ? "산하 보기" : "하위 회원 없음"}</span>
      </>
    );
    if (rootNode)
      return <div className="member-org-root member-org-node-card">{content}</div>;
    return (
      <button
        className="member-org-node member-org-node-card"
        type="button"
        onClick={() => setPath([...path, node])}
      >
        {content}
      </button>
    );
  }

  function renderVacant(sponsor: OrganizationNode, position: "L" | "R") {
    return (
      <button
        className="member-org-vacant"
        type="button"
        disabled={!chosen || saving || loading}
        onClick={() => {
          const m = pending.find((m) => m.id === chosen);
          if (!m) return;
          setPlacement({
            memberId: m.id,
            memberName: `${m.name} (${m.username ?? m.member_code})`,
            sponsorId: sponsor.id,
            sponsorName: `${sponsor.name} (${sponsor.member_code})`,
            position,
          });
          dialog.current?.showModal();
        }}
      >
        {position === "L" ? "좌측" : "우측"} 빈 자리 · 배치하기
      </button>
    );
  }

  function renderNode(node: OrganizationNode, rootNode = false) {
    const children = node.children ?? [];
    const positions = ["L", "R"] as const;
    return (
      <div className="member-org-tree-node" key={node.id}>
        {nodeCard(node, rootNode)}
        {mode === "sponsor" && (!node.has_children || children.length > 0) ? (
          <div className="member-org-tree-children sponsor">
            {positions.map((position) => {
              const child = children.find((n) => n.position === position);
              return (
                <div key={`${node.id}-${position}`} className="member-org-branch">
                  <span>{position === "L" ? "좌측 · L" : "우측 · R"}</span>
                  {child ? renderNode(child) : renderVacant(node, position)}
                </div>
              );
            })}
          </div>
        ) : children.length ? (
          <div className="member-org-tree-children referral">
            {children.map((child) => (
              <div key={child.id} className="member-org-branch">
                <span>직접 추천</span>
                {renderNode(child)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
}

