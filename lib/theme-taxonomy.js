const THEME_GROUPS = Object.freeze([
  {
    id: 'relationships',
    label: '관계와 사회성',
    themes: ['가족', '친구·우정', '형제자매', '이웃·공동체', '배려·나눔', '다양성·존중']
  },
  {
    id: 'emotions',
    label: '마음과 성장',
    themes: ['감정 이해', '자존감·나다움', '성장·자립', '용기·도전', '공감·위로', '갈등·화해']
  },
  {
    id: 'interests',
    label: '관심 세계',
    themes: ['동물·생명', '자연·계절', '환경·공존', '과학·탐구', '탈것·도시', '음식·요리', '몸·건강', '문화·전통']
  },
  {
    id: 'story',
    label: '이야기 경험',
    themes: ['일상생활', '상상·판타지', '모험·탐험', '유머·말놀이', '예술·창작', '문제해결']
  }
]);

const THEME_CATALOG = Object.freeze(THEME_GROUPS.flatMap(group => group.themes));

const ALIASES = Object.freeze({
  '가족': ['가족', '가족애', '가족사랑', '가족의사랑', '가족관계', '엄마', '아빠', '부모', '할머니', '할아버지', '조부모'],
  '친구·우정': ['친구', '우정', '친구관계', '친구와의우정', '우정과협력'],
  '형제자매': ['형제', '자매', '남매', '형제애', '형제관계', '자매관계'],
  '이웃·공동체': ['이웃', '공동체', '사회', '마을', '함께살기'],
  '배려·나눔': ['배려', '나눔', '도움', '협력', '양보', '친절', '돌봄'],
  '다양성·존중': ['다양성', '존중', '다름', '편견', '평등', '포용', '개성'],
  '감정 이해': ['감정', '마음', '감정표현', '감정조절', '기분', '화', '분노', '슬픔', '불안', '두려움', '외로움'],
  '자존감·나다움': ['자존감', '나다움', '자아', '자기긍정', '자기이해', '정체성', '자신감'],
  '성장·자립': ['성장', '성장과변화', '변화와성장', '독립', '자립', '성장과독립', '성장과자립'],
  '용기·도전': ['용기', '도전', '도전정신', '극복', '두려움극복', '실패', '끈기', '인내'],
  '공감·위로': ['공감', '위로', '사랑', '애정', '마음돌봄', '치유'],
  '갈등·화해': ['갈등', '화해', '사과', '용서', '다툼', '문제해결'],
  '동물·생명': ['동물', '생명', '고양이', '강아지', '개', '공룡', '곤충', '새', '물고기', '곰', '토끼', '호랑이', '사자'],
  '자연·계절': ['자연', '계절', '자연관찰', '자연탐구', '숲', '바다', '산', '봄', '여름', '가을', '겨울', '날씨', '비', '눈'],
  '환경·공존': ['환경', '공존', '환경보호', '생태', '지구', '재활용', '기후'],
  '과학·탐구': ['과학', '탐구', '호기심', '관찰', '우주', '실험', '발견', '수학', '숫자'],
  '탈것·도시': ['탈것', '자동차', '기차', '버스', '비행기', '배', '교통', '도시'],
  '음식·요리': ['음식', '요리', '먹거리', '간식', '빵', '채소', '과일', '식사'],
  '몸·건강': ['몸', '건강', '신체', '병원', '의사', '치과', '위생', '안전', '운동'],
  '문화·전통': ['문화', '전통', '명절', '크리스마스', '설날', '민속', '역사', '세계문화'],
  '일상생활': ['일상', '일상의소중함', '생활', '등원', '유치원', '어린이집', '잠', '목욕', '배변', '습관', '놀이'],
  '상상·판타지': ['상상', '상상력', '환상', '판타지', '마법', '꿈', '창의성', '상상력과창의성'],
  '모험·탐험': ['모험', '탐험', '여행', '여행과모험', '모험과탐험'],
  '유머·말놀이': ['유머', '말놀이', '재미', '웃음', '언어유희', '의성어', '의태어'],
  '예술·창작': ['예술', '미술', '음악', '그림', '그리기', '만들기', '창작', '춤'],
  '문제해결': ['문제해결', '추리', '미스터리', '찾기', '생각', '지혜']
});

const NON_THEME_TERMS = new Set([
  '번역', '그림책', '시리즈', '반복', '플랩북', '조작북', '글없는그림책', '전래동화', '동시', '정보책'
]);

function compact(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-·/,&()'".]/g, '');
}

const ALIAS_TO_THEME = new Map();
for (const theme of THEME_CATALOG) {
  ALIAS_TO_THEME.set(compact(theme), theme);
  for (const alias of ALIASES[theme] || []) ALIAS_TO_THEME.set(compact(alias), theme);
}

function canonicalizeTheme(value) {
  const key = compact(value);
  if (!key || NON_THEME_TERMS.has(key)) return null;
  if (ALIAS_TO_THEME.has(key)) return ALIAS_TO_THEME.get(key);

  // 긴 복합 표현(예: "가족과 이웃의 사랑")도 가장 구체적인 별칭으로 흡수한다.
  const matches = [];
  for (const [alias, theme] of ALIAS_TO_THEME.entries()) {
    if (alias.length >= 2 && key.includes(alias)) matches.push({ alias, theme });
  }
  matches.sort((a, b) => b.alias.length - a.alias.length);
  return matches[0]?.theme || null;
}

function splitThemeValues(value) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(/[,|;/\n]+/);
}

function normalizeThemes(value, limit = 8) {
  const result = [];
  for (const raw of splitThemeValues(value)) {
    const canonical = canonicalizeTheme(raw);
    if (canonical && !result.includes(canonical)) result.push(canonical);
    if (result.length >= limit) break;
  }
  return result;
}

function inferThemes(book, limit = 3) {
  const sourceThemes = normalizeThemes(book?.themes || book?.['테마'], limit);
  if (sourceThemes.length >= limit) return sourceThemes.slice(0, limit);

  const haystack = compact([
    book?.title || book?.['제목'],
    book?.description || book?.['설명'],
    book?.features || book?.['특징']
  ].filter(Boolean).join(' '));
  const scores = new Map(sourceThemes.map((theme, index) => [theme, 100 - index]));

  for (const theme of THEME_CATALOG) {
    for (const alias of ALIASES[theme] || []) {
      const key = compact(alias);
      if (key.length >= 2 && haystack.includes(key)) {
        scores.set(theme, (scores.get(theme) || 0) + Math.min(8, key.length));
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || THEME_CATALOG.indexOf(a[0]) - THEME_CATALOG.indexOf(b[0]))
    .map(([theme]) => theme)
    .slice(0, limit);
}

module.exports = {
  THEME_GROUPS,
  THEME_CATALOG,
  canonicalizeTheme,
  normalizeThemes,
  inferThemes
};
