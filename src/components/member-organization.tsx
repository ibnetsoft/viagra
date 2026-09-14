"use client";
import { useEffect, useState, useRef } from "react";
import { ChevronRight, Network, RotateCcw } from "lucide-react";
import { loadOrganization, loadUnplacedMembers, placeReferredMember } from "@/app/actions";
import {
  demoOrganization,
  type OrganizationData,
  type OrganizationNode,
} from "@/lib/member-data";
import { seedDemo } from "@/lib/demo";

export default function MemberOrganization({
  demo,
  memberId,
}: {
  demo: boolean;
  memberId: string;
}) {
  const [mode, setMode] = useState<"referral" | "sponsor">("sponsor");
  const [path, setPath] = useState<OrganizationNode[]>([]);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<OrganizationData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<{id:string;name:string;username?:string;member_code:string}[]>([]);
  const [chosen, setChosen] = useState("");
  const [placement, setPlacement] = useState<{memberId:string;memberName:string;sponsorId:string;sponsorName:string;position:"L"|"R"}|null>(null);
  const [saving,setSaving] = useState(false);
  const [revision,setRevision] = useState(0);
  const [notice,setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const root = path.at(-1)?.id ?? memberId;
  async function confirmPlacement() {
    if (!placement || saving) return;
    setSaving(true); setError("");
    try {
      if (demo) {
        const saved=localStorage.getItem("vital-partners-demo-v2"); const next=saved?JSON.parse(saved):seedDemo();
        demoOrganization(next,memberId,"sponsor",placement.sponsorId);
        const target=next.members.find((m: any)=>m.id===placement.memberId && m.referrer_id===memberId && !m.sponsor_id);
        if (!target || target.status!=="active" || target.id===placement.sponsorId) throw new Error("배치할 회원을 다시 확인하세요.");
        let ancestor=placement.sponsorId;
        while(ancestor) { if(ancestor===target.id) throw new Error("순환 배치할 수 없습니다."); ancestor=next.members.find((m:any)=>m.id===ancestor)?.sponsor_id; }
        if(next.members.some((m:any)=>m.sponsor_id===placement.sponsorId && m.position===placement.position)) throw new Error("이미 사용 중인 자리입니다.");
        target.sponsor_id=placement.sponsorId; target.position=placement.position;
        localStorage.setItem("vital-partners-demo-v2",JSON.stringify(next));
      } else {
        const result=await placeReferredMember(placement.memberId,placement.sponsorId,placement.position);
        if(result.error) throw new Error(result.error);
      }
      setNotice("회원 배치가 완료되었습니다."); setChosen("");
    } catch(e) { setNotice(e instanceof Error?e.message:"배치하지 못했습니다."); }
    finally { dialog.current?.close();setPlacement(null);setSaving(false);setRevision(v=>v+1); }
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
            offset,
          );
        } else {
          const response = await loadOrganization(mode, root, offset);
          if (response.error) throw new Error(response.error);
          result = response.data as OrganizationData;
        }
        const waiting = demo
          ? (JSON.parse(localStorage.getItem("vital-partners-demo-v2") ?? "null") ?? seedDemo()).members.filter((m: any)=>m.role==="member" && m.status==="active" && m.referrer_id===memberId && !m.sponsor_id)
          : await loadUnplacedMembers().then(r=>{if(r.error)throw new Error(r.error);return r.data;});
        if (!cancelled) { setData(result);setPending(waiting); }
      } catch (e) {
        if (!cancelled) {
          setData(null);
          setError(
            e instanceof Error ? e.message : "조직도를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [demo, memberId, mode, root, offset, revision]);
  return (
    <>
      <div className="member-page-title">
        <p>MY NETWORK</p>
        <h1>나의 조직도</h1>
        <span>회원을 누르면 해당 회원의 산하를 볼 수 있어요.</span>
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
              setOffset(0);
            }}
          >
            {value === "sponsor" ? "후원 조직도" : "추천 조직도"}
          </button>
        ))}
      </div>
      {mode === "sponsor" && <section className="member-card">
        <h2>내가 추천한 미배치 회원 · {pending.length}명</h2>
        <label>배치할 회원<select aria-label="배치할 회원" value={chosen} disabled={loading || saving} onChange={e=>setChosen(e.target.value)}>
          <option value="">회원 선택</option>{pending.map(m=><option key={m.id} value={m.id}>{m.name} · {m.username ?? m.member_code}</option>)}
        </select></label>
        <p className="member-explanation">회원을 선택한 뒤, 내 후원 조직도에서 원하는 빈 좌·우 자리를 누르세요. 하위 회원을 눌러 더 아래의 자리도 선택할 수 있습니다.</p>
        {!pending.length && !loading && <p>현재 직접 추천한 미배치 회원이 없습니다.</p>}
      </section>}
      {notice && <p role="status">{notice}</p>}
      <div className="member-org-path">
        <button
          onClick={() => {
            setPath([]);
            setOffset(0);
          }}
        >
          <RotateCcw size={14} />
          나부터 보기
        </button>
        {path.length > 0 && (
          <button
            onClick={() => {
              setPath(path.slice(0, -1));
              setOffset(0);
            }}
          >
            이전 단계
          </button>
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
            <div className="member-org-root">
              <Network size={24} />
              <strong>{data.root.name}</strong>
              <small>{data.root.member_code}</small>
              <span>
                직접 {mode === "sponsor" ? "후원" : "추천"} {data.total}명
              </span>
            </div>
            <div className={`member-org-children ${mode}`}>
              {mode === "sponsor"
                ? (["L", "R"] as const).map((position) => {
                    const child = data.children.find(
                      (n) => n.position === position,
                    );
                    return (
                      <div key={position} className="member-org-branch">
                        <span>
                          {position === "L" ? "좌측 · L" : "우측 · R"}
                        </span>
                        {child ? (
                          card(child)
                        ) : (
                          <button className="member-org-vacant" type="button" disabled={!chosen || saving || loading}
                            onClick={()=>{const m=pending.find(m=>m.id===chosen);if(!m)return;setPlacement({memberId:m.id,memberName:`${m.name} (${m.username ?? m.member_code})`,sponsorId:data.root.id,sponsorName:`${data.root.name} (${data.root.member_code})`,position});dialog.current?.showModal();}}>
                            {position === "L" ? "좌측" : "우측"} 빈 자리 · 배치하기
                          </button>
                        )}
                      </div>
                    );
                  })
                : data.children.map((child) => (
                    <div key={child.id} className="member-org-branch">
                      {card(child)}
                    </div>
                  ))}
            </div>
            {!data.total && (
              <p className="member-empty">아직 연결된 하위 회원이 없어요.</p>
            )}
            {data.total > 50 && (
              <div className="member-org-path">
                <button
                  disabled={!offset}
                  onClick={() => setOffset(offset - 50)}
                >
                  이전
                </button>
                <span>
                  {offset + 1}–{Math.min(offset + 50, data.total)} /{" "}
                  {data.total}
                </span>
                <button
                  disabled={offset + 50 >= data.total}
                  onClick={() => setOffset(offset + 50)}
                >
                  다음
                </button>
              </div>
            )}
          </section>
        )
      )}
      <p className="member-explanation">직접 추천한 미배치 회원만 내 후원 산하에 배치할 수 있습니다. 확정 후 이동은 관리자에게 요청하세요. 배치 전 구매 실적은 새 후원인에게 소급 반영되지 않습니다.</p>
      <dialog ref={dialog} className="signup-confirmation" aria-labelledby="placement-title" onCancel={e=>{if(saving)e.preventDefault();else setPlacement(null);}}>
        <h2 id="placement-title">후원 배치 최종 확인</h2>
        <dl className="rules"><div><dt>배치할 회원</dt><dd>{placement?.memberName}</dd></div><div><dt>후원인</dt><dd>{placement?.sponsorName}</dd></div><div><dt>자리</dt><dd>{placement?.position==="L"?"좌측":"우측"}</dd></div></dl>
        <p>확정 후에는 관리자만 변경할 수 있습니다. 이 자리에 배치하시겠습니까?</p>
        <div className="signup-confirm-actions"><button type="button" className="button" disabled={saving} onClick={()=>{dialog.current?.close();setPlacement(null);}}>취소</button>
        <button type="button" className="button primary" disabled={saving} onClick={()=>void confirmPlacement()}>{saving?"배치 중…":"확인하고 배치"}</button></div>
      </dialog>
    </>
  );
  function card(node: OrganizationNode) {
    return (
      <button
        className="member-org-node"
        onClick={() => {
          setPath([...path, node]);
          setOffset(0);
        }}
      >
        <strong>{node.name}</strong>
        <small>{node.member_code}</small>
        <span>
          {node.has_children ? "산하 보기" : "하위 회원 없음"}
          <ChevronRight size={13} />
        </span>
      </button>
    );
  }
}
