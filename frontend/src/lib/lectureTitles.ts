/** Auto-suggest lecture card title: Лекция 1, Лекция 2, … */
export function suggestLectureTitle(existingCount: number): string {
  return `Лекция ${Math.max(1, existingCount + 1)}`;
}

export function isAutoLectureTitle(title: string, existingCount: number): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  const expected = suggestLectureTitle(existingCount);
  return trimmed === expected || /^Лекция\s+\d+$/i.test(trimmed);
}
