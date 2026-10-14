import { useState } from "react";
import { ArrowRight, BookHeart, Search } from "lucide-react";
import type { LibraryItem, Verse } from "../types";

export function MemoryBankPage({ items, verseFor, onQuiz, onLibrary, onUpdate }: {
  items: LibraryItem[];
  verseFor: (id: string) => Verse;
  onQuiz: (items: LibraryItem[]) => void;
  onLibrary: () => void;
  onUpdate: (item: LibraryItem) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const shown = items.filter(item => {
    const verse = verseFor(item.verseId);
    return `${verse.reference} ${verse.text} ${verse.translation}`.toLowerCase().includes(query.toLowerCase());
  });
  async function resumeLearning(item: LibraryItem) {
    try { await onUpdate({ ...item, memorized: false }); setError(""); }
    catch { setError("Could not update this verse. Please try again."); }
  }
  return <div className="page memory-bank-page">
    <section className="page-title"><p className="eyebrow">Keep what you have learned</p><h1>Memory Bank</h1><p>{items.length} memorized {items.length === 1 ? "passage" : "passages"}. Return often to keep the words close.</p></section>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {items.length ? <>
      <section className="memory-bank-quiz"><div><span className="overline">Recall without hints</span><h2>A fresh order, every time.</h2><p>Quiz yourself on your memorized verses in a random order. Each verse appears once per session, and your answers are saved to Progress.</p></div><button className="primary" onClick={() => onQuiz(items)}>Start random quiz <ArrowRight/></button></section>
      <label className="memory-bank-search"><Search size={18}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search memorized verses" placeholder="Search memorized verses"/></label>
      <div className="memory-bank-grid">{shown.map(item => {
        const verse = verseFor(item.verseId);
        return <article key={verse.id}><span className="overline">Memorized · {verse.translation}</span><h2>{verse.reference}</h2><p>{verse.text}</p><div><button className="text-button" onClick={() => onQuiz([item])}>Quiz this verse <ArrowRight size={15}/></button><button className="memory-bank-resume" onClick={() => void resumeLearning(item)}>Move back to learning</button></div></article>;
      })}</div>
      {!shown.length && <p className="memory-bank-no-results">No memorized verses match your search.</p>}
    </> : <div className="empty"><BookHeart/><h2>Your words, remembered.</h2><p>Mark a passage as memorized in My Library, or reach stage 6 with a successful review. It will appear here for future quizzes.</p><button className="primary" onClick={onLibrary}>Open My Library <ArrowRight/></button></div>}
  </div>;
}
