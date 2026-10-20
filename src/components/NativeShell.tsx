import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Home, Sparkles, Library, BookHeart, Menu, BookOpen, TrendingUp, Settings, FileText, ShieldCheck, LogOut, X } from "lucide-react";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

/** Pages reachable from the tab bar. Everything else lives in the More sheet. */
export type ShellPage = "home" | "reels" | "store" | "library" | "memory-bank" | "history" | "settings" | "review" | "terms" | "privacy";

const tabs = [
  { page: "home", label: "Today", Icon: Home },
  { page: "reels", label: "Reels", Icon: Sparkles },
  { page: "library", label: "Library", Icon: Library },
  { page: "memory-bank", label: "Memory Bank", Icon: BookHeart },
] as const;

const titles: Record<ShellPage, string> = {
  home: "Today",
  reels: "Reels",
  store: "Verse Store",
  library: "My Library",
  "memory-bank": "Memory Bank",
  history: "Progress",
  settings: "Settings",
  review: "Review",
  terms: "Terms of Service",
  privacy: "Privacy Policy",
};

/** No-op off native so the web never reaches for the vibration API. */
export const tap = (style: ImpactStyle = ImpactStyle.Light) => {
  if (!Capacitor.isNativePlatform()) return;
  void Haptics.impact({ style }).catch(() => {});
};

type Props = {
  page: ShellPage;
  user: { name: string; email: string };
  signingOut: boolean;
  onNavigate: (page: ShellPage) => void;
  onSignOut: () => void;
  children: ReactNode;
};

/**
 * Native navigation shell: a collapsing title bar, a persistent tab bar, and the More
 * sheet that replaces the web header's hamburger menu. Rendered only on native; the web
 * keeps its own header and tabs.
 */
export default function NativeShell({ page, user, signingOut, onNavigate, onSignOut, children }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const positions = useRef<Partial<Record<ShellPage, number>>>({});
  const previous = useRef<ShellPage>(page);
  const [collapsed, setCollapsed] = useState(false);
  const [more, setMore] = useState(false);

  /* Each tab keeps its own scroll position across switches, as iOS does.
     The position is recorded continuously while scrolling rather than read at switch
     time: by the time an effect runs, React has already swapped in the new page and the
     browser has clamped scrollTop to the new content height, which would truncate the
     outgoing tab's position. Recording on scroll also covers navigations that originate
     in page content rather than the tab bar. */
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const onScroll = () => {
      positions.current[previous.current] = node.scrollTop;
      setCollapsed(node.scrollTop > 36);
    };
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => node.removeEventListener("scroll", onScroll);
  }, []);

  // Restore before paint, so the new page never flashes at the old offset.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || previous.current === page) return;
    previous.current = page;
    const restored = positions.current[page] ?? 0;
    node.scrollTop = restored;
    setCollapsed(restored > 36);
  }, [page]);

  /* Android's hardware back belongs to the sheet while it is open. App.tsx owns the
     listener, so the open state is published here and the close is relayed back. */
  useEffect(() => {
    document.body.dataset.sheetOpen = more ? "true" : "false";
    const close = () => setMore(false);
    window.addEventListener("ruminate-close-sheet", close);
    return () => {
      window.removeEventListener("ruminate-close-sheet", close);
      delete document.body.dataset.sheetOpen;
    };
  }, [more]);

  function go(next: ShellPage) {
    tap();
    if (next === page) { scroller.current?.scrollTo({ top: 0, behavior: "smooth" }); return; }
    onNavigate(next);
  }

  // Close the sheet first: a failed sign-out reports through a toast, which would
  // otherwise be raised behind the backdrop.
  function signOutFromSheet() { setMore(false); onSignOut(); }

  function fromSheet(next: ShellPage) { setMore(false); go(next); }

  const immersive = page === "reels" || page === "review";

  return (
    <div className="native-shell">
      {!immersive && (
        <div className={collapsed ? "native-bar collapsed" : "native-bar"}>
          <span className="native-bar-title">{titles[page]}</span>
        </div>
      )}

      <div className="app-shell" ref={scroller}>{children}</div>

      {page !== "review" && (
        <nav className="native-tabs">
          {tabs.map(({ page: target, label, Icon }) => (
            <button key={target} className={page === target ? "active" : ""} aria-current={page === target ? "page" : undefined} onClick={() => go(target)}>
              <Icon size={21} /><span>{label}</span>
            </button>
          ))}
          <button className={more || page === "store" || page === "history" || page === "settings" ? "active" : ""} aria-haspopup="dialog" aria-expanded={more} onClick={() => { tap(); setMore(true); }}>
            <Menu size={21} /><span>More</span>
          </button>
        </nav>
      )}

      {more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <section className="sheet" role="dialog" aria-modal="true" aria-label="More" onClick={event => event.stopPropagation()}>
            <span className="sheet-grip" />
            <button className="sheet-close" aria-label="Close" onClick={() => setMore(false)}><X size={19} /></button>
            <div className="sheet-account">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
            <div className="sheet-list">
              <button onClick={() => fromSheet("store")}><BookOpen size={19} /> Verse Store</button>
              <button onClick={() => fromSheet("history")}><TrendingUp size={19} /> Progress</button>
              <button onClick={() => fromSheet("settings")}><Settings size={19} /> Settings</button>
              <button onClick={() => fromSheet("terms")}><FileText size={19} /> Terms of Service</button>
              <button onClick={() => fromSheet("privacy")}><ShieldCheck size={19} /> Privacy Policy</button>
            </div>
            <button className="sheet-signout" disabled={signingOut} onClick={signOutFromSheet}>
              <LogOut size={18} /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
