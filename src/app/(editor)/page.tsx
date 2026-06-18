// src/app/(editor)/page.tsx
// The (editor) route group has no path segment of its own, so this page is
// the landing surface when something inside the group resolves to '/'. We
// just bounce to /cycle/current which auto-creates this month if needed.

import { redirect } from 'next/navigation';

export default function EditorIndexPage() {
  redirect('/cycle/current');
}
