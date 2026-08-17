const { normalizeThemes } = require('./theme-taxonomy');
const { inferAladinThemes } = require('./aladin-book-themes');

function parseThemes(raw) {
  return normalizeThemes(raw, 8).map(theme => theme.toLowerCase());
}

function resolveBookThemes(book, limit = 3) {
  const metadataThemes = parseThemes(book?.fields?.['테마']);
  const text = `${book?.fields?.['제목'] || ''} ${book?.fields?.['설명'] || ''}`.toLowerCase();
  const ownedBookHints = [];
  if (/야구|축구|농구|수영|스키|운동|스포츠/.test(text)) ownedBookHints.push('몸·건강');
  if (/그림책\s*만들기|책\s*만들기|직접\s*그리|작품\s*만들기/.test(text)) ownedBookHints.push('예술·창작');
  const contentThemes = inferAladinThemes({
    title: book?.fields?.['제목'],
    description: book?.fields?.['설명']
  }, limit).themes.map(theme => theme.toLowerCase());
  return [...new Set([...ownedBookHints, ...contentThemes, ...metadataThemes])].slice(0, limit);
}

function parseAgeRange(value) {
  const match = String(value || '').match(/(\d+)\s*[-~]\s*(\d+)/);
  if (match) return { min: Number(match[1]), max: Number(match[2]) };
  const single = String(value || '').match(/(\d+)/);
  return single ? { min: Number(single[1]), max: 99 } : null;
}

function isAgeEligible(book, ageMonths) {
  const range = parseAgeRange(book?.fields?.['연령']);
  if (!range || !Number.isFinite(ageMonths)) return true;
  return range.min - ageMonths / 12 <= 1.25;
}

function hasStrongPersonalEvidence(evidence) {
  return (evidence || []).some(item => {
    if (/^명시 관심사 일치:/.test(item)) return true;
    if (/테마 (?:집중|질문 많음) [1-9]\d*회/.test(item)) return true;
    const completed = item.match(/테마 완독 (\d+)회/);
    return completed ? Number(completed[1]) >= 2 : false;
  });
}

module.exports = {
  hasStrongPersonalEvidence,
  isAgeEligible,
  parseAgeRange,
  parseThemes,
  resolveBookThemes
};
