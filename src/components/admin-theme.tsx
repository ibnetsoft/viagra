"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
type Mode = "system" | "light" | "dark";
const storageKey = "vital-admin-theme";
const Context = createContext({
  mode: "system" as Mode,
  dark: false,
  choose: (_mode: Mode) => {},
});
const bootstrap = `(function(){try{var m=localStorage.getItem('vital-admin-theme');if(m==='light'||m==='dark')document.currentScript.parentElement.dataset.adminTheme=m}catch(e){}})()`;
export default function AdminTheme({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<Mode>("system"),
    [dark, setDark] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  function apply(value: Mode) {
    setMode(value);
    const resolved =
      value === "dark" ||
      (value === "system" &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(resolved);
    if (root.current) root.current.dataset.adminTheme = value;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", resolved ? "#111c18" : "#f5f7f2");
  }
  function choose(value: Mode) {
    try {
      localStorage.setItem(storageKey, value);
    } catch {}
    apply(value);
  }
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      let value: string | null = null;
      try {
        value = localStorage.getItem(storageKey);
      } catch {}
      apply(value === "light" || value === "dark" ? value : "system");
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return (
    <Context.Provider value={{ mode, dark, choose }}>
      <div
        ref={root}
        className="admin-theme"
        data-admin-theme="system"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
        {children}
      </div>
    </Context.Provider>
  );
}
export function AdminThemeToggle() {
  const { dark, choose } = useContext(Context);
  return (
    <button
      type="button"
      className="admin-theme-toggle"
      aria-label={dark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      title={dark ? "라이트 모드" : "다크 모드"}
      onClick={() => choose(dark ? "light" : "dark")}
    >
      {dark ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
export function AdminThemeSettings() {
  const { mode, choose } = useContext(Context);
  return (
    <section className="member-card admin-theme-settings">
      <label htmlFor="admin-theme-select">화면 모드</label>
      <select
        id="admin-theme-select"
        value={mode}
        onChange={(e) => choose(e.target.value as Mode)}
      >
        <option value="system">기기 설정에 맞춤</option>
        <option value="light">라이트 모드</option>
        <option value="dark">다크 모드</option>
      </select>
      <p>선택한 모드는 이 기기에 저장됩니다.</p>
    </section>
  );
}
