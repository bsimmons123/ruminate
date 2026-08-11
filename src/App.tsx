import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BarChart3, BookHeart, BookOpen, Bookmark, Check, Download, Flame, History, Home, Layers3, Library, LogOut, Menu, Plus, Search, Settings, Sparkles, UserRound, WifiOff, X } from "lucide-react";
import { packs, verses } from "./data";
import { getLibrary, getPassages, getReviews, getSettings, getUsers, removeItem, saveItem, savePassage, saveReview, saveSettings, saveUser, scheduledItem } from "./db";
import { bibleBooks, fetchKjvBook, fetchPassage } from "./bible";
import { esvStoredCount, parseEsvReference } from "./esvCompliance";
import { hashPassword, SESSION_KEY } from "./auth";
import { apiCollections, apiCommunityTags, apiCurrentUser, apiDelete, apiItems, apiPut, apiSignIn, apiSignOut, apiSignUp, serverEnabled } from "./api";
import type { CommunityCollection, LibraryItem, ReviewRating, ReviewResult, User, UserSettings, Verse } from "./types";

type Page = "home" | "reels" | "store" | "library" | "history" | "settings" | "review";
type ExerciseSummary = Pick<ReviewResult, "mode" | "correct" | "total" | "percentage" | "answers">;

const starterIds = ["ps-46-10", "prov-3-5-6", "john-3-16"];

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
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [catalog, setCatalog] = useState<Verse[]>(verses);
  const [history, setHistory] = useState<ReviewResult[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setUserSettings] = useState<UserSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("All");
  const [toast, setToast] = useState("");
  const [reviewIndex, setReviewIndex] = useState(0);
  const [menu, setMenu] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    Promise.all([getLibrary(), getPassages(), getReviews(), getUsers(), getSettings()]).then(async ([items, customPassages, pastReviews, users, savedSettings]) => {
      const sessionId = localStorage.getItem(SESSION_KEY);
      const activeUser = serverEnabled ? await apiCurrentUser() : users.find(candidate => candidate.id === sessionId) || null;
      if (serverEnabled && activeUser) {
        [items, customPassages, pastReviews, savedSettings] = await Promise.all([apiItems<LibraryItem>("library"), apiItems<Verse>("passage"), apiItems<ReviewResult>("review"), apiItems<UserSettings>("settings")]);
      }
      setUser(activeUser);
      if (!activeUser) { setReady(true); return; }
      if (activeUser) setUserSettings(savedSettings.find(value => value.userId === activeUser.id) || { userId: activeUser.id, translation: "KJV", dailyGoal: 5, theme: "light", reminders: false });
      setCatalog([...verses, ...customPassages.filter(custom => !verses.some(seed => seed.id === custom.id))]);
      setHistory(pastReviews.sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt)));
      if (!items.length) {
        const seeded = starterIds.map((verseId, index): LibraryItem => ({ verseId, addedAt: new Date().toISOString(), stage: 1, reviews: index, nextReview: new Date().toISOString(), collection: index === 0 ? "Peace & Rest" : "My Verses" }));
        await Promise.all(seeded.map(item => serverEnabled ? apiPut("library", item.verseId, item) : saveItem(item)));
        setLibrary(seeded);
      } else setLibrary(items);
      setReady(true);
    });
  }, []);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, []);

  const due = library.filter(item => new Date(item.nextReview) <= new Date());
  const streak = reviewStreak(history);
  const reviewItems = library;
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

  async function updateLibraryItem(item: LibraryItem) { if (serverEnabled) await apiPut("library", item.verseId, item); else await saveItem(item); setLibrary(current => current.map(value => value.verseId === item.verseId ? item : value)); }

  async function rate(rating: ReviewRating, summary: ExerciseSummary) {
    const current = reviewItems[reviewIndex];
    if (!current) return;
    const updated = scheduledItem(current, rating);
    if (serverEnabled) await apiPut("library", updated.verseId, updated); else await saveItem(updated);
    const result: ReviewResult = { id: crypto.randomUUID(), verseId: current.verseId, reviewedAt: new Date().toISOString(), rating, ...summary };
    if (serverEnabled) await apiPut("review", result.id, result); else await saveReview(result);
    setHistory(results => [result, ...results]);
    setLibrary(items => items.map(item => item.verseId === updated.verseId ? updated : item));
    if (reviewIndex < reviewItems.length - 1) {
      setReviewIndex(i => i + 1);
    } else {
      setReviewIndex(0);
      setPage("home");
      notify("Review complete — well done");
    }
  }

  function navigate(next: Page) {
    setPage(next); setMenu(false); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!ready) return <div className="loading"><span>Selah</span><i /></div>;
  if (!user) return <AuthPage onAuthenticated={async activeUser => {
    localStorage.setItem(SESSION_KEY, activeUser.id); setUser(activeUser);
    const [savedLibrary, savedPassages, savedReviews, savedPreferences] = await Promise.all([apiItems<LibraryItem>("library"), apiItems<Verse>("passage"), apiItems<ReviewResult>("review"), apiItems<UserSettings>("settings")]);
    let nextLibrary = savedLibrary;
    if (!nextLibrary.length) { nextLibrary = starterIds.map((verseId, index) => ({ verseId, addedAt: new Date().toISOString(), stage: 1, reviews: index, nextReview: new Date().toISOString(), collection: index === 0 ? "Peace & Rest" : "My Verses" })); await Promise.all(nextLibrary.map(item => apiPut("library", item.verseId, item))); }
    const defaults: UserSettings = { userId: activeUser.id, translation: "KJV", dailyGoal: 5, theme: "light", reminders: false };
    setLibrary(nextLibrary); setCatalog([...verses, ...savedPassages]); setHistory(savedReviews.sort((a,b) => b.reviewedAt.localeCompare(a.reviewedAt))); setUserSettings(savedPreferences[0] || defaults);
    if (!savedPreferences[0]) await apiPut("settings", "preferences", defaults);
  }} />;

  async function updateSettings(next: UserSettings) { if (serverEnabled) await apiPut("settings", "preferences", next); else await saveSettings(next); setUserSettings(next); notify("Settings saved"); }
  async function signOut() { if (serverEnabled) await apiSignOut(); localStorage.removeItem(SESSION_KEY); setUser(null); setPage("home"); }

  return (
    <div className="app-shell">
      <header>
        <button className="brand" onClick={() => navigate("home")}><span className="brand-mark">S</span><span>Selah<small>scripture memory</small></span></button>
        <nav className={menu ? "open" : ""}>
          <button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}>Today</button>
          <button className={page === "reels" ? "active" : ""} onClick={() => navigate("reels")}>Reels</button>
          <button className={page === "store" ? "active" : ""} onClick={() => navigate("store")}>Verse Store</button>
          <button className={page === "library" ? "active" : ""} onClick={() => navigate("library")}>My Library</button>
          <button className={page === "history" ? "active" : ""} onClick={() => navigate("history")}>Progress</button>
          <button className={page === "settings" ? "active" : ""} onClick={() => navigate("settings")}>Settings</button>
        </nav>
        <div className="header-actions"><button className="streak" title={streak ? `${streak} consecutive review ${streak === 1 ? "day" : "days"}` : "Complete a review to begin your streak"}><Flame size={16} /> {streak} {streak === 1 ? "day" : "days"}</button><button className="avatar" onClick={() => navigate("settings")}>{user.name.split(" ").map(part => part[0]).join("").slice(0,2).toUpperCase()}</button><button className="menu" onClick={() => setMenu(v => !v)}>{menu ? <X /> : <Menu />}</button></div>
      </header>

      <main>
        {page === "home" && <HomePage due={due.length} streak={streak} library={library} verseFor={verseFor} onReview={() => navigate("review")} onStore={() => navigate("store")} />}
        {page === "reels" && <ReelsPage catalog={catalog} library={library} translation={settings?.translation || "KJV"} onPin={toggleVerse} onImport={importVerse} />}
        {page === "store" && <StorePage filtered={filtered} topics={topics} topic={topic} query={query} library={library} preferredTranslation={settings?.translation || "KJV"} onQuery={setQuery} onTopic={setTopic} onToggle={toggleVerse} onCollection={addCollection} onImport={importVerse} />}
        {page === "library" && <LibraryPage library={library} verseFor={verseFor} onRemove={toggleVerse} onUpdate={updateLibraryItem} onReview={() => navigate("review")} onStore={() => navigate("store")} />}
        {page === "history" && <HistoryPage history={history} verseFor={verseFor} />}
        {page === "settings" && settings && <SettingsPage user={user} settings={settings} onSave={updateSettings} onSignOut={signOut} />}
        {page === "review" && <ReviewPage key={reviewItems[reviewIndex]?.verseId} items={reviewItems} index={reviewIndex} verse={reviewItems[reviewIndex] ? verseFor(reviewItems[reviewIndex].verseId) : undefined} onRate={rate} onClose={() => navigate("home")} />}
      </main>
      <div className="esv-global"><strong>Noncommercial Scripture-memory project</strong><p>Scripture quotations marked “ESV” are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.</p><p>Users may not copy or download more than 500 verses of the ESV Bible or more than one half of any book of the ESV Bible.</p><a href="https://www.esv.org/" target="_blank" rel="noreferrer">Read at ESV.org</a></div>
      {!online && <div className="offline-badge"><WifiOff/> Offline — saved app screens remain available</div>}

      {page !== "review" && <nav className="mobile-tabs"><button className={page === "home" ? "active" : ""} onClick={() => navigate("home")}><Home />Today</button><button className={page === "reels" ? "active" : ""} onClick={() => navigate("reels")}><Sparkles />Reels</button><button className={page === "store" ? "active" : ""} onClick={() => navigate("store")}><BookOpen />Store</button><button className={page === "library" ? "active" : ""} onClick={() => navigate("library")}><Library />Library</button><button className={page === "history" ? "active" : ""} onClick={() => navigate("history")}><BarChart3 />Progress</button></nav>}
      {toast && <div className="toast"><Check size={17} />{toast}</div>}
    </div>
  );
}

function AuthPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (serverEnabled) {
        const activeUser = mode === "signup" ? await apiSignUp(name.trim(), normalizedEmail, password) : await apiSignIn(normalizedEmail, password);
        onAuthenticated(activeUser); return;
      }
      const users = await getUsers(); const passwordHash = await hashPassword(password);
      if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Please enter your name.");
        if (users.length) throw new Error("This device already has a Selah profile. Sign in to continue.");
        if (users.some(user => user.email === normalizedEmail)) throw new Error("An account with that email already exists on this device.");
        const user: User = { id: crypto.randomUUID(), name: name.trim(), email: normalizedEmail, passwordHash, createdAt: new Date().toISOString() };
        await saveUser(user); await saveSettings({ userId: user.id, translation: "KJV", dailyGoal: 5, theme: "light", reminders: false }); onAuthenticated(user);
      } else {
        const user = users.find(candidate => candidate.email === normalizedEmail && candidate.passwordHash === passwordHash);
        if (!user) throw new Error("That email and password combination wasn’t found."); onAuthenticated(user);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed"); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-story"><div className="brand auth-brand"><span className="brand-mark">S</span><span>Selah<small>scripture memory</small></span></div><div><span className="overline">Keep the Word close</span><blockquote>“Thy word have I hid in mine heart, that I might not sin against thee.”</blockquote><p>Psalm 119:11</p></div></section><section className="auth-form"><div><p className="eyebrow">Welcome to Selah</p><h1>{mode === "signin" ? "Return to your practice." : "Begin your practice."}</h1><p>{mode === "signin" ? "Sign in to continue where you left off." : "Create your secure, synchronized account."}</p><form onSubmit={submit}>{mode === "signup" && <label>Your name<input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required/></label>}<label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} required/></label>{error && <p className="auth-error">{error}</p>}<button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight/></button></form><button className="auth-toggle" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}</button><small className="local-note">Accounts and Scripture records are stored in the project’s PostgreSQL database and isolated by authenticated user ID.</small></div></section></main>;
}

const reelReferences = ["Psalm 23:1-3", "Matthew 6:33-34", "Isaiah 40:31", "Romans 12:2", "Lamentations 3:22-23", "John 15:5", "Hebrews 12:1-2", "James 1:2-4"];

function ReelsPage({ catalog, library, translation: preferred, onPin, onImport }: { catalog: Verse[]; library: LibraryItem[]; translation: "KJV" | "ESV"; onPin: (v: Verse) => void; onImport: (v: Verse) => Promise<void> }) {
  const [reelMode, setReelMode] = useState<"scripture" | "books">("scripture");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [translation, setTranslation] = useState<"KJV" | "ESV">(preferred);
  const [remote, setRemote] = useState<Verse[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const pinned = new Set(library.map(item => item.verseId));
  useEffect(() => {
    if (reelMode !== "scripture" || translation !== "ESV" || remote.length) return;
    let cancelled = false; setLoading(true); setError("");
    (async () => { const loaded: Verse[] = []; for (const reference of reelReferences.slice(0, 5)) { try { loaded.push(await fetchPassage(reference, "ESV")); } catch (err) { if (!loaded.length) setError(err instanceof Error ? err.message : "ESV feed unavailable"); break; } } if (!cancelled) { setRemote(loaded); setLoading(false); } })();
    return () => { cancelled = true; };
  }, [reelMode, translation, remote.length]);
  const feed = translation === "KJV" ? catalog.filter(v => v.translation === "KJV") : [...catalog.filter(v => v.translation === "ESV"), ...remote.filter(v => !catalog.some(c => c.id === v.id))];
  async function pin(verse: Verse) { try { if (catalog.some(v => v.id === verse.id)) await onPin(verse); else await onImport(verse); } catch (err) { setError(err instanceof Error ? err.message : "Could not pin passage"); } }
  return <div className="reels-page">
    <div className="reels-toolbar"><div><span className="overline">Scripture reels</span><h1>{reelMode === "scripture" ? "Pause. Read. Keep." : selectedBook ? `Reading ${selectedBook}` : "The story, book by book."}</h1></div><div className="reels-controls"><div className="reel-mode"><button className={reelMode === "scripture" ? "active" : ""} onClick={() => { setReelMode("scripture"); setSelectedBook(null); }}>Scripture</button><button className={reelMode === "books" ? "active" : ""} onClick={() => setReelMode("books")}>Books</button></div>{reelMode === "scripture" && <label>Translation<select value={translation} onChange={e => { setTranslation(e.target.value as "KJV" | "ESV"); setError(""); }}><option>KJV</option><option>ESV</option><option disabled>More translations coming soon</option></select></label>}</div></div>
    {error && reelMode === "scripture" && <div className="reel-message">{error}</div>}
    {reelMode === "books" ? selectedBook ? <BookVerseReels book={selectedBook} pinned={pinned} onBack={() => setSelectedBook(null)} onPin={pin}/> : <BookReels onSelect={setSelectedBook}/> : loading ? <div className="reel-loading"><i/><p>Gathering ESV passages…</p></div> : feed.length ? <div className="reel-feed">{feed.map((verse, i) => <article className={`reel reel-${i % 4}`} key={verse.id}><div className="reel-ornament">{i % 2 ? "✦" : "❧"}</div><div className="reel-content"><span>{verse.topics[0] || "Scripture"}</span><blockquote>“{verse.text}”</blockquote><p>{verse.reference} <i>{verse.translation}</i></p></div><button className={pinned.has(verse.id) ? "pinned" : ""} onClick={() => pin(verse)}><Bookmark/>{pinned.has(verse.id) ? "Pinned" : "Pin to memorize"}</button>{verse.translation === "ESV" && <small>ESV® © 2001 Crossway. Used by permission. <a href="https://www.esv.org/" target="_blank" rel="noreferrer">ESV.org</a></small>}<div className="scroll-cue">Scroll for more <ArrowRight/></div></article>)}</div> : <div className="empty"><BookOpen/><h2>No passages available</h2><p>Add passages in this translation from the Verse Store.</p></div>}
  </div>;
}

function bookSection(index: number) {
  if (index < 5) return "The Law"; if (index < 17) return "History"; if (index < 22) return "Poetry & Wisdom"; if (index < 27) return "Major Prophets"; if (index < 39) return "Minor Prophets"; if (index < 43) return "The Gospels"; if (index === 43) return "Church History"; if (index < 65) return "The Letters"; return "Prophecy";
}

function BookReels({ onSelect }: { onSelect: (book: string) => void }) {
  return <div className="reel-feed book-feed">{bibleBooks.map(([book, chapters], i) => <article className={`reel book-reel reel-${i % 4}`} key={book}><div className="book-watermark">{String(i + 1).padStart(2, "0")}</div><div className="reel-content"><span>{i < 39 ? "Old Testament" : "New Testament"} · {bookSection(i)}</span><h2>{book}</h2><p>{chapters} {chapters === 1 ? "chapter" : "chapters"}</p><button className="open-book" onClick={() => onSelect(book)}><BookOpen/> Read verses in order</button><div className="book-position"><i style={{ width: `${((i + 1) / bibleBooks.length) * 100}%` }}/></div><small>Book {i + 1} of {bibleBooks.length}</small></div><div className="book-neighbors"><span>{i ? `← ${bibleBooks[i - 1][0]}` : "Beginning"}</span><span>{i < bibleBooks.length - 1 ? `${bibleBooks[i + 1][0]} →` : "The end"}</span></div><div className="scroll-cue">Next book <ArrowRight/></div></article>)}</div>;
}

function BookVerseReels({ book, pinned, onBack, onPin }: { book: string; pinned: Set<string>; onBack: () => void; onPin: (verse: Verse) => Promise<void> }) {
  const [bookVerses, setBookVerses] = useState<Verse[]>([]); const [error, setError] = useState("");
  const [active, setActive] = useState(0); const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => { let live = true; fetchKjvBook(book).then(values => { if (live) setBookVerses(values); }).catch(err => { if (live) setError(err instanceof Error ? err.message : "Book unavailable"); }); return () => { live = false; }; }, [book]);
  function move(direction: -1 | 1) { const next = Math.max(0, Math.min(bookVerses.length - 1, active + direction)); feedRef.current?.querySelectorAll<HTMLElement>(".book-verse")[next]?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === "ArrowDown" || event.key === "PageDown") { event.preventDefault(); move(1); } if (event.key === "ArrowUp" || event.key === "PageUp") { event.preventDefault(); move(-1); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key); });
  if (error) return <div className="reel-loading"><BookOpen/><p>{error}</p><button onClick={onBack}>Back to books</button></div>;
  if (!bookVerses.length) return <div className="reel-loading"><i/><p>Opening {book}…</p></div>;
  return <div className="verse-reels-shell"><div ref={feedRef} className="reel-feed verse-book-feed" tabIndex={0} onScroll={event => { const element = event.currentTarget; setActive(Math.max(0, Math.min(bookVerses.length - 1, Math.round(element.scrollTop / element.clientHeight)))); }}><button className="back-to-books" onClick={onBack}><ArrowLeft/> All books</button>{bookVerses.map((verse, i) => <article className={`reel book-verse reel-${Math.floor((verse.chapter - 1) / 2) % 4}`} key={verse.id}><div className="chapter-watermark">{verse.chapter}</div><div className="reel-content"><span>{book} · Chapter {verse.chapter}</span><blockquote>“{verse.text}”</blockquote><p>{verse.reference} <i>KJV</i></p></div><button className={pinned.has(verse.id) ? "pinned" : ""} onClick={() => onPin(verse)}><Bookmark/>{pinned.has(verse.id) ? "Pinned" : "Pin to memorize"}</button><div className="verse-sequence">Verse {i + 1} of {bookVerses.length}</div>{i === 0 && <div className="swipe-prompt"><ArrowUp/> Swipe or scroll <ArrowDown/></div>}</article>)}</div><div className="reel-nav"><button onClick={() => move(-1)} disabled={active === 0} aria-label="Previous verse"><ArrowUp/></button><span>{active + 1}<i/> {bookVerses.length}</span><button onClick={() => move(1)} disabled={active === bookVerses.length - 1} aria-label="Next verse"><ArrowDown/></button></div></div>;
}

function SettingsPage({ user, settings, onSave, onSignOut }: { user: User; settings: UserSettings; onSave: (value: UserSettings) => void; onSignOut: () => void }) {
  const [draft, setDraft] = useState(settings);
  return <div className="page settings-page"><section className="page-title"><p className="eyebrow">Your Selah</p><h1>Settings</h1><p>Shape a practice that fits your life.</p></section><div className="settings-layout"><aside><div className="settings-avatar">{user.name.split(" ").map(p => p[0]).join("").slice(0,2)}</div><h2>{user.name}</h2><p>{user.email}</p><span><UserRound/> PostgreSQL account</span></aside><section className="settings-panel"><div><span className="overline">Scripture</span><h2>Reading preferences</h2><label>Preferred translation<select value={draft.translation} onChange={e => setDraft({ ...draft, translation: e.target.value as "KJV" | "ESV" })}><option value="KJV">KJV — King James Version</option><option value="ESV">ESV — English Standard Version</option><option disabled>Additional translations coming soon</option></select><small>This preference opens Reels and the Bible browser in your chosen translation.</small></label></div><div><span className="overline">Practice</span><h2>Daily rhythm</h2><label>Daily verse goal<input type="number" min="1" max="50" value={draft.dailyGoal} onChange={e => setDraft({ ...draft, dailyGoal: Number(e.target.value) })}/></label><label className="toggle-line"><span>Daily reminders<small>Receive a gentle prompt to practice.</small></span><input type="checkbox" checked={draft.reminders} onChange={e => setDraft({ ...draft, reminders: e.target.checked })}/></label></div><div><span className="overline">Mobile app</span><h2>Install Selah</h2><p className="install-copy">Add Selah to your home screen for a full-screen, app-like experience.</p><InstallAppButton/></div><button className="primary" onClick={() => onSave(draft)}>Save preferences <Check/></button></section></div><button className="signout" onClick={onSignOut}><LogOut/> Sign out on this device</button></div>;
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null); const [installed, setInstalled] = useState(window.matchMedia("(display-mode: standalone)").matches);
  useEffect(() => { const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPromptEvent); }; const done = () => setInstalled(true); window.addEventListener("beforeinstallprompt", ready); window.addEventListener("appinstalled", done); return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); }; }, []);
  if (installed) return <div className="installed-state"><Check/> Selah is installed on this device</div>;
  if (!prompt) return <div className="install-help"><Download/> On iPhone, tap Share → Add to Home Screen. On Android, open the browser menu → Install app.</div>;
  return <button className="install-button" onClick={async () => { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === "accepted") setInstalled(true); setPrompt(null); }}><Download/> Install Selah</button>;
}

function HomePage({ due, streak, library, verseFor, onReview, onStore }: { due: number; streak: number; library: LibraryItem[]; verseFor: (id: string) => Verse; onReview: () => void; onStore: () => void }) {
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return <div className="page home-page">
    <section className="welcome"><div><p className="eyebrow">{today}</p><h1>Good morning.</h1><p>Make a little room for the Word today.</p><span className="mobile-streak"><Flame/> {streak}-day streak</span></div><div className="sun-ornament">✦</div></section>
    <section className="review-card"><div className="review-copy"><span className="overline"><Sparkles size={15} /> Today’s practice</span><h2>{due || library.length} {due === 1 ? "verse is" : "verses are"} ready for you</h2><p>A few quiet minutes now can keep these words close all day.</p><button className="primary" onClick={onReview}>Begin review <ArrowRight size={18} /></button></div><div className="progress-ring"><svg viewBox="0 0 100 100"><circle className="track" cx="50" cy="50" r="42"/><circle className="fill" cx="50" cy="50" r="42"/></svg><strong>{due || library.length}</strong><span>due</span></div></section>
    <div className="section-heading"><div><span className="overline">Continue learning</span><h2>Your verses</h2></div><button className="text-button" onClick={onStore}>Explore store <ArrowRight size={16}/></button></div>
    <div className="verse-strip">{library.slice(0, 3).map((item, i) => { const v = verseFor(item.verseId); return <article className="mini-verse" key={v.id}><span className="count">0{i + 1}</span><p>“{v.text.length > 115 ? v.text.slice(0, 115) + "…" : v.text}”</p><div><strong>{v.reference}</strong><span>{item.reviews ? `${item.reviews} reviews` : "New"}</span></div></article> })}</div>
    <section className="daily-verse"><div className="leaf">❧</div><span className="overline">Verse for today</span><blockquote>“Thy word is a lamp unto my feet,<br/>and a light unto my path.”</blockquote><p>Psalm 119:105 <i>KJV</i></p></section>
  </div>;
}

function StorePage({ filtered, topics, topic, query, library, preferredTranslation, onQuery, onTopic, onToggle, onCollection, onImport }: { filtered: Verse[]; topics: string[]; topic: string; query: string; library: LibraryItem[]; preferredTranslation: "KJV" | "ESV"; onQuery: (q: string) => void; onTopic: (t: string) => void; onToggle: (v: Verse) => void; onCollection: (name: string, verseIds?: string[]) => void; onImport: (v: Verse) => void }) {
  const saved = new Set(library.map(i => i.verseId));
  const [community, setCommunity] = useState<CommunityCollection[]>([]);
  const [communityTags, setCommunityTags] = useState<Record<string, { tag: string; uses: number }[]>>({});
  const [preview, setPreview] = useState<{ title: string; description: string; curator: string; verseIds: string[] } | null>(null);
  useEffect(() => { apiCollections().then(setCommunity).catch(() => setCommunity([])); apiCommunityTags().then(setCommunityTags).catch(() => setCommunityTags({})); }, []);
  const openCurated = (pack: typeof packs[number]) => setPreview({ title: pack.name, description: pack.description, curator: "Curated by Selah", verseIds: verses.filter(v => v.pack === pack.name).map(v => v.id) });
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

function BibleBrowser({ preferredTranslation, onImport }: { preferredTranslation: "KJV" | "ESV"; onImport: (verse: Verse) => void }) {
  const [book, setBook] = useState("John");
  const [chapter, setChapter] = useState(3);
  const [verseRange, setVerseRange] = useState("16");
  const [translation, setTranslation] = useState<"KJV" | "ESV">(preferredTranslation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const maxChapters = bibleBooks.find(([name]) => name === book)?.[1] || 1;
  async function add() {
    setLoading(true); setError("");
    try { await fetchPassage(`${book} ${chapter}:${verseRange}`, translation).then(onImport); }
    catch (err) { setError(err instanceof Error ? err.message : "Passage could not be loaded"); }
    finally { setLoading(false); }
  }
  return <section className="bible-browser"><div><span className="overline">The whole Bible</span><h2>Add any passage</h2><p>Choose a book, chapter, verse or range, and translation.</p></div><div className="passage-picker"><label>Book<select value={book} onChange={e => { setBook(e.target.value); setChapter(1); }}>{bibleBooks.map(([name]) => <option key={name}>{name}</option>)}</select></label><label>Chapter<select value={chapter} onChange={e => setChapter(Number(e.target.value))}>{Array.from({ length: maxChapters }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select></label><label>Verse(s)<input value={verseRange} onChange={e => setVerseRange(e.target.value.replace(/[^0-9-]/g, ""))} placeholder="1 or 1-5"/></label><label>Translation<select value={translation} onChange={e => setTranslation(e.target.value as "KJV" | "ESV")}><option>KJV</option><option>ESV</option></select></label><button className="primary" onClick={add} disabled={loading || !verseRange}>{loading ? "Loading…" : <><Plus/> Add passage</>}</button></div>{error && <p className="browser-error">{error}</p>}<small>{translation === "ESV" ? <>ESV requires a free Crossway API key. <a href="https://api.esv.org/" target="_blank" rel="noreferrer">Get one here.</a></> : "KJV passages are loaded from the public GetBible catalog."}</small></section>;
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
    {library.length ? <div className="library-list">{shown.map(item => { const v = verseFor(item.verseId); return <article key={v.id}><div className="book-tile">{v.book.slice(0, 2).toUpperCase()}</div><div className="library-copy"><span>{item.collection}</span><h3>{v.reference} <i>{v.translation}</i></h3><p>{v.text}</p><TagEditor item={item} onUpdate={onUpdate}/><div className="mastery"><span style={{ width: `${Math.min(100, item.stage * 18)}%` }}/></div><small>Stage {item.stage} · {item.reviews} reviews</small></div><button className="icon-button" title="Remove verse" onClick={() => onRemove(v)}><X/></button></article> })}</div> : <div className="empty"><BookOpen/><h2>Your library is waiting</h2><p>Choose a few passages to begin your practice.</p><button className="primary" onClick={onStore}>Explore Verse Store</button></div>}
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

function ReviewPage({ items, index, verse, onRate, onClose }: { items: LibraryItem[]; index: number; verse?: Verse; onRate: (r: ReviewRating, summary: ExerciseSummary) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"easy" | "hard">("easy");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [activeBlank, setActiveBlank] = useState<number | null>(null);
  const [graded, setGraded] = useState(false);
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const words = verse?.text.split(" ") || [];
  const blankIndexes = words.map((_, i) => i).filter(i => i % 3 === 1);
  useEffect(() => { setActiveBlank(blankIndexes[0] ?? null); }, [verse?.id, mode]);
  useEffect(() => { if (mode === "hard" && activeBlank !== null) { window.setTimeout(() => inputRefs.current[activeBlank]?.focus(), 40); } }, [mode, activeBlank]);
  if (!verse) return <div className="empty"><h2>No verses to review</h2><button onClick={onClose}>Return home</button></div>;
  const isCorrect = (i: number) => cleanWord(answers[i] || "") === cleanWord(words[i]);
  const correctCount = blankIndexes.filter(isCorrect).length;
  const choicesFor = (blank: number) => {
    const answer = cleanWord(words[blank]);
    const candidates = words.map(cleanWord).filter((word, i, all) => word && word !== answer && all.indexOf(word) === i);
    const start = blank % Math.max(1, candidates.length);
    return [answer, ...candidates.slice(start, start + 3), ...candidates.slice(0, 3)].slice(0, 4).sort((a, b) => (a.charCodeAt(0) + blank) % 7 - (b.charCodeAt(0) + blank) % 7);
  };
  const nextBlank = (current: number) => blankIndexes.find(i => i > current && !answers[i]) ?? blankIndexes.find(i => !answers[i] && i !== current) ?? null;
  const changeMode = (next: "easy" | "hard") => { setMode(next); setAnswers({}); setActiveBlank(blankIndexes[0] ?? null); setGraded(false); };
  const allAnswered = blankIndexes.every(i => Boolean(answers[i]?.trim()));
  const summary = (): ExerciseSummary => ({ mode, correct: correctCount, total: blankIndexes.length, percentage: Math.round((correctCount / blankIndexes.length) * 100), answers: blankIndexes.map(i => ({ expected: cleanWord(words[i]), actual: cleanWord(answers[i] || ""), correct: isCorrect(i) })) });

  return <div className="review-page"><div className="review-top"><button onClick={onClose}><ArrowLeft/> End session</button><span>{index + 1} of {items.length}</span><div className="review-progress"><i style={{ width: `${((index + 1) / items.length) * 100}%` }}/></div></div><section className="recall-card interactive"><span className="overline">Recall from memory</span><h1>{verse.reference}</h1><div className="mode-switch" role="group" aria-label="Review difficulty"><button className={mode === "easy" ? "active" : ""} onClick={() => changeMode("easy")}>Easy <span>choose words</span></button><button className={mode === "hard" ? "active" : ""} onClick={() => changeMode("hard")}>Hard <span>type from memory</span></button></div>
    <div className="blank-guide"><span>Blank {activeBlank === null ? blankIndexes.length : blankIndexes.indexOf(activeBlank) + 1} of {blankIndexes.length}</span><i><b style={{ width: `${((Object.keys(answers).filter(key => answers[Number(key)]).length) / blankIndexes.length) * 100}%` }}/></i><small>{mode === "easy" ? "Choose the word that belongs in the highlighted space" : "Type the missing word, then press Enter to continue"}</small></div>
    <div className="passage-exercise">{words.map((word, i) => blankIndexes.includes(i) ? mode === "easy" ? <button key={i} aria-current={activeBlank === i ? "step" : undefined} className={`word-blank ${activeBlank === i ? "active" : ""} ${answers[i] ? "filled" : ""} ${graded ? isCorrect(i) ? "correct" : "incorrect" : ""}`} onClick={() => !graded && setActiveBlank(i)}>{answers[i] || "•••••"}</button> : <input key={i} ref={element => { inputRefs.current[i] = element; }} aria-label={`Missing word ${blankIndexes.indexOf(i) + 1}`} className={`word-input ${activeBlank === i ? "active" : ""} ${graded ? isCorrect(i) ? "correct" : "incorrect" : ""}`} value={answers[i] || ""} disabled={graded} style={{ width: `${Math.max(62, cleanWord(word).length * 13)}px` }} onFocus={() => setActiveBlank(i)} onChange={e => setAnswers({ ...answers, [i]: e.target.value })} onKeyDown={e => { if ((e.key === "Enter" || e.key === "Tab") && answers[i]?.trim()) { e.preventDefault(); setActiveBlank(nextBlank(i)); } }}/> : <span key={i}>{word} </span>)}</div>
    <span className="translation">{verse.translation}</span>
    {mode === "easy" && activeBlank !== null && !graded && <div className="choice-tray"><div className="choice-heading"><span>{blankIndexes.indexOf(activeBlank) + 1}</span><p>Choose the missing word</p></div><div>{choicesFor(activeBlank).map(choice => <button key={choice} onClick={() => { const updated = { ...answers, [activeBlank]: choice }; setAnswers(updated); const next = blankIndexes.find(i => i > activeBlank && !updated[i]) ?? blankIndexes.find(i => !updated[i]) ?? null; setActiveBlank(next); }}>{choice}</button>)}</div></div>}
    {!graded ? <button className="primary check-answer" disabled={!allAnswered} onClick={() => setGraded(true)}>Check answers <Check/></button> : <><div className={`score ${correctCount === blankIndexes.length ? "perfect" : ""}`}><strong>{correctCount} of {blankIndexes.length} correct</strong><span>{correctCount === blankIndexes.length ? "Beautifully remembered." : "The correct words are shown below each miss."}</span></div>{correctCount < blankIndexes.length && <div className="corrections">{blankIndexes.filter(i => !isCorrect(i)).map(i => <span key={i}><s>{answers[i] || "blank"}</s> → <strong>{cleanWord(words[i])}</strong></span>)}</div>}<div className="ratings"><p>How should we schedule this verse?</p><div><button onClick={() => onRate("again", summary())}><strong>Again</strong><span>10 min</span></button><button onClick={() => onRate("hard", summary())}><strong>Hard</strong><span>1 day</span></button><button onClick={() => onRate("good", summary())}><strong>Good</strong><span>2+ days</span></button><button onClick={() => onRate("easy", summary())}><strong>Easy</strong><span>4+ days</span></button></div></div></>}
  </section><p className="review-hint">Take your time. This isn’t a test—it’s a practice.</p></div>;
}

export default App;
