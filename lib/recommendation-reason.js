function cleanText(value, maxLength = 300) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function completeSentence(value) {
  const text = cleanText(value, 180).replace(/[,.\s]+$/, '');
  if (!text) return '';
  return /[.!?。]$/.test(text) ? text : `${text}.`;
}

function descriptionSnippet(value) {
  const text = cleanText(value, 240);
  if (!text) return '';
  const first = text.split(/(?<=[.!?。])\s+/)[0] || text;
  return first.replace(/[.!?。]+$/, '').slice(0, 72).trim();
}

function buildFallbackRecommendationReason({ title, description, ruleReasons, themes, recType }) {
  const primary = completeSentence(ruleReasons?.[0])
    || completeSentence(themes?.length ? `‘${themes.slice(0, 2).join(', ')}’ 주제의 책으로 골랐어요` : '최근 읽기 기록을 바탕으로 골랐어요');
  const snippet = descriptionSnippet(description);
  const bookTitle = cleanText(title, 80) || '이 책';
  const connection = recType === 'explore'
    ? '평소와 조금 다른 이야기로 관심을 넓혀볼 수 있어요.'
    : '아이가 좋아하던 관심을 책 속 장면과 자연스럽게 이어볼 수 있어요.';
  const detail = snippet
    ? `『${bookTitle}』의 “${snippet}” 내용을 함께 살펴보며 ${connection}`
    : `『${bookTitle}』을 펼쳐 표지와 장면을 함께 살펴보며 ${connection}`;
  return `${primary} ${detail}`.slice(0, 240).trim();
}

module.exports = { buildFallbackRecommendationReason, cleanText, descriptionSnippet };
