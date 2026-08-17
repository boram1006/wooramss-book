function cleanText(value, maxLength = 300) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|lt|gt);/gi, ' ')
    .replace(/[“”‘’"']/g, '')
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
  const text = cleanText(value, 600);
  if (!text) return '';
  const promotional = /베스트셀러|판매(?:량|를|가)?|출간되|출판사|시리즈\s*(?:합계|누계)?|무삭제 완역|세이펜|수상작|\d+\s*권(?:이다|입니다)?\.?$/;
  const sentences = text.split(/(?<=[.!?。])\s+/).map(sentence => sentence.trim()).filter(Boolean);
  let sentence = sentences.find(candidate => !promotional.test(candidate)) || '';
  if (!sentence && sentences.length === 1 && !promotional.test(text)) sentence = text;
  if (!sentence) return '';

  sentence = sentence.replace(/[.!?。]+$/, '').trim();
  if (sentence.length > 130) {
    const shortened = sentence.slice(0, 130);
    const boundary = shortened.lastIndexOf(' ');
    sentence = `${shortened.slice(0, boundary >= 80 ? boundary : 130).trim()}…`;
  }
  return sentence;
}

function titleWithObjectParticle(title) {
  const value = cleanText(title, 80) || '이 책';
  const last = value.charCodeAt(value.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `『${value}』${hasBatchim ? '을' : '를'}`;
}

function cleanGeneratedRecommendationReason(value, key) {
  const text = cleanText(value, 400);
  if (!text) return '';
  const escapedKey = String(key ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escapedKey
    ? text.replace(new RegExp(`^\\s*${escapedKey}\\s*[:.)-]\\s*`), '').trim()
    : text;
}

function formatRecommendationEvidence(value) {
  const text = cleanText(value, 160);
  return text
    .replace(/^명시 관심사 일치:\s*/, '직접 선택한 관심사: ')
    .replace(/(.+?) 테마 완독 (\d+)회/, '최근 $1 주제 책 완독 $2회')
    .replace(/(.+?) 테마 집중 (\d+)회/, '$1 주제 책에서 높은 집중 $2회')
    .replace(/(.+?) 테마 질문 많음 (\d+)회/, '$1 주제 책에서 질문 많음 $2회');
}

function toFriendlySentence(value) {
  const text = String(value || '').replace(/[.!?。]+$/, '').trim();
  if (!text) return '';
  const friendly = text
    .replace(/그림책이다$/, '그림책이에요')
    .replace(/책이다$/, '책이에요')
    .replace(/이야기다$/, '이야기예요')
    .replace(/입니다$/, '이에요');
  return completeSentence(friendly);
}

function buildFallbackRecommendationReason({ title, description, ruleReasons, themes, recType, hasPersonalEvidence = false }) {
  const snippet = descriptionSnippet(description);
  const bookTitle = cleanText(title, 80) || '이 책';
  const detail = snippet
    ? toFriendlySentence(snippet)
    : '표지와 장면을 천천히 살펴보며 어떤 이야기일지 함께 상상해 보세요.';

  if (hasPersonalEvidence && ruleReasons?.[0]) {
    const primary = completeSentence(ruleReasons[0]);
    return `${primary} 『${bookTitle}』에서는 ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`.slice(0, 300).trim();
  }

  const selection = recType === 'explore'
    ? `${titleWithObjectParticle(bookTitle)} 평소와 다른 관심을 가볍게 만나볼 신간으로 골랐어요.`
    : themes?.length
      ? `${titleWithObjectParticle(bookTitle)} ${themes.slice(0, 2).join('·')} 이야기를 만나볼 신간으로 골랐어요.`
      : `${titleWithObjectParticle(bookTitle)} 새로운 이야기를 만나볼 신간으로 골랐어요.`;
  return `${selection} ${detail}`.slice(0, 300).trim();
}

module.exports = {
  buildFallbackRecommendationReason,
  cleanGeneratedRecommendationReason,
  cleanText,
  descriptionSnippet,
  formatRecommendationEvidence,
  toFriendlySentence,
  titleWithObjectParticle
};
