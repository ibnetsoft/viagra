"use client";
import { useEffect, useState } from "react";
import { ChevronRight, Network, RotateCcw } from "lucide-react";
import { loadOrganization } from "@/app/actions";
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
  const root = path.at(-1)?.id ?? memberId;
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
        if (!cancelled) setData(result);
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
  }, [demo, memberId, mode, root, offset]);
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
                          <div className="member-org-vacant">미배치</div>
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
      <p className="member-explanation">
        추천 관계와 후원 배치는 각각 관리돼요. 본인 산하만 조회할 수 있으며 배치
        변경은 관리자에게 요청해 주세요.
      </p>
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
