export type Verse = {
  id: string;
  reference: string;
  book: string;
  chapter: number;
  verse: string;
  text: string;
  translation: string;
  topics: string[];
  pack?: string;
};

export type LibraryItem = {
  verseId: string;
  addedAt: string;
  stage: number;
  reviews: number;
  nextReview: string;
  collection: string;
  tags?: string[];
};

export type CommunityCollection = { id: string; title: string; description: string; curator: string; category: string; verseIds: string[]; featured: boolean };

export type ReviewRating = "again" | "hard" | "good" | "easy";

export type User = { id: string; name: string; email: string; passwordHash?: string; createdAt: string };
export type UserSettings = { userId: string; translation: "KJV" | "ESV"; dailyGoal: number; theme: "light" | "system"; reminders: boolean };

export type ReviewResult = {
  id: string;
  verseId: string;
  reviewedAt: string;
  mode: "easy" | "hard";
  correct: number;
  total: number;
  percentage: number;
  rating: ReviewRating;
  answers: { expected: string; actual: string; correct: boolean }[];
};
