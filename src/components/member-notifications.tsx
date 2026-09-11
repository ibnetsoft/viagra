"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  memberNotices,
  unreadNoticeCount,
  readNotice,
  pushConfig,
  pushStatus,
  enablePush,
  disablePush,
} from "@/app/notification-actions";
type Item = {
  read_at: string | null;
  announcements: {
    id: string;
    title: string;
    body: string;
    published_at?: string;
  };
};
const key = "vital-demo-notices-v1";
function demoItems(memberId: string): Item[] {
  const read: string[] = JSON.parse(
    localStorage.getItem(key + "-read-" + memberId) || "[]",
  );
  return JSON.parse(localStorage.getItem(key) || "[]")
    .filter(
      (a: { status: string; target_ids: string[] }) =>
        a.status === "published" && a.target_ids.includes(memberId),
    )
    .map((a: Item["announcements"]) => ({
      announcements: a,
      read_at: read.includes(a.id) ? "read" : null,
    }));
}
export default function MemberNotifications({
  demo,
  memberId,
  inbox = false,
}: {
  demo: boolean;
  memberId: string;
  inbox?: boolean;
}) {
  const linked = useRef(false);
  const [items, setItems] = useState<Item[]>([]),
    [unread, setUnread] = useState(0),
    [page, setPage] = useState(0),
    [open, setOpen] = useState<string | null>(null),
    [error, setError] = useState("");
  async function load(current = page) {
    try {
      if (demo) {
        const all = demoItems(memberId);
        setUnread(all.filter((i) => !i.read_at).length);
        setItems(all.slice(current * 30, current * 30 + 30));
      } else if (!inbox) {
        setUnread(await unreadNoticeCount());
      } else {
        const result = await memberNotices(current);
        setItems(result.items as unknown as Item[]);
        setUnread(result.unread);
      }
      setError("");
    } catch {
      setError("알림을 불러오지 못했습니다.");
    }
  }
  useEffect(() => {
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("notice-read", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("notice-read", refresh);
    };
  }, [page, demo, memberId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function mark(id: string | null) {
    try {
      if (demo) {
        const read: string[] = JSON.parse(
          localStorage.getItem(key + "-read-" + memberId) || "[]",
        );
        localStorage.setItem(
          key + "-read-" + memberId,
          JSON.stringify([
            ...new Set([
              ...read,
              ...(id
                ? [id]
                : demoItems(memberId).map((i) => i.announcements.id)),
            ]),
          ]),
        );
      } else await readNotice(id);
      await load();
      window.dispatchEvent(new Event("notice-read"));
    } catch {
      setError("읽음 처리하지 못했습니다. 다시 시도하세요.");
    }
  }
  useEffect(() => {
    if (!inbox || linked.current) return;
    const id = new URLSearchParams(window.location.search).get("id");
    const item = items.find((i) => i.announcements.id === id);
    if (!item || !id) return;
    linked.current = true;
    setOpen(id);
    if (!item.read_at) void mark(id);
  }, [items, inbox]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!inbox)
    return (
      <Link
        href="/app/notifications"
        className="notice-bell"
        aria-label={`알림함${unread ? ` · 읽지 않은 알림 ${unread}개` : ""}`}
      >
        <Bell size={22} />
        {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
      </Link>
    );
  return (
    <section>
      <h1>알림함</h1>
      <MemberPush demo={demo} />
      <div className="notice-row">
        <p>읽지 않은 공지 {unread}개</p>
        <button onClick={() => void mark(null)} disabled={!unread}>
          모두 읽음
        </button>
      </div>
      {error && (
        <p role="alert">
          {error} <button onClick={() => void load()}>다시 시도</button>
        </p>
      )}
      {!error && !items.length && (
        <div className="notice-card">도착한 공지가 없습니다.</div>
      )}
      {items.map((i) => (
        <article key={i.announcements.id} className="notice-card">
          <button
            className="notice-title"
            aria-expanded={open === i.announcements.id}
            onClick={() => {
              setOpen(open === i.announcements.id ? null : i.announcements.id);
              if (!i.read_at) void mark(i.announcements.id);
            }}
          >
            {!i.read_at && <span className="notice-dot" />}{" "}
            {i.announcements.title}
          </button>
          {i.announcements.published_at && (
            <small>
              {new Date(i.announcements.published_at).toLocaleString("ko-KR")}
            </small>
          )}
          {open === i.announcements.id && (
            <p className="notice-body">{i.announcements.body}</p>
          )}
        </article>
      ))}
      <div className="notice-row">
        <button disabled={!page} onClick={() => setPage(page - 1)}>
          이전
        </button>
        <span>{page + 1}페이지</span>
        <button disabled={items.length < 30} onClick={() => setPage(page + 1)}>
          다음
        </button>
      </div>
    </section>
  );
}
function MemberPush({ demo }: { demo: boolean }) {
  const [publicKey, setKey] = useState(""),
    [sid, setSid] = useState<string | null>(null),
    [supported, setSupported] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("기기 설정을 확인하고 있습니다.");
  useEffect(() => {
    void (async () => {
      if (demo) {
        setMessage("미리보기에서는 기기 푸시를 보내지 않습니다.");
        return;
      }
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setMessage(
          "이 브라우저에서는 푸시를 지원하지 않습니다. 아이폰은 Safari에서 홈 화면에 추가한 앱으로 열어주세요.",
        );
        return;
      }
      setSupported(true);
      try {
        const value = await pushConfig();
        setKey(value);
        if (!value) {
          setMessage(
            "기기 푸시를 준비 중입니다. 앱 알림함은 이용할 수 있습니다.",
          );
          return;
        }
        const reg = await navigator.serviceWorker.register("/app/sw.js", {
          scope: "/app/",
          updateViaCache: "none",
        });
        const sub = await reg.pushManager.getSubscription();
        const id = sub ? await pushStatus(sub.endpoint) : null;
        setSid(id);
        setMessage(
          id
            ? "이 기기에서 공지 알림을 받고 있습니다."
            : "이 기기에서 공지 알림을 받아보세요.",
        );
      } catch {
        setMessage("기기 설정을 불러오지 못했습니다. 새로고침해 주세요.");
      }
    })();
  }, [demo]);
  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const permission = sid
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          "알림이 허용되지 않았습니다. 브라우저의 사이트 알림 설정에서 변경할 수 있습니다.",
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sid) {
        await disablePush(sid);
        await sub?.unsubscribe();
        setSid(null);
        setMessage("이 기기의 푸시 알림을 껐습니다.");
      } else {
        const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        if (sub && !(await pushStatus(sub.endpoint))) {
          await sub.unsubscribe();
          sub = null;
        }
        sub ??= await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: bytes,
        });
        try {
          setSid(await enablePush(sub.toJSON()));
        } catch (e) {
          await sub.unsubscribe();
          throw e;
        }
        setMessage("이 기기에서 공지 알림을 받습니다.");
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "기기 설정을 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="notice-card">
      <h3>기기 알림</h3>
      <p role="status">{message}</p>
      {supported && publicKey && (
        <button onClick={() => void toggle()} disabled={busy}>
          {busy ? "설정 중…" : sid ? "이 기기 알림 끄기" : "이 기기 알림 켜기"}
        </button>
      )}
      <small>
        아이폰은 Safari에서 공유 → 홈 화면에 추가한 앱을 열고 알림을 켜주세요.
      </small>
      <small>푸시를 끄더라도 공지는 이 알림함에서 확인할 수 있습니다.</small>
    </div>
  );
}
