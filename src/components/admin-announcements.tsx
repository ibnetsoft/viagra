"use client";
import { useEffect, useState } from "react";
import type { Member } from "@/lib/domain";
import {
  noticeAdminList,
  saveNotice,
  publishNotice,
} from "@/app/notification-actions";
type Notice = {
  id: string;
  title: string;
  body: string;
  target_mode: "all" | "selected";
  target_ids: string[];
  push_enabled: boolean;
  status: string;
  revision: number;
  recipients?: number;
  reads?: number;
  push_pending?: number;
  push_sent?: number;
  push_failed?: number;
};
const empty = (): Notice => ({
  id: crypto.randomUUID(),
  title: "",
  body: "",
  target_mode: "all",
  target_ids: [],
  push_enabled: true,
  status: "draft",
  revision: 1,
});
export const demoNoticeKey = "vital-demo-notices-v1";
export default function AdminAnnouncements({
  demo,
  members,
}: {
  demo: boolean;
  members: Member[];
}) {
  const [list, setList] = useState<Notice[]>([]),
    [form, setForm] = useState<Notice | null>(null),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const active = members.filter((m) => m.status === "active");
  async function load() {
    try {
      setList(
        demo
          ? JSON.parse(localStorage.getItem(demoNoticeKey) || "[]")
          : await noticeAdminList(),
      );
    } catch {
      setMessage("공지를 불러오지 못했습니다. 새로고침해 주세요.");
    }
  }
  useEffect(() => {
    void load();
  }, [demo]); // eslint-disable-line react-hooks/exhaustive-deps
  function demoSave(value: Notice) {
    const items = JSON.parse(
      localStorage.getItem(demoNoticeKey) || "[]",
    ) as Notice[];
    const next = [value, ...items.filter((a) => a.id !== value.id)];
    localStorage.setItem(demoNoticeKey, JSON.stringify(next));
    setList(next);
  }
  async function save(showPreview: boolean) {
    if (!form || busy) return;
    if (
      !form.title.trim() ||
      !form.body.trim() ||
      (form.target_mode === "selected" && !form.target_ids.length)
    ) {
      setMessage("제목, 내용과 수신 대상을 입력하세요.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const version = demo
        ? { revision: form.revision + 1 }
        : await saveNotice(form);
      const next = { ...form, ...version };
      if (demo) demoSave(next);
      setForm(next);
      setPreview(showPreview);
      if (!showPreview)
        setMessage("임시 저장했습니다. 아직 발송되지 않았습니다.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!form || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const targets =
        form.target_mode === "all" ? active.map((m) => m.id) : form.target_ids;
      const count = demo
        ? targets.length
        : await publishNotice(form.id, form.revision);
      if (demo)
        demoSave({
          ...form,
          target_ids: targets,
          status: "published",
          recipients: count,
        });
      setForm(null);
      setPreview(false);
      setMessage(
        `${count}명에게 앱 공지를 발송했습니다. 허용된 기기의 푸시는 순서대로 전송됩니다.`,
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "발송하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notice-admin">
      <div className="notice-row">
        <button
          className="primary"
          onClick={() => {
            setForm(empty());
            setPreview(false);
            setMessage("");
          }}
        >
          새 공지 작성
        </button>
        <button onClick={() => void load()}>내역 새로고침</button>
      </div>
      {message && <p role="status">{message}</p>}
      {form && (
        <div className="notice-card">
          <h2>{preview ? "발송 전 확인" : "공지 작성"}</h2>
          {preview ? (
            <>
              <p>
                수신:{" "}
                {form.target_mode === "all"
                  ? `정상 회원 전체 (${active.length}명)`
                  : `선택한 회원 ${form.target_ids.length}명`}
              </p>
              <p>
                기기 푸시:{" "}
                {form.push_enabled ? "허용한 기기에 전송" : "사용 안 함"}
              </p>
              <h3>{form.title}</h3>
              <p className="notice-body">{form.body}</p>
              <p>
                발송하면 회원 알림함에 등록됩니다. 발송한 내용은 수정할 수
                없습니다.
              </p>
              <div className="notice-row">
                <button disabled={busy} onClick={() => setPreview(false)}>
                  돌아가서 수정
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void publish()}
                >
                  {busy ? "발송 중…" : "발송 확정"}
                </button>
              </div>
            </>
          ) : (
            <>
              <label>
                제목
                <input
                  value={form.title}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                내용
                <textarea
                  rows={7}
                  value={form.body}
                  maxLength={5000}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </label>
              <label>
                수신 대상
                <select
                  aria-label="수신 대상"
                  value={form.target_mode}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      target_mode: e.target.value as Notice["target_mode"],
                    })
                  }
                >
                  <option value="all">정상 회원 전체</option>
                  <option value="selected">회원 선택 (최대 500명)</option>
                </select>
              </label>
              {form.target_mode === "selected" && (
                <div className="notice-targets">
                  {active.map((m) => (
                    <label key={m.id}>
                      <input
                        type="checkbox"
                        checked={form.target_ids.includes(m.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            target_ids: e.target.checked
                              ? [...form.target_ids, m.id]
                              : form.target_ids.filter((id) => id !== m.id),
                          })
                        }
                      />
                      {m.name} · {m.member_code}
                    </label>
                  ))}
                </div>
              )}
              <label className="notice-check">
                <input
                  type="checkbox"
                  checked={form.push_enabled}
                  onChange={(e) =>
                    setForm({ ...form, push_enabled: e.target.checked })
                  }
                />{" "}
                기기 푸시도 전송
              </label>
              <p>
                알림 수신을 허용한 기기에만 전송됩니다. 모든 대상자는 앱
                알림함에서 확인할 수 있습니다.
              </p>
              <div className="notice-row">
                <button disabled={busy} onClick={() => void save(false)}>
                  임시 저장
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void save(true)}
                >
                  저장하고 발송 미리보기
                </button>
                <button disabled={busy} onClick={() => setForm(null)}>
                  닫기
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <h2>공지 내역</h2>
      <p>
        최근 100건 · 푸시 전송 수는 푸시 서비스가 접수한 기기 수입니다. 실제
        읽음은 별도로 집계합니다.
      </p>
      {!list.length && (
        <div className="notice-card">등록된 공지가 없습니다.</div>
      )}
      {list.map((a) => (
        <article className="notice-card" key={a.id}>
          <div className="notice-row">
            <h3>{a.title}</h3>
            <span>{a.status === "draft" ? "임시 저장" : "발송 완료"}</span>
          </div>
          <p className="notice-body">{a.body}</p>
          {a.status === "draft" ? (
            <button
              onClick={() => {
                setForm(a);
                setPreview(false);
              }}
            >
              계속 작성
            </button>
          ) : (
            <p>
              수신 {a.recipients || 0}명 · 읽음 {a.reads || 0}명 · 푸시 접수{" "}
              {a.push_sent || 0}기기 / 대기 {a.push_pending || 0} / 미전송{" "}
              {a.push_failed || 0}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
