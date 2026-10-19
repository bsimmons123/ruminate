import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookHeart, Bookmark, BookOpen, Check, Download, Flame, History, Home, Layers3, Library, LogOut, Menu, Plus, Search, Settings, Share, Sparkles, Trash2, UserRound, WifiOff, X } from "lucide-react";
import { packs, verses } from "./data";
import { getLibrary, getPassages, getReviews, getSettings, getUsers, removeItem, saveItem, savePassage, saveReview, saveSettings, saveUser, scheduledItem } from "./db";
import { bibleBooks, DEFAULT_TRANSLATION, fetchBibleBook, fetchPassage, fetchPassageVerses, translations } from "./bible";
import { esvStoredCount, parseEsvReference } from "./esvCompliance";
import { hashPassword, SESSION_KEY } from "./auth";
import { shouldOfferInstall } from "./installPrompt";
import { apiCollections, apiCommunityTags, apiCurrentUser, apiDelete, apiDeleteAccount, apiItems, apiPut, apiSignIn, apiSignOut, apiSignUp, apiSyncPending, serverEnabled } from "./api";
import type { ConnectionState } from "./api";
import { currentPushToken, disablePush, enablePush, isNativeApp } from "./nativePush";
import { App as NativeApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { MemoryBankPage } from "./components/MemoryBankPage";
import NativeShell, { tap } from "./components/NativeShell";
import { ImpactStyle } from "@capacitor/haptics";
import type { CommunityCollection, LibraryItem, ReviewRating, ReviewResult, Translation, User, UserSettings, Verse } from "./types";

type Page = "home" | "reels" | "store" | "library" | "memory-bank" | "history" | "settings" | "review";
type ExerciseSummary = Pick<ReviewResult, "mode" | "correct" | "total" | "percentage" | "answers">;

const starterIds = ["ps-46-10", "prov-3-5-6", "john-3-16"];
const isMemorized = (item: LibraryItem) => item.memorized ?? item.stage >= 6;
const normalizeTranslation = (value: string | undefined): Translation => translations.some(item => item.id === value) ? value as Translation : DEFAULT_TRANSLATION;

function reviewStreak(results: ReviewResult[]) {
  const days = new Set(results.map(result => { const date = new Date(result.reviewedAt); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }));
  if (!days.size) return 0;
  const cursor = new Date(); cursor.setHours(12, 0, 0, 0);
  const key = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  if (!days.has(key(cursor))) { cursor.setDate(cursor.getDate() - 1); if (!days.has(key(cursor))) return 0; }
  let streak = 0;
  while (days.has(key(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

function App() {
  const [page, setPage] = useState<Page>("home");
  const currentPage = useRef<Page>("home");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [catalog, setCatalog] = useState<Verse[]>(verses);
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setUserSettings] = useState<UserSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState("");
  const [offlineReader, setOfflineReader] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All");
  const [toast, setToast] = useState("");
  const reviewSaving = useRef(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [quizIds, setQuizIds] = useState<string[] | null>(null);
  const [reviewReturn, setReviewReturn] = useState<Page>("home");
  const [menu, setMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [connection, setConnection] = useState<ConnectionState>({ mode: navigator.onLine ? "online" : "offline", pending: 0 });

  useEffect(() => {
    async function load() {
      let items: LibraryItem[] = []; let customPassages: Verse[] = []; let pastReviews: ReviewResult[] = []; let users: User[] = []; let savedSettings: UserSettings[] = [];
      if (!serverEnabled) [items, customPassages, pastReviews, users, savedSettings] = await Promise.all([getLibrary(), getPassages(), getReviews(), getUsers(), getSettings()]);
      const sessionId = localStorage.getItem(SESSION_KEY);
      const activeUser = serverEnabled ? await apiCurrentUser() : users.find(candidate => candidate.id === sessionId) || null;
      if (serverEnabled && activeUser) {
        [items, customPassages, pastReviews, savedSettings] = await Promise.all([apiItems<LibraryItem>("library"), apiItems<Verse>("passage"), apiItems<ReviewResult>("review"), apiItems<UserSettings>("settings")]);
      }
      setUser(activeUser);
      if (!activeUser) { setReady(true); return; }
      if (activeUser) { const saved = savedSettings.find(value => value.userId === activeUser.id); setUserSettings(saved ? { ...saved, translation: normalizeTranslation(saved.translation) } : { userId: activeUser.id, translation: DEFAULT_TRANSLATION, dailyGoal: 5, theme: "light", reminders: false }); }
      setCatalog([...verses, ...customPassages.filter(custom => !verses.some(seed => seed.id === custom.id))]);
      setHistory(pastReviews.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)));
      if (!items.length) {
        const seeded = starterIds.map((verseId, index): LibraryItem => ({ verseId, addedAt: new Date().toISOString(), stage: 1, reviews: index, nextReview: new Date().toISOString(), collection: index === 0 ? "Peace & Rest" : "My Verses" }));
        await Promise.all(seeded.map(item => serverEnabled ? apiPut("library", item.verseId, item) : saveItem(item)));
        setLibrary(seeded);
      } else setLibrary(items);
      setReady(true);
    }
    void load().catch(error => { if (error.status === 401) { setStartupError(""); setUser(null); } else setStartupError(error instanceof Error ? error.message : "Ruminate could not load your library."); setReady(true); });
  }, []);
  useEffect(() => { const update = () => { setOnline(navigator.onLine); if (navigator.onLine) void apiSyncPending(); }; window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);
  useEffect(() => {
    const status = (event: Event) => setConnection((event as CustomEvent<ConnectionState>).detail);
    const expired = () => { setUser(null); setUserSettings(null); setLibrary([]); setHistory([]); setCatalog(verses); setQuizIds(null); setPage("home"); setMenu(false); setStartupError(""); setReady(true); };
    window.addEventListener("ruminate-connection", status); window.addEventListener("ruminate-session-expired", expired);
    return () => { window.removeEventListener("ruminate-connection", status); window.removeEventListener("ruminate-session-expired", expired); };
  }, []);
  useEffect(() => {
    if (!user) return;
    const refreshed = async (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail.userId !== user.id) return;
      try {
        const [items, passages, reviews, preferences] = await Promise.all([apiItems<LibraryItem>("library"), apiItems<Verse>("passage"), apiItems<ReviewResult>("review"), apiItems<UserSettings>("settings")]);
        setLibrary(items); setCatalog([...verses, ...passages.filter(value => !verses.some(seed => seed.id === value.id))]);
        setHistory(reviews.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)));
        if (preferences[0]) setUserSettings({ ...preferences[0], translation: normalizeTranslation(preferences[0].translation) });
        notify("Saved practice synced");
      } catch { /* Queued changes remain on this device for another sync attempt. */ }
    };
    const retry = () => { if (navigator.onLine && document.visibilityState === "visible" && (connection.pending || connection.mode === "offline")) void apiSyncPending(); };
    const timer = window.setInterval(retry, 30000);
    window.addEventListener("ruminate-sync-complete", refreshed); document.addEventListener("visibilitychange", retry);
    return () => { window.clearInterval(timer); window.removeEventListener("ruminate-sync-complete", refreshed); document.removeEventListener("visibilitychange", retry); };
  }, [user?.id, connection.pending, connection.mode]);
  useEffect(() => { if (user && settings?.reminders && online && connection.mode === "online") void enablePush().catch(error => console.error("Push registration unavailable", error)); }, [user?.id, settings?.reminders, online, connection.mode]);
  useEffect(() => { const openReview = () => { setQuizIds(null); setReviewReturn("home"); setReviewIndex(0); setPage("review"); }; window.addEventListener("selah-open-review", openReview); return () => window.removeEventListener("selah-open-review", openReview); }, []);
  useEffect(() => { currentPage.current = page; }, [page]);
  useEffect(() => { if (!isNativeApp || Capacitor.getPlatform() !== "android") return; let disposed = false; let remove: (() => Promise<void>) | undefined; void NativeApp.addListener("backButton", () => { if (document.body.dataset.sheetOpen === "true") { window.dispatchEvent(new Event("ruminate-close-sheet")); return; } if (currentPage.current === "home") void NativeApp.exitApp(); else { setPage("home"); setMenu(false); } }).then(handle => { if (disposed) void handle.remove(); else remove = () => handle.remove(); }); return () => { disposed = true; void remove?.(); }; }, []);

  const due = library.filter(item => new Date(item.nextReview) <= new Date());
  const streak = reviewStreak(history);
  const reviewItems = quizIds ? quizIds.flatMap(id => { const item = library.find(value => value.verseId === id); return item ? [item] : []; }) : library;
  const memorizedItems = library.filter(item => isMemorized(item) && catalog.some(verse => verse.id === item.verseId));
  const verseFor = (id: string) => catalog.find(v => v.id === id)!;
  const topics = ["All", ...Array.from(new Set(catalog.flatMap(v => v.topics)))];
  const filtered = useMemo(() => catalog.filter(v => {
    const haystack = `${v.reference} ${v.text} ${v.topics.join(" ")} ${v.pack}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (topic === "All" || v.topics.includes(topic));
  }), [query, topic, catalog]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }

  async function toggleVerse(verse: Verse) {
    const existing = library.find(item => item.verseId === verse.id);
    if (existing) {
      if (serverEnabled) await apiDelete("library", verse.id); else await removeItem(verse.id);
      setLibrary(items => items.filter(item => item.verseId !== verse.id));
      notify(`${verse.reference} removed`);
    } else {
      const item: LibraryItem = { verseId: verse.id, addedAt: new Date().toISOString(), stage: 1, reviews: 0, nextReview: new Date().toISOString(), collection: "My Verses" };
      if (serverEnabled) await apiPut("library", item.verseId, item); else await saveItem(item);
      setLibrary(items => [...items, item]);
      notify(`${verse.reference} added to your library`);
    }
  }

  async function importVerse(verse: Verse) {
    if (verse.translation === "ESV") {
      const incoming = parseEsvReference(verse.reference);
      const stored = esvStoredCount(catalog.filter(v => v.translation === "ESV").map(v => v.reference), incoming.book);
      if (!catalog.some(v => v.id === verse.id) && stored + incoming.count > incoming.storageLimit) {
        throw new Error(`Local ESV storage is limited to ${incoming.storageLimit} verses from ${incoming.book} (half the book). Remove an ESV passage from that book before adding this one.`);
      }
    }
    if (serverEnabled) await apiPut("passage", verse.id, verse); else await savePassage(verse);
    setCatalog(current => [...current.filter(v => v.id !== verse.id), verse]);
    if (!library.some(item => item.verseId === verse.id)) {
      const item: LibraryItem = { verseId: verse.id, addedAt: new Date().toISOString(), stage: 1, reviews: 0, nextReview: new Date().toISOString(), collection: "Bible Browser" };
      if (serverEnabled) await apiPut("library", item.verseId, item); else await saveItem(item); setLibrary(current => [...current, item]);
    }
    notify(`${verse.reference} (${verse.translation}) added`);
  }

  async function addCollection(name: string, verseIds?: string[]) {
    const packVerses = verseIds ? catalog.filter(v => verseIds.includes(v.id)) : verses.filter(v => v.pack === name);
    const existing = new Set(library.map(i => i.verseId));
    const additions = packVerses.filter(v => !existing.has(v.id)).map(v => ({ verseId: v.id, addedAt: new Date().toISOString(), stage: 1, reviews: 0, nextReview: new Date().toISOString(), collection: name }));
    await Promise.all(additions.map(item => serverEnabled ? apiPut("library", item.verseId, item) : saveItem(item)));
    setLibrary(items => [...items, ...additions]);
    notify(additions.length ? `${additions.length} verses added` : "This collection is already in your library");
  }

  async function updateLibraryItem(item: LibraryItem) { try { if (serverEnabled) await apiPut("library", item.verseId, item); else await saveItem(item); setLibrary(current => current.map(value => value.verseId === item.verseId ? item : value)); } catch (error) { notify("Could not save this verse. Please try again."); throw error; } }

  async function rate(rating: ReviewRating, summary: ExerciseSummary) {
    const current = reviewItems[reviewIndex];
    if (!current || reviewSaving.current) return;
    reviewSaving.current = true;
    try {
      const updated = scheduledItem(current, rating);
      updated.memorized = isMemorized(current) || (updated.stage >= 6 && summary.percentage >= 90 && (rating === "good" || rating === "easy"));
      if (serverEnabled) { const saved = await apiPut("library", updated.verseId, updated, 1); Object.assign(updated, saved.data); } else await saveItem(updated);
      const result: ReviewResult = { id: crypto.randomUUID(), verseId: current.verseId, reviewedAt: new Date().toISOString(), rating, ...summary };
      if (serverEnabled) await apiPut("review", result.id, result); else await saveReview(result);
      setHistory(results => [result, ...results]);
      setLibrary(items => items.map(item => item.verseId === updated.verseId ? updated : item));
      if (reviewIndex < reviewItems.length - 1) {
        setReviewIndex(i => i + 1);
      } else {
        setReviewIndex(0);
        setPage(reviewReturn);
        setQuizIds(null);
        notify(quizIds ? "Memory Bank quiz complete" : "Review complete — well done");
      }
    } catch { notify("Could not save your review. Please try again."); }
    finally { reviewSaving.current = false; }
  }

  function navigate(next: Page) {
    if (next === "review") { setReviewIndex(0); setQuizIds(null); setReviewReturn("home"); }
    setPage(next); setMenu(false); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startMemoryQuiz(items: LibraryItem[]) {
    if (!items.length) return;
    setQuizIds(shuffle(items.map(item => item.verseId))); setReviewIndex(0); setReviewReturn("memory-bank"); setPage("review"); setMenu(false);
    window.scrollTo({ top: 0 });
  }

  if (offlineReader) return <ReelsPage catalog={[]} library={[]} translation="WEB" readOnly onBack={() => setOfflineReader(false)} onPin={() => {}} onImport={async () => {}} />;
  if (!ready) return <div className="loading"><span>Ruminate</span><i /><button className="offline-reading" onClick={() => setOfflineReader(true)}>Read Bible offline</button></div>;
  if (startupError) return <main className="empty"><BookOpen/><h1>Could not open Ruminate</h1><p>{startupError}</p><button className="primary" onClick={() => window.location.reload()}>Try again</button><button className="offline-reading" onClick={() => setOfflineReader(true)}>Read Bible offline</button></main>;
  if (!user) return <AuthPage onReadOffline={() => setOfflineReader(true)} onAuthenticated={async activeUser => {
    localStorage.setItem(SESSION_KEY, activeUser.id);
    const [savedLibrary, savedPassages, savedReviews, savedPreferences] = await Promise.all([apiItems<LibraryItem>("library"), apiItems<Verse>("passage"), apiItems<ReviewResult>("review"), apiItems<UserSettings>("settings")]);
    let nextLibrary = savedLibrary;
    if (!nextLibrary.length) { nextLibrary = starterIds.map((verseId, index) => ({ verseId, addedAt: new Date().toISOString(), stage: 1, reviews: index, nextReview: new Date().toISOString(), collection: index === 0 ? "Peace & Rest" : "My Verses" })); await Promise.all(nextLibrary.map(item => apiPut("library", item.verseId, item))); }
    const defaults: UserSettings = { userId: activeUser.id, translation: DEFAULT_TRANSLATION, dailyGoal: 5, theme: "light", reminders: false };
    setLibrary(nextLibrary); setCatalog([...verses, ...savedPassages]); setHistory(savedReviews.sort((a,b) => b.reviewedAt.localeCompare(a.reviewedAt))); setUserSettings(savedPreferences[0] ? { ...savedPreferences[0], translation: normalizeTranslation(savedPreferences[0].translation) } : defaults);
    if (!savedPreferences[0]) await apiPut("settings", "preferences", defaults);
    setUser(activeUser); setPage("home");
  }} />;

  async function updateSettings(next: UserSettings) { if (isNativeApp && next.reminders && online && connection.mode === "online" && !await enablePush()) { notify("Could not enable reminders. Check notification permission and connection."); return; } if (isNativeApp && !next.reminders && settings?.reminders) await disablePush(); if (serverEnabled) await apiPut("settings", "preferences", next); else await saveSettings(next); setUserSettings(next); notify("Settings saved"); }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try { if (serverEnabled) await apiSignOut(isNativeApp ? currentPushToken() : null); }
    catch (error) { console.error("Could not invalidate the session", error); notify("Could not sign out. Check your connection and try again."); setSigningOut(false); return; }
    if (isNativeApp) await disablePush(false);
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setUserSettings(null);
    setLibrary([]);
    setQuizIds(null);
    setHistory([]);
    setCatalog(verses);
    setMenu(false);
    setPage("home");
    setSigningOut(false);
  }

  /* Deletion is permanent. The server removes the account and cascades its data; this
     clears the same local state sign-out does, so nothing survives on the device. */
  async function deleteAccount() {
    if (isNativeApp) await disablePush(false).catch(() => {});
    await apiDeleteAccount();
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
    setUserSettings(null);
    setLibrary([]);
    setQuizIds(null);
    setHistory([]);
    setCatalog(verses);
    setMenu(false);
    setPage("home");
    notify("Your account and all its data have been deleted.");
  }

  const content = (
    <>
      {!isNativeApp && page !== "reels" && <header>
        <button className="brand" onClick={() => navigate("home")}><span className="brand-mark">R</span><span>Ruminate<small>scripture memory</small></span></button>
        <nav className={menu ? "open" : ""}>
          <div className="mobile-account"><strong>{user.name}</strong><span>{user.email}</span></div>
          <button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}>Today</button>
          <button onClick={() => navigate("reels")}>Reels</button>
          <button className={page === "store" ? "active" : ""} onClick={() => navigate("store")}>Verse Store</button>
          <button className={page === "library" ? "active" : ""} onClick={() => navigate("library")}>My Library</button>
          <button className={page === "memory-bank" ? "active" : ""} onClick={() => navigate("memory-bank")}>Memory Bank</button>
          <button className={page === "history" ? "active" : ""} onClick={() => navigate("history")}>Progress</button>
          <button className={page === "settings" ? "active" : ""} onClick={() => navigate("settings")}>Settings</button>
          <button className="mobile-signout" disabled={signingOut} onClick={() => void signOut()}><LogOut size={18}/> {signingOut ? "Signing out…" : "Sign out"}</button>
        </nav>
        <div className="header-actions"><button className="streak" title={streak ? `${streak} consecutive review ${streak === 1 ? "day" : "days"}` : "Complete a review to begin your streak"}><Flame size={16} /> {streak} {streak === 1 ? "day" : "days"}</button><button className="avatar" onClick={() => navigate("settings")}>{user.name.split(" ").map(part => part[0]).join("").slice(0,2).toUpperCase()}</button><button className="menu" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu(v => !v)}>{menu ? <X /> : <Menu />}</button></div>
      </header>}

      <main>
        {page === "home" && <HomePage due={due.length} streak={streak} library={library} verseFor={verseFor} onReview={() => navigate("review")} onStore={() => navigate("store")} />}
        {page === "reels" && <ReelsPage catalog={catalog} library={library} translation={settings?.translation || DEFAULT_TRANSLATION} onBack={() => navigate("home")} onPin={toggleVerse} onImport={importVerse} />}
        {page === "store" && <StorePage filtered={filtered} topics={topics} topic={topic} query={query} library={library} preferredTranslation={settings?.translation || DEFAULT_TRANSLATION} onQuery={setQuery} onTopic={setTopic} onToggle={toggleVerse} onCollection={addCollection} onImport={importVerse} />}
        {page === "library" && <LibraryPage library={library} verseFor={verseFor} onRemove={toggleVerse} onUpdate={updateLibraryItem} onReview={() => navigate("review")} onStore={() => navigate("store")} />}
        {page === "memory-bank" && <MemoryBankPage items={memorizedItems} verseFor={verseFor} onQuiz={startMemoryQuiz} onLibrary={() => navigate("library")} onUpdate={updateLibraryItem} />}
        {page === "history" && <HistoryPage history={history} verseFor={verseFor} />}
        {page === "settings" && settings && <SettingsPage user={user} settings={settings} onSave={updateSettings} onSignOut={signOut} signingOut={signingOut} onDeleteAccount={deleteAccount} />}
        {page === "review" && <ReviewPage key={reviewItems[reviewIndex]?.verseId} items={reviewItems} index={reviewIndex} verse={reviewItems[reviewIndex] ? verseFor(reviewItems[reviewIndex].verseId) : undefined} onRate={rate} onClose={() => navigate(reviewReturn)} initialMode={quizIds ? "impossible" : "easy"} />}
      </main>
      {page !== "reels" && <div className="esv-global"><strong>Noncommercial Scripture-memory project</strong><p>Scripture quotations marked “ESV” are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.</p><p>Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.</p><a href="https://www.esv.org/" target="_blank" rel="noreferrer">Read at ESV.org</a></div>}
      {(!online || connection.mode !== "online" || connection.pending > 0) && <div className="offline-badge" role="status"><WifiOff/>{connection.mode === "syncing" ? "Syncing saved practice…" : `Saved on this device${connection.pending ? ` · ${connection.pending} updates waiting to sync` : " · Offline access"}`}</div>}

      {!isNativeApp && page !== "review" && page !== "reels" && <nav className="mobile-tabs"><button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}><Home />Today</button><button onClick={() => navigate("reels")}><Sparkles />Reels</button><button className={page === "store" ? "active" : ""} onClick={() => navigate("store")}><BookOpen />Store</button><button className={page === "library" ? "active" : ""} onClick={() => navigate("library")}><Library />Library</button><button className={page === "memory-bank" ? "active" : ""} onClick={() => navigate("memory-bank")}><BookHeart />Memory Bank</button></nav>}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </>
  );

  return isNativeApp
    ? <NativeShell page={page} user={user} signingOut={signingOut} onNavigate={navigate} onSignOut={() => void signOut()}>{content}</NativeShell>
    : <div className="app-shell">{content}</div>;
}

function AuthPage({ onAuthenticated, onReadOffline }: { onReadOffline: () => void; onAuthenticated: (user: User) => void | Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (serverEnabled) {
        const activeUser = mode === "signup" ? await apiSignUp(name.trim(), normalizedEmail, password) : await apiSignIn(normalizedEmail, password);
        await onAuthenticated(activeUser); return;
      }
      const users = await getUsers(); const passwordHash = await hashPassword(password);
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Please enter your name.");
        if (users.length) throw new Error("This device already has a Ruminate profile. Sign in to continue.");
        if (users.some(user => user.email === normalizedEmail)) throw new Error("An account with that email already exists on this device.");
        const user: User = { id: crypto.randomUUID(), name: name.trim(), email: normalizedEmail, passwordHash, createdAt: new Date().toISOString() };
        await saveUser(user); await saveSettings({ userId: user.id, translation: DEFAULT_TRANSLATION, dailyGoal: 5, theme: "light", reminders: false }); await onAuthenticated(user);
      } else {
        const user = users.find(candidate => candidate.email === normalizedEmail && candidate.passwordHash === passwordHash);
        if (!user) throw new Error("That email and password combination wasn’t found."); await onAuthenticated(user);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed"); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-story"><div className="brand auth-brand"><span className="brand-mark">R</span><span>Ruminate<small>scripture memory</small></span></div><div><span className="overline">Keep the Word close</span><blockquote>“Thy word have I hid in mine heart, that I might not sin against thee.”</blockquote><p>Psalm 119:11</p></div></section><section className="auth-form"><div><p className="eyebrow">Welcome to Ruminate</p><h1>{mode === "signin" ? "Return to your practice." : "Begin your practice."}</h1><p>{mode === "signin" ? "Sign in to continue where you left off." : "Create your secure, synchronized account."}</p><form onSubmit={submit}>{mode === "signup" && <label>Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required/></label>}<label>Email address<input type="email" {...(isNativeApp ? { inputMode: "email" as const, autoCapitalize: "none", autoCorrect: "off", spellCheck: false, enterKeyHint: "next" as const } : {})} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" minLength={8} {...(isNativeApp ? { enterKeyHint: "go" as const } : {})} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} required/></label>{error && <p className="auth-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight/></button></form><button className="auth-toggle" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button><button className="offline-reading" onClick={onReadOffline}><BookOpen size={16}/> Read Bible offline</button><small className="local-note">Your practice is saved to your account.</small></div></section></main>;
}

function shuffle<T>(values: T[]) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function TranslationSelect({ value, onChange, compact = false, offlineOnly = false }: { value: Translation; onChange: (value: Translation) => void; compact?: boolean; offlineOnly?: boolean }) {
  return <label className={compact ? "translation-picker compact" : "translation-picker"}>Translation<select value={value} onChange={event => onChange(event.target.value as Translation)}>{translations.filter(item => !offlineOnly || item.id !== "ESV").map(item => <option value={item.id} key={item.id}>{compact ? item.id : `${item.id} — ${item.name}`}</option>)}</select></label>;
}

function verseAnchorIndex(values: Verse[], reference: string | null) {
  if (!reference) return 0;
  const exact = values.findIndex(verse => verse.reference === reference);
  if (exact >= 0) return exact;
  const match = reference.match(/\s(\d+):(\d+)/);
  if (!match) return 0;
  const chapter = Number(match[1]), verse = Number(match[2]);
  const following = values.findIndex(value => value.chapter > chapter || (value.chapter === chapter && Number(value.verse) >= verse));
  return following >= 0 ? following : Math.max(0, values.length - 1);
}

function ReelsPage({ catalog, library, translation: preferred, onBack, onPin, onImport, readOnly = false }: { catalog: Verse[]; library: LibraryItem[]; translation: Translation; readOnly?: boolean; onBack: () => void; onPin: (v: Verse) => void; onImport: (v: Verse) => Promise<void> }) {
  const [reelMode, setReelMode] = useState<"scripture" | "books">("scripture");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [translation, setTranslation] = useState<Translation>(preferred);
  const [visibleFeed, setVisibleFeed] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const feedRef = useRef<HTMLDivElement>(null); const activeReel = useRef(0); const preservedReference = useRef<string | null>(null);
  type FeedSession = { translation: Translation; seen: Set<string>; pools: Map<string, Verse[]>; queue: string[]; loading: boolean };
  const feedSession = useRef<FeedSession>({ translation: preferred, seen: new Set(), pools: new Map(), queue: [], loading: false });
  const pinned = new Set(library.map(item => item.verseId));
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  async function loadMore(reset = false) {
    const session = feedSession.current;
    if (session.loading || reelMode !== "scripture") return;
    session.loading = true; if (reset) setLoading(true); setError("");
    try {
      if (reset) session.queue = shuffle(bibleBooks.map(([name]) => name));
      const next: Verse[] = [];
      if (reset && preservedReference.current) {
        const reference = preservedReference.current; preservedReference.current = null;
        if (session.translation === "ESV") next.push(await fetchPassage(reference, "ESV"));
        else {
          const book = bibleBooks.find(([name]) => reference.startsWith(`${name} `))?.[0];
          if (book) {
            const values = await fetchBibleBook(book, session.translation);
            next.push(values[verseAnchorIndex(values, reference)]);
          }
        }
        if (session !== feedSession.current) return;
        if (next.length) session.seen.add(next[0].reference);
        setVisibleFeed([...next]);
        requestAnimationFrame(() => { if (feedRef.current) feedRef.current.scrollTop = 0; });
      }
      const target = reset ? 4 : 8;
      while (next.length < target) {
        if (session !== feedSession.current) return;
        if (!session.queue.length) session.queue = shuffle([...session.pools.keys()].filter(book => session.pools.get(book)?.length));
        if (!session.queue.length && session.pools.size === bibleBooks.length) { session.pools.clear(); session.seen.clear(); }
        if (!session.queue.length) session.queue = shuffle(bibleBooks.map(([name]) => name));
        const book = session.queue.shift()!;
        let pool = session.pools.get(book);
        if (!pool) {
          pool = shuffle(session.translation === "ESV" ? await fetchBibleBook(book, "WEB") : await fetchBibleBook(book, session.translation));
          if (session !== feedSession.current) return;
          session.pools.set(book, pool);
        }
        for (let count = 0; count < 2 && next.length < target && pool.length; count++) {
          const base = pool.shift()!;
          if (session.seen.has(base.reference)) { count--; continue; }
          session.seen.add(base.reference);
          const verse = session.translation === "ESV" ? await fetchPassage(base.reference, "ESV") : base;
          if (session !== feedSession.current) return;
          next.push(verse);
        }
        if (pool.length) session.queue.push(book);
      }
      if (session !== feedSession.current) return;
      setVisibleFeed(current => reset ? next : [...current, ...next]);
      if (reset) requestAnimationFrame(() => { if (feedRef.current) feedRef.current.scrollTop = 0; });
    } catch (err) { if (session === feedSession.current) setError(err instanceof Error ? err.message : "More Scripture could not be loaded."); }
    finally { if (session === feedSession.current) { session.loading = false; setLoading(false); } }
  }
  useEffect(() => {
    feedSession.current = { translation, seen: new Set(), pools: new Map(), queue: [], loading: false };
    setVisibleFeed([]); activeReel.current = 0;
    if (reelMode === "scripture") void loadMore(true);
  }, [reelMode, translation]);
  function changeTranslation(value: Translation) {
    if (value === translation) return;
    if (reelMode === "scripture") preservedReference.current = visibleFeed[activeReel.current]?.reference || null;
    feedSession.current = { translation: value, seen: new Set(), pools: new Map(), queue: [], loading: false };
    setVisibleFeed([]); setLoading(true);
    setTranslation(value); setError("");
  }
  async function pin(verse: Verse) { try { if (catalog.some(v => v.id === verse.id)) await onPin(verse); else await onImport(verse); } catch (err) { setError(err instanceof Error ? err.message : "Could not pin passage"); } }
  return <div className="reels-page">
    <div className="reels-toolbar"><button className="exit-reels" onClick={onBack} aria-label="Back to Ruminate"><ArrowLeft/><span>Back</span></button><div className="reels-title"><span className="overline">Scripture reels</span><h1>{reelMode === "scripture" ? "Pause. Read. Keep." : selectedBook ? `Reading ${selectedBook}` : "The story, book by book."}</h1></div><div className="reels-controls"><div className="reel-mode"><button className={reelMode === "scripture" ? "active" : ""} onClick={() => { setReelMode("scripture"); setSelectedBook(null); }}>Scripture</button><button className={reelMode === "books" ? "active" : ""} onClick={() => setReelMode("books")}>Books</button></div><TranslationSelect compact offlineOnly={readOnly} value={translation} onChange={changeTranslation}/>{readOnly && <span className="offline-reading-label">Offline reading</span>}</div></div>
    {error && reelMode === "scripture" && <div className="reel-message">{error}</div>}
    {reelMode === "books" ? selectedBook ? <BookVerseReels readOnly={readOnly} book={selectedBook} translation={translation} pinned={pinned} onBack={() => setSelectedBook(null)} onPin={pin}/> : <BookReels onSelect={setSelectedBook}/> : loading && !visibleFeed.length ? <div className="reel-loading"><i/><p>Gathering new {translation} passages…</p></div> : visibleFeed.length ? <div ref={feedRef} className="reel-feed" onScroll={event => { const element = event.currentTarget; activeReel.current = Math.max(0, Math.round(element.scrollTop / element.clientHeight)); if (element.scrollHeight - element.scrollTop - element.clientHeight < element.clientHeight * 4) void loadMore(); }}>{visibleFeed.map((verse, i) => <article className={`reel reel-${i % 4}`} key={`${verse.id}-${i}`}><div className="reel-ornament">{i % 2 ? "✦" : "❧"}</div><div className="reel-content"><span>{verse.topics[0] || "Scripture"}</span><blockquote>“{verse.text}”</blockquote><p>{verse.reference} <i>{verse.translation}</i></p></div>{!readOnly && <button className={pinned.has(verse.id) ? "pinned" : ""} onClick={() => pin(verse)}><Bookmark/>{pinned.has(verse.id) ? "Pinned" : "Pin to memorize"}</button>}{verse.translation === "ESV" && <small>ESV® © 2001 Crossway. Used by permission. <a href="https://www.esv.org/" target="_blank" rel="noreferrer">ESV.org</a></small>}<div className="scroll-cue">Scroll for more <ArrowRight/></div></article>)}</div> : <div className="reel-loading"><BookOpen/><p>{error || "No passages available in this translation."}</p><button className="reel-retry" onClick={() => void loadMore(true)}>Try again</button></div>}
  </div>;
}

function bookSection(index: number) {
  if (index < 5) return "The Law"; if (index < 17) return "History"; if (index < 22) return "Poetry & Wisdom"; if (index < 27) return "Major Prophets"; if (index < 39) return "Minor Prophets"; if (index < 43) return "The Gospels"; if (index === 43) return "Church History"; if (index < 65) return "The Letters"; return "Prophecy";
}

function BookReels({ onSelect }: { onSelect: (book: string) => void }) {
  return <div className="reel-feed book-feed">{bibleBooks.map(([book, chapters], i) => <article className={`reel book-reel reel-${i % 4}`} key={book}><div className="book-watermark">{String(i + 1).padStart(2, "0")}</div><div className="reel-content"><span>{i < 39 ? "Old Testament" : "New Testament"} · {bookSection(i)}</span><h2>{book}</h2><p>{chapters} {chapters === 1 ? "chapter" : "chapters"}</p><button className="open-book" onClick={() => onSelect(book)}><BookOpen/> Read verses in order</button><div className="book-position"><i style={{ width: `${((i + 1) / bibleBooks.length) * 100}%` }}/></div><small>Book {i + 1} of {bibleBooks.length}</small></div><div className="book-neighbors"><span>{i ? `← ${bibleBooks[i - 1][0]}` : "Beginning"}</span><span>{i < bibleBooks.length - 1 ? `${bibleBooks[i + 1][0]} →` : "The end"}</span></div><div className="scroll-cue">Next book <ArrowRight/></div></article>)}</div>;
}

function BookVerseReels({ book, translation, pinned, onBack, onPin, readOnly = false }: { book: string; translation: Translation; readOnly?: boolean; pinned: Set<string>; onBack: () => void; onPin: (verse: Verse) => Promise<void> }) {
  const [bookVerses, setBookVerses] = useState<Verse[]>([]); const [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [active, setActive] = useState(0); const feedRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const pendingAnchor = useRef<number | null>(null);
  const esvSource = useRef<Verse[]>([]); const esvLoading = useRef(false);
  const requestId = useRef(0);
  const bookAnchor = useRef<string | null>(null);
  async function loadMoreEsv(): Promise<Verse[]> {
    if (translation !== "ESV" || esvLoading.current || !esvSource.current.length) return [];
    const currentRequest = requestId.current;
    const batch = esvSource.current.splice(0, 4);
    esvLoading.current = true;
    try {
      const next = await Promise.all(batch.map(verse => fetchPassage(verse.reference, "ESV")));
      if (currentRequest !== requestId.current) return [];
      setBookVerses(current => [...current, ...next]); setLoadedFor(`${book}:ESV`);
      return next;
    } catch (err) {
      if (currentRequest === requestId.current) { esvSource.current.unshift(...batch); setError(err instanceof Error ? err.message : "More ESV verses could not be loaded"); }
      return [];
    } finally { if (currentRequest === requestId.current) esvLoading.current = false; }
  }
  useEffect(() => {
    let live = true; requestId.current++;
    let fullBookReady = false; let partialReady = false;
    const anchor = bookAnchor.current || bookVerses[active]?.reference || null;
    bookAnchor.current = anchor; esvSource.current = []; esvLoading.current = false;
    setBookVerses([]); setLoadedFor(""); setError(""); setActive(0); pendingAnchor.current = null;
    if (translation === "ESV") fetchBibleBook(book, "WEB").then(values => {
      if (!live) return;
      const anchorIndex = verseAnchorIndex(values, anchor);
      esvSource.current = values.slice(Math.max(0, anchorIndex)); void loadMoreEsv();
    }).catch(err => { if (live) setError(err instanceof Error ? err.message : "Book unavailable"); });
    else {
      if (anchor) void (async () => {
        try {
          const structure = bookVerses.length > 8 ? bookVerses : await fetchBibleBook(book, "WEB");
          if (!live || fullBookReady) return;
          const anchorIndex = structure.findIndex(verse => verse.reference === anchor);
          if (anchorIndex < 0) return;
          const anchorVerse = structure[anchorIndex];
          const lastVerse = Math.max(...structure.filter(verse => verse.chapter === anchorVerse.chapter).map(verse => Number(verse.verse)));
          const endVerse = Math.min(Number(anchorVerse.verse) + 15, lastVerse);
          const chunk = await fetchPassageVerses(`${book} ${anchorVerse.chapter}:${anchorVerse.verse}-${endVerse}`, translation);
          if (!live || fullBookReady) return;
          partialReady = true; setActive(0); setBookVerses(chunk); setLoadedFor(`${book}:${translation}`);
        } catch { /* The whole-book request below remains the recovery path. */ }
      })();
      void fetchBibleBook(book, translation).then(values => {
        if (!live) return;
        fullBookReady = true;
        const anchorIndex = verseAnchorIndex(values, anchor);
        pendingAnchor.current = Math.max(0, anchorIndex); setActive(Math.max(0, anchorIndex));
        setBookVerses(values); setLoadedFor(`${book}:${translation}`);
      }).catch(err => { if (live && !partialReady) setError(err instanceof Error ? err.message : "Book unavailable"); });
    }
    return () => { live = false; requestId.current++; esvSource.current = []; };
  }, [book, translation, reloadKey]);
  useEffect(() => { const feed = feedRef.current; if (!feed) return; const observer = new ResizeObserver(() => setViewportHeight(feed.clientHeight)); observer.observe(feed); setViewportHeight(feed.clientHeight); return () => observer.disconnect(); }, [bookVerses.length > 0]);
  useEffect(() => { if (viewportHeight && pendingAnchor.current !== null && feedRef.current) { feedRef.current.scrollTop = pendingAnchor.current * viewportHeight; pendingAnchor.current = null; } }, [viewportHeight, bookVerses.length, loadedFor]);
  function move(direction: -1 | 1) {
    if (direction === 1 && active === bookVerses.length - 1 && esvSource.current.length) {
      void loadMoreEsv().then(next => { if (next.length) requestAnimationFrame(() => feedRef.current?.scrollTo({ top: bookVerses.length * feedRef.current.clientHeight, behavior: "smooth" })); });
      return;
    }
    const next = Math.max(0, Math.min(bookVerses.length - 1, active + direction));
    feedRef.current?.scrollTo({ top: next * feedRef.current.clientHeight, behavior: "smooth" });
  }
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "ArrowDown" || event.key === "PageDown") { event.preventDefault(); move(1); } if (event.key === "ArrowUp" || event.key === "PageUp") { event.preventDefault(); move(-1); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); });
  if (error) return <div className="reel-loading"><BookOpen/><p>{error}</p><button className="reel-retry" onClick={() => setReloadKey(key => key + 1)}>Try again</button><button className="reel-retry" onClick={onBack}>Back to books</button></div>;
  if (loadedFor !== `${book}:${translation}` || !bookVerses.length) return <div className="reel-loading"><i/><p>Opening {book} in {translation}…</p></div>;
  const first = Math.max(0, active - 3); const last = Math.min(bookVerses.length, active + 5);
  return <div className="verse-reels-shell"><button className="back-to-books" onClick={onBack}><ArrowLeft/> All books</button><div ref={feedRef} className="reel-feed verse-book-feed" tabIndex={0} onScroll={event => { const element = event.currentTarget; const nextActive = Math.max(0, Math.min(bookVerses.length - 1, Math.round(element.scrollTop / element.clientHeight))); setActive(nextActive); bookAnchor.current = bookVerses[nextActive]?.reference || bookAnchor.current; if (nextActive >= bookVerses.length - 3) void loadMoreEsv(); }}><div className="reel-spacer" style={{ height: first * viewportHeight }} aria-hidden="true"/>{bookVerses.slice(first, last).map((verse, offset) => { const i = first + offset; return <article className={`reel book-verse reel-${Math.floor((verse.chapter - 1) / 2) % 4}`} key={verse.id}><div className="chapter-watermark">{verse.chapter}</div><div className="reel-content"><span>{book} · Chapter {verse.chapter}</span><blockquote>“{verse.text}”</blockquote><p>{verse.reference} <i>{translation}</i></p></div>{!readOnly && <button className={pinned.has(verse.id) ? "pinned" : ""} onClick={() => onPin(verse)}><Bookmark/>{pinned.has(verse.id) ? "Pinned" : "Pin to memorize"}</button>}{translation === "ESV" && <small>ESV® © 2001 Crossway. Used by permission.</small>}<div className="verse-sequence">Verse {i + 1}{translation === "ESV" && esvSource.current.length ? "+" : ` of ${bookVerses.length}`}</div>{i === 0 && <div className="swipe-prompt"><ArrowUp/> Swipe or scroll <ArrowDown/></div>}</article>; })}<div className="reel-spacer" style={{ height: (bookVerses.length - last) * viewportHeight }} aria-hidden="true"/></div><div className="reel-nav"><button onClick={() => move(-1)} disabled={active === 0} aria-label="Previous verse"><ArrowUp/></button><span>{active + 1}<i/> {bookVerses.length}{translation === "ESV" && esvSource.current.length ? "+" : ""}</span><button onClick={() => move(1)} disabled={active === bookVerses.length - 1 && !esvSource.current.length} aria-label="Next verse"><ArrowDown/></button></div></div>;
}

function SettingsPage({ user, settings, onSave, onSignOut, signingOut, onDeleteAccount }: { user: User; settings: UserSettings; onSave: (value: UserSettings) => void; onSignOut: () => void; signingOut: boolean; onDeleteAccount: () => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  return <div className="page settings-page"><section className="page-title"><p className="eyebrow">Your Ruminate</p><h1>Settings</h1><p>Shape a practice that fits your life.</p></section><div className="settings-layout"><aside><div className="settings-avatar">{user.name.split(" ").map(p => p[0]).join("").slice(0,2)}</div><h2>{user.name}</h2><p>{user.email}</p><span><UserRound/> Your account</span></aside><section className="settings-panel"><div><span className="overline">Scripture</span><h2>Reading preferences</h2><TranslationSelect value={draft.translation} onChange={translation => setDraft({ ...draft, translation })}/><small>This preference is the default everywhere Scripture is shown. You can still switch versions while reading.</small></div><div><span className="overline">Practice</span><h2>Daily rhythm</h2><label>Daily verse goal<input type="number" min="1" max="50" value={draft.dailyGoal} onChange={e => setDraft({ ...draft, dailyGoal: Number(e.target.value) })}/></label><label className="toggle-line"><span>Daily reminders<small>{isNativeApp ? "A push reminder at 9 a.m. when a verse is due." : "Managed in the Android and iOS app."}</small></span><input type="checkbox" disabled={!isNativeApp} checked={draft.reminders} onChange={e => setDraft({ ...draft, reminders: e.target.checked })}/></label></div>{!isNativeApp && <div><span className="overline">Mobile app</span><h2>Install Ruminate</h2><p className="install-copy">Add Ruminate to your home screen for a full-screen, app-like experience.</p><InstallAppButton/></div>}<button className="primary" onClick={() => onSave(draft)}>Save preferences <Check/></button></section></div><button className="signout" disabled={signingOut} onClick={onSignOut}><LogOut/> {signingOut ? "Signing out…" : "Sign out on this device"}</button><DeleteAccountSection email={user.email} onDelete={onDeleteAccount}/></div>;
}

/* Account deletion is required to be reachable in-app (App Store guideline 5.1.1(v)),
   but it is irreversible, so it is confirmed by typing the account's own email. */
function DeleteAccountSection({ email, onDelete }: { email: string; onDelete: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  async function confirm() {
    if (!matches || busy) return;
    setBusy(true); setError("");
    try { await onDelete(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Your account could not be deleted."); setBusy(false); }
  }

  return <div className="danger-zone">
    <span className="overline">Account</span>
    <h2>Delete account</h2>
    <p>This permanently removes your account, your library, your saved passages, your review history and your reminder devices. It cannot be undone.</p>
    {!open
      ? <button className="danger-button" onClick={() => setOpen(true)}><Trash2 size={16}/> Delete my account</button>
      : <div className="danger-confirm">
          <label>Type <strong>{email}</strong> to confirm
            <input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label={`Type ${email} to confirm deletion`}/>
          </label>
          {error && <p className="auth-error">{error}</p>}
          <div className="danger-actions">
            <button className="danger-button" disabled={!matches || busy} onClick={confirm}><Trash2 size={16}/> {busy ? "Deleting…" : "Permanently delete"}</button>
            <button className="text-button" disabled={busy} onClick={() => { setOpen(false); setTyped(""); setError(""); }}>Cancel</button>
          </div>
        </div>}
  </div>;
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const INSTALL_DISMISSED = "ruminate-install-dismissed";
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Installing is the difference between a browser tab and an app that keeps its data:
    iOS evicts unused site storage after about a week, but exempts installed web apps. */
function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(INSTALL_DISMISSED) === "true");
  const [standalone, setStandalone] = useState(isStandalone);
  useEffect(() => {
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); };
    const done = () => setStandalone(true);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); };
  }, []);

  function dismiss() { localStorage.setItem(INSTALL_DISMISSED, "true"); setDismissed(true); }
  const offer = shouldOfferInstall({
    userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
    standalone, dismissed, native: isNativeApp, hasPrompt: Boolean(prompt),
  });
  if (!offer) return null;

  return <aside className="install-banner">
    <Download size={20}/>
    <div>
      <strong>Add Ruminate to your Home Screen</strong>
      {prompt
        ? <p>Install it for full-screen practice that keeps working offline.</p>
        : <p>Tap <Share size={13}/> Share, then <strong>Add to Home Screen</strong>. Ruminate opens full screen and keeps your verses offline. You will sign in once more there, because iOS gives installed apps their own storage.</p>}
    </div>
    {prompt && <button className="primary small" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); dismiss(); }}>Install</button>}
    <button className="icon-button install-dismiss" aria-label="Dismiss install prompt" onClick={dismiss}><X size={17}/></button>
  </aside>;
}
function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null); const [installed, setInstalled] = useState(window.matchMedia("(display-mode: standalone)").matches);
  useEffect(() => { const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); }; const done = () => setInstalled(true); window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", done); return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); }; }, []);
  if (installed) return <div className="installed-state"><Check/> Ruminate is installed on this device</div>;
  if (!prompt) return <div className="install-help"><Download/> On iPhone, tap Share → Add to Home Screen. On Android, open the browser menu → Install app.</div>;
  return <button className="install-button" onClick={async () => { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === "accepted") setInstalled(true); setPrompt(null); }}><Download/> Install Ruminate</button>;
}

function HomePage({ due, streak, library, verseFor, onReview, onStore }: { due: number; streak: number; library: LibraryItem[]; verseFor: (id: string) => Verse; onReview: () => void; onStore: () => void }) {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return <div className="page home-page">
    <InstallBanner/>
    <section className="welcome"><div><p className="eyebrow">{today}</p><h1>Good morning.</h1><p>Make a little room for the Word today.</p><span className="mobile-streak"><Flame/> {streak}-day streak</span></div><div className="sun-ornament">✦</div></section>
    <section className="review-card"><div className="review-copy"><span className="overline"><Sparkles size={15} /> Today’s practice</span><h2>{due || library.length} {due === 1 ? "verse is" : "verses are"} ready for you</h2><p>A few quiet minutes now can keep these words close all day.</p>{isNativeApp && <div className="review-stats"><div><strong>{due || library.length}</strong><span>Due</span></div><div><strong>{library.length}</strong><span>In library</span></div><div><strong>{streak}</strong><span>Day streak</span></div></div>}<button className="primary" onClick={onReview}>Begin review <ArrowRight size={18} /></button></div><div className="progress-ring"><svg viewBox="0 0 100 100"><circle className="track" cx="50" cy="50" r="42"/><circle className="fill" cx="50" cy="50" r="42"/></svg><strong>{due || library.length}</strong><span>due</span></div></section>
    <div className="section-heading"><div><span className="overline">Continue learning</span><h2>Your verses</h2></div><button className="text-button" onClick={onStore}>Explore store <ArrowRight size={16}/></button></div>
    <div className="verse-strip">{library.slice(0, 3).map((item, i) => { const v = verseFor(item.verseId); return <article className="mini-verse" key={v.id}><span className="count">0{i + 1}</span><p>“{v.text.length > 115 ? v.text.slice(0, 115) + "…" : v.text}”</p><div><strong>{v.reference}</strong><span>{item.reviews ? `${item.reviews} reviews` : "New"}</span></div></article> })}</div>
    <section className="daily-verse"><div className="leaf">❧</div><span className="overline">Verse for today</span><blockquote>“Thy word is a lamp unto my feet,<br/>and a light unto my path.”</blockquote><p>Psalm 119:105 <i>KJV</i></p></section>
  </div>;
}

function StorePage({ filtered, topics, topic, query, library, preferredTranslation, onQuery, onTopic, onToggle, onCollection, onImport }: { filtered: Verse[]; topics: string[]; topic: string; query: string; library: LibraryItem[]; preferredTranslation: Translation; onQuery: (q: string) => void; onTopic: (t: string) => void; onToggle: (v: Verse) => void; onCollection: (name: string, verseIds?: string[]) => void; onImport: (v: Verse) => void }) {
  const saved = new Set(library.map(i => i.verseId));
  const [community, setCommunity] = useState<CommunityCollection[]>([]);
  const [communityTags, setCommunityTags] = useState<Record<string, { tag: string; uses: number }[]>>({});
  const [preview, setPreview] = useState<{ title: string; description: string; curator: string; verseIds: string[] } | null>(null);
  useEffect(() => { apiCollections().then(setCommunity).catch(() => setCommunity([])); apiCommunityTags().then(setCommunityTags).catch(() => setCommunityTags({})); }, []);
  const openCurated = (pack: typeof packs[number]) => setPreview({ title: pack.name, description: pack.description, curator: "Curated by Ruminate", verseIds: verses.filter(v => v.pack === pack.name).map(v => v.id) });
  return <div className="page store-page">
    <section className="page-title"><p className="eyebrow">Discover & collect</p><h1>Verse Store</h1><p>Find words for every season and make them your own.</p></section>
    <BibleBrowser preferredTranslation={preferredTranslation} onImport={onImport}/>
    <div className="search"><Search size={20}/><input value={query} onChange={e => onQuery(e.target.value)} placeholder="Search a reference, phrase, or topic…"/><kbd>⌘ K</kbd></div>
    {!query && topic === "All" && <><div className="section-heading"><div><span className="overline">Curated for you</span><h2>Verse collections</h2></div></div><div className="pack-grid">{packs.map((pack, i) => <article className={`pack ${pack.color}`} key={pack.name}><div className="pack-number">0{i + 1}</div><div><span>{verses.filter(v => v.pack === pack.name).length} verses</span><h3>{pack.name}</h3><p>{pack.description}</p></div><button onClick={() => openCurated(pack)}>View collection <ArrowRight size={16}/></button></article>)}</div>{community.length > 0 && <><div className="section-heading community-heading"><div><span className="overline">Shared by the community</span><h2>Community collections</h2></div><span className="community-count">{community.length} collections</span></div><div className="community-grid">{community.map(item => <article key={item.id}><span>{item.category}</span><h3>{item.title}</h3><p>{item.description}</p><div><small>by {item.curator} · {item.verseIds.length} verses</small><button onClick={() => setPreview(item)}>Preview <ArrowRight/></button></div></article>)}</div></>}</>}
    <div className="browse-head"><div><span className="overline">Browse the store</span><h2>All Scripture</h2></div><span>{filtered.length} passages</span></div>
    <div className="topic-row">{topics.map(t => <button className={topic === t ? "active" : ""} onClick={() => onTopic(t)} key={t}>{t}</button>)}</div>
    <div className="store-list">{filtered.map(v => <article className="store-verse" key={v.id}><div className="verse-main"><div><strong>{v.reference}</strong><span>{v.translation}</span></div><p>{v.text}</p><div className="tags">{v.topics.map(t => <span key={t}>{t}</span>)}{(communityTags[v.id] || []).map(item => <span className="community-tag" title={`${item.uses} people use this tag`} key={item.tag}>#{item.tag}<small>{item.uses}</small></span>)}</div></div><button className={saved.has(v.id) ? "saved" : "add"} onClick={() => onToggle(v)}>{saved.has(v.id) ? <><Check/> Added</> : <><Plus/> Add</>}</button></article>)}</div>
    {preview && <div className="collection-overlay" role="dialog" aria-modal="true" aria-label={preview.title} onMouseDown={event => { if (event.currentTarget === event.target) setPreview(null); }}><section className="collection-preview"><button className="modal-close" onClick={() => setPreview(null)}><X/></button><span className="overline">Collection preview</span><h2>{preview.title}</h2><p>{preview.description}</p><small>{preview.curator} · {preview.verseIds.length} verses</small><div className="preview-verses">{preview.verseIds.map((id, index) => { const verse = verses.find(v => v.id === id); return verse ? <article key={id}><span>{String(index + 1).padStart(2,"0")}</span><div><h3>{verse.reference} <i>{verse.translation}</i></h3><p>{verse.text}</p></div>{saved.has(id) && <Check/>}</article> : null; })}</div><div className="preview-actions"><span>{preview.verseIds.filter(id => saved.has(id)).length} already in your library</span><button className="primary" onClick={() => { onCollection(preview.title, preview.verseIds); setPreview(null); }}>Add collection <Plus/></button></div></section></div>}
  </div>;
}

function BibleBrowser({ preferredTranslation, onImport }: { preferredTranslation: Translation; onImport: (verse: Verse) => void }) {
  const [book, setBook] = useState("John");
  const [chapter, setChapter] = useState(3);
  const [verseRange, setVerseRange] = useState("16");
  const [translation, setTranslation] = useState<Translation>(preferredTranslation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const maxChapters = bibleBooks.find(([name]) => name === book)?.[1] || 1;
  async function add() {
    setLoading(true); setError("");
    try { await fetchPassage(`${book} ${chapter}:${verseRange}`, translation).then(onImport); }
    catch (err) { setError(err instanceof Error ? err.message : "Passage could not be loaded"); }
    finally { setLoading(false); }
  }
  return <section className="bible-browser"><div><span className="overline">The whole Bible</span><h2>Add any passage</h2><p>Choose a book, chapter, verse or range, and translation.</p></div><div className="passage-picker"><label>Book<select value={book} onChange={e => { setBook(e.target.value); setChapter(1); }}>{bibleBooks.map(([name]) => <option key={name}>{name}</option>)}</select></label><label>Chapter<select value={chapter} onChange={e => setChapter(Number(e.target.value))}>{Array.from({ length: maxChapters }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label><label>Verse(s)<input value={verseRange} onChange={e => setVerseRange(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="1 or 1-5"/></label><TranslationSelect value={translation} onChange={setTranslation}/><button className="primary" onClick={add} disabled={loading || !verseRange}>{loading ? "Loading…" : <><Plus/> Add passage</>}</button></div>{error && <p className="browser-error">{error}</p>}<small>{translation === "WEB" ? "World English Bible Classic · Public domain · Available offline." : translation === "ESV" ? <>ESV requires a free Crossway API key. <a href="https://api.esv.org/" target="_blank" rel="noreferrer">Get one here.</a></> : `${translations.find(item => item.id === translation)?.name} · Available offline.`}</small></section>;
}

function LibraryPage({ library, verseFor, onRemove, onUpdate, onReview, onStore }: { library: LibraryItem[]; verseFor: (id: string) => Verse; onRemove: (v: Verse) => void; onUpdate: (item: LibraryItem) => void; onReview: () => void; onStore: () => void }) {
  const collections = Array.from(new Set(library.map(i => i.collection)));
  const [tagFilter, setTagFilter] = useState("All");
  const personalTags = Array.from(new Set(library.flatMap(item => item.tags || []))).sort();
  const shown = tagFilter === "All" ? library : library.filter(item => item.tags?.includes(tagFilter));
  return <div className="page library-page"><section className="page-title"><p className="eyebrow">Your quiet treasury</p><h1>My Library</h1><p>{library.length} passages you’re carrying with you.</p></section>
    <div className="library-stats"><div><BookHeart/><strong>{library.length}</strong><span>Verses saved</span></div><div><Layers3/><strong>{collections.length}</strong><span>Collections</span></div><div><Flame/><strong>{library.reduce((sum, i) => sum + i.reviews, 0)}</strong><span>Reviews</span></div></div>
    <div className="library-toolbar"><div><span className="overline">All verses</span><h2>Growing in your heart</h2></div><button className="primary small" onClick={onReview}>Practice now <ArrowRight/></button></div>
    {personalTags.length > 0 && <div className="personal-tag-filter"><span>Filter by tag</span><button className={tagFilter === "All" ? "active" : ""} onClick={() => setTagFilter("All")}>All</button>{personalTags.map(tag => <button className={tagFilter === tag ? "active" : ""} onClick={() => setTagFilter(tag)} key={tag}>#{tag}</button>)}</div>}
    {library.length ? <div className="library-list">{shown.map(item => { const v = verseFor(item.verseId); return <article key={v.id}><div className="book-tile">{v.book.slice(0, 2).toUpperCase()}</div><div className="library-copy"><span>{item.collection}</span><h3>{v.reference} <i>{v.translation}</i></h3><p>{v.text}</p><TagEditor item={item} onUpdate={onUpdate}/><div className="mastery"><span style={{ width: `${Math.min(100, item.stage * 18)}%` }}/></div><small>Stage {item.stage} · {item.reviews} reviews</small><button className="memorized-toggle" aria-pressed={isMemorized(item)} onClick={() => void Promise.resolve(onUpdate({ ...item, memorized: !isMemorized(item) })).catch(() => {})}>{isMemorized(item) ? "✓ Memorized · move back to learning" : "Mark as memorized"}</button></div><button className="icon-button" title="Remove verse" onClick={() => onRemove(v)}><X/></button></article> })}</div> : <div className="empty"><BookOpen/><h2>Your library is waiting</h2><p>Choose a few passages to begin your practice.</p><button className="primary" onClick={onStore}>Explore Verse Store</button></div>}
  </div>;
}

function TagEditor({ item, onUpdate }: { item: LibraryItem; onUpdate: (item: LibraryItem) => void }) {
  const [editing, setEditing] = useState(false); const [value, setValue] = useState(""); const tags = item.tags || [];
  function add() { const tag = value.trim().toLowerCase().replace(/^#/, "").replace(/\s+/g, "-").slice(0, 24); if (tag && !tags.includes(tag)) onUpdate({ ...item, tags: [...tags, tag] }); setValue(""); setEditing(false); }
  return <div className="personal-tags">{tags.map(tag => <span key={tag}>#{tag}<button aria-label={`Remove ${tag} tag`} onClick={() => onUpdate({ ...item, tags: tags.filter(value => value !== tag) })}>×</button></span>)}{editing ? <form onSubmit={event => { event.preventDefault(); add(); }}><input autoFocus value={value} maxLength={24} onChange={event => setValue(event.target.value)} onBlur={() => { if (value.trim()) add(); else setEditing(false); }} placeholder="e.g. morning"/></form> : <button className="add-tag" onClick={() => setEditing(true)}><Plus/> Tag</button>}</div>;
}

function HistoryPage({ history, verseFor }: { history: ReviewResult[]; verseFor: (id: string) => Verse }) {
  const average = history.length ? Math.round(history.reduce((sum, r) => sum + r.percentage, 0) / history.length) : 0;
  const recent = history.slice(0, 8).reverse();
  const verseGroups = Array.from(new Set(history.map(r => r.verseId))).map(id => ({ id, results: history.filter(r => r.verseId === id) }));
  return <div className="page history-page"><section className="page-title"><p className="eyebrow">Practice over perfection</p><h1>Your Progress</h1><p>See each attempt and how faithfully the words are taking root.</p></section><div className="history-summary"><div><History/><strong>{history.length}</strong><span>Attempts</span></div><div><BarChart3/><strong>{average}%</strong><span>Average accuracy</span></div><div><Sparkles/><strong>{history.filter(r => r.percentage === 100).length}</strong><span>Perfect recalls</span></div></div>
    {history.length ? <><section className="trend-card"><div><span className="overline">Recent accuracy</span><h2>Your learning curve</h2></div><div className="trend-bars">{recent.map(result => <div key={result.id} title={`${result.percentage}%`}><i style={{ height: `${Math.max(5, result.percentage)}%` }}/><span>{result.percentage}%</span></div>)}</div></section><div className="section-heading"><div><span className="overline">Verse by verse</span><h2>Review history</h2></div></div><div className="result-groups">{verseGroups.map(group => { const verse = verseFor(group.id); const chronological = [...group.results].reverse(); const first = chronological[0]?.percentage || 0; const latest = chronological.at(-1)?.percentage || 0; return <article key={group.id}><div className="result-title"><div><h3>{verse?.reference || "Saved passage"}</h3><span>{verse?.translation} · {group.results.length} attempts</span></div><strong className={latest >= first ? "up" : ""}>{latest >= first ? "+" : ""}{latest - first}%</strong></div><div className="attempt-list">{group.results.slice(0, 5).map(result => <div key={result.id}><time>{new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }).format(new Date(result.reviewedAt))}</time><span className={`mode-pill ${result.mode}`}>{result.mode}</span><b>{result.correct}/{result.total}</b><strong>{result.percentage}%</strong></div>)}</div></article> })}</div></> : <div className="empty"><BarChart3/><h2>Your story starts with one review</h2><p>Completed exercises will appear here with answer-by-answer scores.</p></div>}
  </div>;
}

function cleanWord(word: string) {
  return word.toLowerCase().replace(/[^a-z0-9']/g, "");
}

function ReviewPage({ items, index, verse, onRate, onClose, initialMode = "easy" }: { items: LibraryItem[]; index: number; verse?: Verse; onRate: (r: ReviewRating, summary: ExerciseSummary) => void; onClose: () => void; initialMode?: ReviewResult["mode"] }) {
  type PracticeMode = ReviewResult["mode"];
  const [mode, setMode] = useState<PracticeMode>(initialMode);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [fullRecall, setFullRecall] = useState("");
  const [activeBlank, setActiveBlank] = useState<number | null>(null);
  const [graded, setGraded] = useState(false);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const words = verse?.text.split(" ") || [];
  const singleBlankIndexes = words.map((_, i) => i).filter(i => i % 3 === 1);
  const pairedBlankIndexes = words.map((_, i) => i).filter(i => i % 5 === 1 || i % 5 === 2);
  const blankIndexes = mode === "hard" ? pairedBlankIndexes : singleBlankIndexes;
  useEffect(() => { setActiveBlank(blankIndexes[0] ?? null); }, [verse?.id, mode]);
  useEffect(() => { if ((mode === "medium" || mode === "hard") && activeBlank !== null) { window.setTimeout(() => inputRefs.current[activeBlank]?.focus(), 40); } }, [mode, activeBlank]);
  if (!verse) return <div className="empty"><h2>No verses to review</h2><button onClick={onClose}>Return home</button></div>;
  const isCorrect = (i: number) => cleanWord(answers[i] || "") === cleanWord(words[i]);
  const recalledWords = fullRecall.trim().split(/\s+/).filter(Boolean);
  const impossibleResults = words.map((word, i) => cleanWord(recalledWords[i] || "") === cleanWord(word));
  const correctCount = mode === "impossible" ? impossibleResults.filter(Boolean).length : blankIndexes.filter(isCorrect).length;
  const totalAnswers = mode === "impossible" ? words.length : blankIndexes.length;
  const choicesFor = (blank: number) => {
    const answer = cleanWord(words[blank]);
    const candidates = words.map(cleanWord).filter((word, i, all) => word && word !== answer && all.indexOf(word) === i);
    const start = blank % Math.max(1, candidates.length);
    return [answer, ...candidates.slice(start, start + 3), ...candidates.slice(0, 3)].slice(0, 4).sort((a, b) => (a.charCodeAt(0) + blank) % 7 - (b.charCodeAt(0) + blank) % 7);
  };
  const nextBlank = (current: number) => blankIndexes.find(i => i > current && !answers[i]) ?? blankIndexes.find(i => !answers[i] && i !== current) ?? null;
  const changeMode = (next: PracticeMode) => { setMode(next); setAnswers({}); setFullRecall(""); setActiveBlank(null); setGraded(false); };
  const allAnswered = mode === "impossible" ? Boolean(fullRecall.trim()) : blankIndexes.every(i => Boolean(answers[i]?.trim()));
  const summary = (): ExerciseSummary => ({ mode, correct: correctCount, total: totalAnswers, percentage: Math.round((correctCount / totalAnswers) * 100), answers: mode === "impossible" ? words.map((word, i) => ({ expected: cleanWord(word), actual: cleanWord(recalledWords[i] || ""), correct: impossibleResults[i] })) : blankIndexes.map(i => ({ expected: cleanWord(words[i]), actual: cleanWord(answers[i] || ""), correct: isCorrect(i) })) });

  return <div className="review-page"><div className="review-top"><button onClick={onClose}><ArrowLeft/> End session</button><span>{index + 1} of {items.length}</span><div className="review-progress"><i style={{ width: `${((index + 1) / items.length) * 100}%` }}/></div></div><section className="recall-card interactive"><span className="overline">Recall from memory</span><h1>{verse.reference}</h1><div className="mode-switch" role="group" aria-label="Review difficulty"><button className={mode === "easy" ? "active" : ""} onClick={() => changeMode("easy")}>Easy <span>choose words</span></button><button className={mode === "medium" ? "active" : ""} onClick={() => changeMode("medium")}>Medium <span>type single blanks</span></button><button className={mode === "hard" ? "active" : ""} onClick={() => changeMode("hard")}>Hard <span>type paired blanks</span></button><button className={mode === "impossible" ? "active" : ""} onClick={() => changeMode("impossible")}>Impossible <span>recall everything</span></button></div>
    {mode !== "impossible" && <><div className="blank-guide"><span>Blank {activeBlank === null ? blankIndexes.length : blankIndexes.indexOf(activeBlank) + 1} of {blankIndexes.length}</span><i><b style={{ width: `${((Object.keys(answers).filter(key => answers[Number(key)]).length) / blankIndexes.length) * 100}%` }}/></i><small>{mode === "easy" ? "Choose the word that belongs in the highlighted space" : mode === "hard" ? "Recall each pair of adjacent missing words" : "Type the missing word, then press Enter to continue"}</small></div>
    <div className="passage-exercise">{words.map((word, i) => blankIndexes.includes(i) ? mode === "easy" ? <button key={i} aria-current={activeBlank === i ? "step" : undefined} className={`word-blank ${activeBlank === i ? "active" : ""} ${answers[i] ? "filled" : ""} ${graded ? isCorrect(i) ? "correct" : "incorrect" : ""}`} onClick={() => !graded && setActiveBlank(i)}>{answers[i] || "•••••"}</button> : <input key={i} ref={element => { inputRefs.current[i] = element; }} aria-label={`Missing word ${blankIndexes.indexOf(i) + 1}`} className={`word-input ${activeBlank === i ? "active" : ""} ${graded ? isCorrect(i) ? "correct" : "incorrect" : ""}`} value={answers[i] || ""} disabled={graded} style={{ width: `${Math.max(62, cleanWord(word).length * 13)}px` }} onFocus={() => setActiveBlank(i)} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} onKeyDown={e => { if ((e.key === "Enter" || e.key === "Tab") && answers[i]?.trim()) { e.preventDefault(); setActiveBlank(nextBlank(i)); } }}/> : <span key={i}>{word} </span>)}</div></>}
    {mode === "impossible" && <div className="impossible-recall"><p>Write the entire verse from memory.</p><textarea autoFocus value={fullRecall} disabled={graded} onChange={event => setFullRecall(event.target.value)} placeholder="Begin typing the verse…" aria-label={`Write ${verse.reference} from memory`}/>{graded && <div className="recall-comparison"><span>Your answer</span><p>{recalledWords.map((word, i) => <mark className={impossibleResults[i] ? "correct" : "incorrect"} key={`${word}-${i}`}>{word} </mark>)}</p><span>Scripture</span><p>{verse.text}</p></div>}</div>}
    <span className="translation">{verse.translation}</span>
    {mode === "easy" && activeBlank !== null && !graded && <div className="choice-tray"><div className="choice-heading"><span>{blankIndexes.indexOf(activeBlank) + 1}</span><p>Choose the missing word</p></div><div>{choicesFor(activeBlank).map(choice => <button key={choice} onClick={() => { const updated = { ...answers, [activeBlank]: choice }; setAnswers(updated); const next = blankIndexes.find(i => i > activeBlank && !updated[i]) ?? blankIndexes.find(i => !updated[i]) ?? null; setActiveBlank(next); }}>{choice}</button>)}</div></div>}
    {!graded ? <button className="primary check-answer" disabled={!allAnswered} onClick={() => setGraded(true)}>Check answers <Check/></button> : <><div className={`score ${correctCount === totalAnswers ? "perfect" : ""}`}><strong>{correctCount} of {totalAnswers} words correct</strong><span>{correctCount === totalAnswers ? "Beautifully remembered." : mode === "impossible" ? "Compare your recall with the Scripture below." : "The correct words are shown below each miss."}</span></div>{mode !== "impossible" && correctCount < totalAnswers && <div className="corrections">{blankIndexes.filter(i => !isCorrect(i)).map(i => <span key={i}><s>{answers[i] || "blank"}</s> → <strong>{cleanWord(words[i])}</strong></span>)}</div>}<div className="ratings"><p>How should we schedule this verse?</p><div><button onClick={() => { tap(); onRate("again", summary()); }}><strong>Again</strong><span>10 min</span></button><button onClick={() => { tap(); onRate("hard", summary()); }}><strong>Hard</strong><span>1 day</span></button><button onClick={() => { tap(); onRate("good", summary()); }}><strong>Good</strong><span>2+ days</span></button><button onClick={() => { tap(ImpactStyle.Medium); onRate("easy", summary()); }}><strong>Easy</strong><span>4+ days</span></button></div></div></>}
  </section><p className="review-hint">Take your time. This isn’t a test—it’s a practice.</p></div>;
}

export default App;
