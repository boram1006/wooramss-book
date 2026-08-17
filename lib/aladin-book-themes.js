const { normalizeThemes } = require('./theme-taxonomy');

const RULES = Object.freeze([
  ['가족', ['가족', '가족애', '가족 관계'], ['엄마', '아빠', '부모', '할머니', '할아버지', '딸', '아들', '동생', '언니', '누나', '형', '오빠']],
  ['형제자매', ['형제자매', '형제', '자매', '남매'], ['동생', '언니', '누나', '형', '오빠']],
  ['친구·우정', ['친구', '우정', '단짝'], []],
  ['이웃·공동체', ['이웃', '마을 사람', '공동체'], ['마을']],
  ['배려·나눔', ['배려', '나눔', '양보', '도와주', '돌봐주'], ['친절', '협력']],
  ['다양성·존중', ['다양성', '존중', '편견', '서로 다름'], ['다른 모습', '차이']],
  ['감정 이해', ['감정', '마음 표현', '기분', '두려움', '외로움', '슬픔', '불안', '무서워'], ['화가 나']],
  ['자존감·나다움', ['자기다움', '있는 그대로', '자존감', '나답게', '자신을 사랑'], ['자신감', '콤플렉스']],
  ['성장·자립', ['성장', '자립', '독립', '혼자서'], ['처음으로']],
  ['용기·도전', ['용기', '도전', '극복', '두려움을 이겨'], ['포기하지', '해내']],
  ['공감·위로', ['공감', '위로', '마음을 보듬', '사랑해'], ['따뜻한 마음']],
  ['갈등·화해', ['갈등', '화해', '다툼', '괴롭힘', '골목대장', '사투'], ['싸우', '이기는']],
  ['동물·생명', ['동물', '강아지', '고양이', '공룡', '곤충', '박쥐', '수탉'], ['곰', '토끼', '호랑이', '사자', '새']],
  ['자연·계절', ['자연', '계절', '숲속', '바닷속', '날씨'], ['숲', '바다', '봄', '여름', '가을', '겨울']],
  ['환경·공존', ['환경', '공존', '생태', '기후', '재활용'], ['지구를 지키']],
  ['과학·탐구', ['과학', '탐구', '실험', '우주', '수학'], ['관찰', '발견', '호기심']],
  ['탈것·도시', ['자동차', '기차', '버스', '비행기', '교통수단'], ['탈것', '도시']],
  ['음식·요리', ['요리', '음식', '레시피'], ['빵', '채소', '과일', '식사']],
  ['몸·건강', ['건강', '병원', '치과', '위생', '신체'], ['운동', '안전']],
  ['문화·전통', ['전통', '명절', '설날', '민속', '세계 문화'], ['역사', '크리스마스']],
  ['일상생활', ['일상생활', '유치원', '어린이집', '등굣길', '잠자리'], ['목욕', '배변', '산책']],
  ['상상·판타지', ['판타지', '마법', '상상의 세계', '신기한 여행'], ['공주', '요정', '괴물']],
  ['모험·탐험', ['모험', '탐험', '여행을 떠나', '신기한 여행'], ['여행']],
  ['유머·말놀이', ['유머', '말놀이', '언어유희', '의성어', '의태어'], ['유쾌', '엉뚱', '웃음']],
  ['예술·창작', ['명화', '예술', '미술', '화가', '음악가'], ['그림을 그', '춤', '연주']],
  ['문제해결', ['문제 해결', '수수께끼', '추리', '미스터리'], ['방법을 찾', '지혜를 모']],
]);

function clean(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[“”‘’"']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function countMatches(text, phrases) {
  return phrases.reduce((count, phrase) => count + (text.includes(phrase) ? 1 : 0), 0);
}

function inferAladinThemes(book, limit = 3) {
  const sourceThemes = normalizeThemes(book?.themes || book?.['테마'], limit);
  if (sourceThemes.length) {
    return { themes: sourceThemes, source: 'metadata', confidence: 'high' };
  }

  const title = clean(book?.title || book?.['제목']);
  // '그림책'은 예술 테마의 '그림'으로 오인하지 않도록 먼저 제거한다.
  const description = clean(book?.description || book?.['설명']).replace(/그림책/g, '책');
  const scored = [];

  for (const [theme, strong, supporting] of RULES) {
    const strongTitle = countMatches(title, strong);
    const strongDescription = countMatches(description, strong);
    const supportTitle = countMatches(title, supporting);
    const supportDescription = countMatches(description, supporting);
    let score = strongTitle * 6 + strongDescription * 4 + supportTitle * 4 + supportDescription * 2;

    // 가족은 인물 호칭 하나만으로 확정하지 않는다. 관계 표현 또는 호칭 두 개가 필요하다.
    if (theme === '가족') {
      const directFamily = countMatches(`${title} ${description}`, strong) > 0;
      const kinshipCount = new Set(supporting.filter(word => `${title} ${description}`.includes(word))).size;
      if (!directFamily && kinshipCount < 2) score = 0;
    }

    if (score >= 4) scored.push({ theme, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const themes = scored.slice(0, limit).map(item => item.theme);
  return {
    themes,
    source: themes.length ? 'context_rules' : 'none',
    confidence: themes.length ? 'high' : 'none'
  };
}

module.exports = { inferAladinThemes };
