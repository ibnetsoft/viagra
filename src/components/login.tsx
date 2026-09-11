"use client";
import { AdminThemeToggle } from "./admin-theme";
import { MemberThemeToggle } from "./member-theme";
import { useEffect, useState } from "react";
import { ArrowUpRight, Leaf } from "lucide-react";
import { authenticate, signupCenters } from "@/app/actions";
import BankFields from "./bank-fields";
export default function Login({
  connected,
  admin = false,
}: {
  connected: boolean;
  admin?: boolean;
}) {
  const [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [centers, setCenters] = useState<{id: string; name: string}[]>([]);
  const [centerError, setCenterError] = useState("");
  const [centersLoading, setCentersLoading] = useState(false);
  const [sponsor, setSponsor] = useState("");
  useEffect(() => {
    if (!signup) return;
    let active = true;
    setCentersLoading(true);
    setCenterError("");
    signupCenters().then(result => {
      if (active) { setCenters(result.centers); setCenterError(result.error ?? ""); }
    }).catch(() => { if (active) setCenterError("센터 목록을 불러오지 못했습니다."); })
      .finally(() => { if (active) setCentersLoading(false); });
    return () => { active = false; };
  }, [signup]);
  return (
    <main className={`auth-layout ${admin ? "admin-auth" : "member-auth"}`}>
      <section className="auth-story">
        <div className="brand">
          <Leaf /> 활력 파트너스
        </div>
        <div>
          <span className="eyebrow">
            {admin ? "ADMINISTRATION" : "VITAL PARTNERS"}
          </span>
          <h1>
            {admin ? "운영에 필요한" : "함께 성장하는"}
            <br />
            {admin ? "모든 관리, 한곳에." : "건강한 연결."}
          </h1>
          <p>
            {admin ? "회원, 매출, 충전, 배송까지" : "나의 구매부터 보너스까지,"}
            <br />
            {admin
              ? "관리자 전용 운영 사이트입니다."
              : "파트너 활동을 한곳에서 만나보세요."}
          </p>
        </div>
        <small>© 2026 Vital Partners</small>
      </section>
      <section className="auth-form">
        <div className="auth-inner">
          {admin && <div className="admin-login-theme"><AdminThemeToggle /></div>}
          {!admin && (
            <div className="member-login-theme">
              <MemberThemeToggle />
            </div>
          )}
          <span className="eyebrow">WELCOME TO VITAL</span>
          <h2>
            {admin
              ? "관리자 로그인"
              : signup
                ? "파트너로 시작하기"
                : "다시 만나 반갑습니다"}
          </h2>
          <p className="muted">
            {signup
              ? "주소와 계좌 정보는 선택사항입니다."
              : "아이디와 비밀번호로 로그인하세요. 기존 이메일로도 로그인할 수 있습니다."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              const form = new FormData(e.currentTarget);
              try {
                const r = await authenticate(form);
                setMessage(r.error ?? r.message ?? "");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              type="hidden"
              name="mode"
              value={signup ? "signup" : "login"}
            />
            <input
              type="hidden"
              name="portal"
              value={admin ? "admin" : "member"}
            />
            {signup ? (
              <>
                <label>
                  아이디
                  <input name="username" required minLength={4} maxLength={20}
                    pattern="[A-Za-z][A-Za-z0-9_]{3,19}" autoComplete="username"
                    autoCapitalize="none" spellCheck={false} placeholder="영문으로 시작, 4~20자" />
                </label>
                <p className="muted">영문·숫자·밑줄 사용 가능 · 대소문자 구분 없음</p>
                <label>
                  이메일 (가입 인증용)
                  <input name="email" type="email" placeholder="name@example.com" required autoComplete="email" />
                </label>
              </>
            ) : (
              <label>
                아이디 또는 이메일
                <input name="identifier" type="text" placeholder="아이디 또는 이메일" required
                  maxLength={254} autoComplete="username" autoCapitalize="none" spellCheck={false} />
              </label>
            )}
            <label>
              비밀번호
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={128}
                placeholder="8자 이상 입력"
                required
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </label>
            {signup && (
              <>
                <div className="form-grid">
                  <label>
                    이름
                    <input
                      name="name"
                      required
                      maxLength={80}
                      autoComplete="name"
                    />
                  </label>
                  <label>
                    연락처
                    <input
                      name="phone"
                      required
                      type="tel"
                      pattern="[0-9+\- ]{9,20}"
                      autoComplete="tel"
                      placeholder="010-1234-5678"
                    />
                  </label>
                </div>
                <label>
                  우편번호 (선택)
                  <input
                    name="postcode"
                    pattern="[0-9]{5}"
                    maxLength={5}
                    autoComplete="postal-code"
                    placeholder="5자리 우편번호"
                  />
                </label>
                <label>
                  기본 주소 (선택)
                  <input
                    name="address"
                    maxLength={200}
                    autoComplete="address-line1"
                    placeholder="도로명 및 건물번호"
                  />
                </label>
                <label>
                  상세 주소 (선택)
                  <input
                    name="address_detail"
                    maxLength={200}
                    autoComplete="address-line2"
                    placeholder="동·호수 등"
                  />
                </label>
                <h3>추천·후원·센터 (선택)</h3>
                <label>
                  추천인 아이디
                  <input name="referrer_username" placeholder="추천인의 로그인 아이디" maxLength={20}
                    pattern="[A-Za-z][A-Za-z0-9_]{3,19}" autoCapitalize="none" spellCheck={false} autoComplete="off" />
                </label>
                <label>
                  후원인 아이디
                  <input name="sponsor_username" placeholder="후원인의 로그인 아이디" maxLength={20}
                    pattern="[A-Za-z][A-Za-z0-9_]{3,19}" autoCapitalize="none" spellCheck={false} autoComplete="off"
                    value={sponsor} onChange={e => setSponsor(e.target.value)} />
                </label>
                {sponsor.trim() && <label>
                  후원 자리
                  <select name="sponsor_position" required defaultValue="">
                    <option value="" disabled>좌·우 자리를 선택하세요</option>
                    <option value="L">좌측</option><option value="R">우측</option>
                  </select>
                </label>}
                <label>
                  센터
                  <select name="signup_center_id" defaultValue="" disabled={centersLoading}>
                    <option value="">{centersLoading ? "센터 목록 불러오는 중…" : "선택 안 함"}</option>
                    {centers.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}
                  </select>
                </label>
                {centerError && <p className="notice" role="status">{centerError}</p>}
                <p className="muted">추천인과 후원인은 다르게 입력할 수 있습니다. 비워 두면 가입 후 관리자가 지정할 수 있습니다.</p>
                <h3>계좌 정보 (선택)</h3>
                <BankFields required={false} />
              </>
            )}
            {message && (
              <p className="notice" role="status">
                {message}
              </p>
            )}
            {!connected && (
              <p className="notice">
                미리보기 상태입니다. 실제 가입은 Supabase 연결 후 가능합니다.
              </p>
            )}
            <button
              className="button primary wide"
              disabled={busy || !connected}
            >
              {busy ? "처리 중…" : signup ? "가입하기" : "로그인"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          {!admin && (
            <button
              className="text-button"
              onClick={() => {
                setSignup(!signup);
                setMessage("");
              }}
            >
              {signup ? "이미 회원이신가요? 로그인" : "처음이신가요? 회원가입"}
            </button>
          )}
          {!connected && (
            <a className="demo-link" href={admin ? "/admin" : "/app"}>
              {admin ? "관리자 사이트 미리보기 →" : "회원 웹앱 미리보기 →"}
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
