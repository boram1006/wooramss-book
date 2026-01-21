// Vercel Serverless Function
// 우람이를 위한 추천 (Rule 기반 점수 시스템)

const { createClient } = require('@supabase/supabase-js');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEBUG_RECO = process.env.DEBUG_RECO === '1';

function debugLog(...args) {
  if (DEBUG_RECO) console.log(...args);
}

// Supabase 클라이언트 초기화
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function parseExplicitInterests(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) raw = raw.join(',');
  return String(raw)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// 최근 N일 기준 "하루 평균 읽은 권수" 추정 (서버에서 기본값 만들기)
function estimateBooksPerDayFromLogs(readingLogs, days = 14) {
  if (!Array.isArray(readingLogs) || readingLogs.length === 0) return null;

  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;

  let count = 0;
  for (const log of readingLogs) {
    const d = log?.fields?.['날짜'];
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= start && t <= now) count += 1;
  }

  // days일 동안 몇 권 읽었는지 / days
  const avg = count / days;
  // 너무 튀는 값 방지 (서비스용)
  return clamp(Math.round(avg * 10) / 10, 0, 20);
}

// booksPerDay가 들어오면 그 값을 쓰고, 없으면 로그에서 추정
function resolveBooksPerDay(reqBooksPerDay, readingLogs) {
  const n = Number(reqBooksPerDay);
  if (Number.isFinite(n) && n > 0) return clamp(n, 1, 20);

  const estimated = estimateBooksPerDayFromLogs(readingLogs, 14);
  if (estimated && estimated > 0) return clamp(estimated, 1, 20);

  return 3; // 기본값
}

// booksPerDay에 따라 추천개수(topCount) 조절
function getTopCountByBooksPerDay(booksPerDay) {
  // 1권: 6개 / 3권: 8개 / 5권: 10개 / 8권+: 12개
  if (booksPerDay <= 1) return 6;
  if (booksPerDay <= 3) return 8;
  if (booksPerDay <= 5) return 10;
  return 12;
}

// booksPerDay에 따라 안전/탐색 비율 조절
function getSafeRatioByBooksPerDay(booksPerDay) {
  // 적게 읽는 날: 안전 위주 / 많이 읽는 날: 탐색 확대
  if (booksPerDay <= 1) return 0.85; // 85/15
  if (booksPerDay <= 3) return 0.75; // 75/25
  if (booksPerDay <= 5) return 0.70; // 70/30
  return 0.60; // 60/40
}

// ============================================
// (A/B/C) 관심사/가중치/관심표시(Interested) 보강 설정
// ============================================
const THEME_TOP_K = 6;            // A: "관심사"로 유지할 상위 테마 개수
const GENERIC_THEME_WEIGHT = 0.7; // B: 너무 흔한 테마 down-weight
const INTEREST_BONUS = 6;         // C: 관심 표시 책 bonus (0~10 추천)

const GENERIC_THEMES = new Set([
  '이웃', '가족', '일상', '친구', '사랑', '배려', '공동체', '우정', '성장', '마음', '관계',
  '자연', '동물', '놀이', '유머'
]);

function normalizeTheme(t) {
  return (t || '').trim().toLowerCase();
}

// B: 전체(보유) 책 기준 테마 통계(df) → IDF 가중치 계산용
function buildThemeStats(allBooks) {
  const df = new Map();
  const N = (allBooks || []).length || 1;

  for (const b of (allBooks || [])) {
    const themes = (b?.fields?.['테마'] || '')
      .split(',')
      .map(normalizeTheme)
      .filter(Boolean);

    const uniq = new Set(themes);
    for (const t of uniq) df.set(t, (df.get(t) || 0) + 1);
  }
  return { N, df };
}

// B: 범용 테마 다운 + 희소성(IDF) 업
function themeWeight(theme, themeStats) {
  const t = normalizeTheme(theme);
  if (!t) return 1;

  const N = themeStats?.N || 1;
  const df = themeStats?.df?.get(t) || 0;

  // log((N+1)/(df+1))+1 => 1 이상
  const idf = Math.log((N + 1) / (df + 1)) + 1;
  const generic = GENERIC_THEMES.has(t) ? GENERIC_THEME_WEIGHT : 1;

  const w = idf * generic;
  return Math.max(0.6, Math.min(w, 2.2));
}

// A: 상위 K개 테마만 유지
function keepTopKThemes(themePreferences, k = THEME_TOP_K) {
  const entries = Object.entries(themePreferences || {});
  if (entries.length <= k) return themePreferences || {};

  entries.sort((a, b) => (b[1] || 0) - (a[1] || 0));
  const top = entries.slice(0, k);

  const out = {};
  for (const [t, v] of top) out[t] = v;
  return out;
}

// C: 관심 표시 book 판정 (DB 타입 섞여도 처리)
function isInterestedValue(v) {
  if (v === true) return true;
  if (typeof v === 'number') return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === 'true' || s === 'y' || s === 'yes' || s === '1' || s === '관심' || s === 'o';
  }
  return false;
}

function parseThemes(raw) {
  return String(raw || '')
    .replace(/\r?\n/g, ',')
    .replace(/[|/]/g, ',')
    .replace(/[:：]/g, ',')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .filter(t => t.length <= 20);
}

// ============================================
// 아이 프로필 분석
// ============================================
function analyzeChildProfile(readingLogs, allBooks) {
  if (!readingLogs || readingLogs.length === 0) {
    return {
      hasData: false,
      ageMonths: 31, // 기본값: 31개월
      emotionSensitivity: 'normal',
      themePreferences: {},
      engagementPatterns: {
        completedThemes: {},
        highFocusThemes: {},
        highQuestionThemes: {}
      },
      comfortTriggers: []
    };
  }

  // 날짜 필드가 있으면 사용, 없으면 최근 기록 사용
  const logsWithDates = readingLogs.map(log => {
    const date = log.fields['날짜'] || log.fields['읽은날짜'] || log.fields['읽은 날짜'];
    const logDate = date ? new Date(date) : null;
    const daysAgo = logDate ? Math.floor((Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
    return { log, daysAgo };
  });

  // 최근 기록 (날짜 기준 또는 최근 N개)
  const recentLogs = logsWithDates
    .filter(({ daysAgo }) => daysAgo === null || daysAgo <= 60)
    .sort((a, b) => {
      if (a.daysAgo === null && b.daysAgo === null) return 0;
      if (a.daysAgo === null) return 1;
      if (b.daysAgo === null) return -1;
      return a.daysAgo - b.daysAgo;
    })
    .slice(-30)
    .map(({ log }) => log);

  // 연령 추정 (읽은 책들의 연령 범위 기반)
  const readBooks = recentLogs
    .map(log => allBooks.find(b => b.id === log.fields['책']?.[0]))
    .filter(Boolean)
    .filter(b => b.fields['연령']);

  let ageMonths = 31; // 기본값
  if (readBooks.length > 0) {
    const ageRanges = readBooks
      .map(b => {
        const match = b.fields['연령'].match(/(\d+)[-~](\d+)/);
        if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
        const single = b.fields['연령'].match(/(\d+)/);
        if (single) {
          const age = parseInt(single[1]);
          return { min: age, max: age };
        }
        return null;
      })
      .filter(Boolean);
    
    if (ageRanges.length > 0) {
      const avgMin = ageRanges.reduce((sum, r) => sum + r.min, 0) / ageRanges.length;
      const avgMax = ageRanges.reduce((sum, r) => sum + r.max, 0) / ageRanges.length;
      ageMonths = Math.round((avgMin + avgMax) / 2 * 12);
    }
  }

  // 감정 예민도 (아이 반응 기반)
  const reactions = recentLogs
    .map(log => log.fields['아이반응'])
    .filter(r => r);
  
  const emotionSensitivity = reactions.includes('😰') || reactions.includes('😢') 
    ? 'high' 
    : reactions.includes('😍') || reactions.includes('😊')
    ? 'low'
    : 'normal';

  // 테마별 선호도 계산
  const themePreferences = {};
  const engagementPatterns = {
    completedThemes: {},
    highFocusThemes: {},
    highQuestionThemes: {}
  };

  recentLogs.forEach(log => {
    const logWithDate = logsWithDates.find(l => l.log === log);
    const daysAgo = logWithDate?.daysAgo ?? null;
    
    const book = allBooks.find(b => b.id === log.fields['책']?.[0]);
    if (!book || !book.fields['테마']) return;

    const themes = book.fields['테마']
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(Boolean);

    const reaction = log.fields['아이반응'] || '';
    const completed = log.fields['완독여부'] || false;
    const focusLevel = log.fields['집중정도'] || '';
    const questionLevel = log.fields['질문정도'] || '';

    // 반응을 점수로 변환 (😍=5, 😊=4, 😐=3, 😢=2, 🥱=1)
    const ratingMap = { '😍': 5, '😊': 4, '😐': 3, '😢': 2, '🥱': 1 };
    const rating = ratingMap[reaction] || 3;
    const normalizedRating = (rating - 1) / 4; // 0~1로 정규화

    // 집중도 가중치
    const immersionWeight = focusLevel === '높음' ? 1.0 : focusLevel === '보통' ? 0.6 : 0.3;

    // 최근성 가중치
    let recencyWeight = 1.0;
    if (daysAgo !== null) {
      if (daysAgo <= 14) recencyWeight = 1.5;
      else if (daysAgo <= 60) recencyWeight = 1.0;
      else recencyWeight = 0.7;
    }

    // 테마별 점수 계산
    themes.forEach(theme => {
      if (!themePreferences[theme]) {
        themePreferences[theme] = { scores: [], count: 0 };
      }
      
      const themeScore = (normalizedRating * 0.6 + immersionWeight * 0.4) * recencyWeight;
      themePreferences[theme].scores.push(themeScore);
      themePreferences[theme].count += 1;

      // 완독 패턴
      if (completed) {
        engagementPatterns.completedThemes[theme] = (engagementPatterns.completedThemes[theme] || 0) + 1;
      }

      // 집중 패턴
      if (focusLevel === '높음') {
        engagementPatterns.highFocusThemes[theme] = (engagementPatterns.highFocusThemes[theme] || 0) + 1;
      }

      // 질문 패턴
      if (questionLevel === '많음') {
        engagementPatterns.highQuestionThemes[theme] = (engagementPatterns.highQuestionThemes[theme] || 0) + 1;
      }
    });
  });

  // 테마별 평균 점수 계산
  Object.keys(themePreferences).forEach(theme => {
    const data = themePreferences[theme];
    themePreferences[theme] = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;
  });

  // ✅ A 적용: 상위 K개만 유지
  const topThemePreferences = keepTopKThemes(themePreferences, THEME_TOP_K);

  // 트리거 수집 (memoSummary에서)
  const comfortTriggers = [];
  recentLogs.forEach(log => {
    const memoSummary = log.fields['memoSummary'];
    if (memoSummary) {
      try {
        const summary = JSON.parse(memoSummary);
        if (summary.트리거 && summary.트리거 !== '없음') {
          const triggers = summary.트리거.split(',').map(t => t.trim().toLowerCase());
          comfortTriggers.push(...triggers);
        }
      } catch (e) {
        // JSON 파싱 실패 무시
      }
    }
  });

  return {
    hasData: true,
    ageMonths,
    emotionSensitivity,
    themePreferences: topThemePreferences, // ✅ A
    engagementPatterns,
    comfortTriggers: [...new Set(comfortTriggers)] // 중복 제거
  };
}

// ============================================
// 룰 기반 점수 계산
// ============================================
function calculateRecommendationScore(book, childProfile, allBooks, readingLogs, themeStats, explicitInterests) {
  const breakdown = {
    themePreference: 0,
    engagement: 0,
    comfort: 0,
    age: 0,
    diversity: 0,
    interest: 0 // ✅ C
  };

  const bookThemes = parseThemes(book.fields['테마']);

  // 1. ThemePreferenceScore (55%) ✅ B 적용
  let themeScore = 0;
  let matchedThemes = [];
  
  bookThemes.forEach(theme => {
    const preference = childProfile.themePreferences[theme] || 0;
    if (preference > 0) {
      const w = themeWeight(theme, themeStats); // ✅ B
      themeScore += preference * w;
      matchedThemes.push(theme);
    }
  });

  if (Object.keys(childProfile.themePreferences).length === 0) {
    breakdown.themePreference = 30;
  } else {
    const maxThemeScore = Math.max(...Object.values(childProfile.themePreferences), 1);
    breakdown.themePreference = matchedThemes.length > 0 
      ? (themeScore / matchedThemes.length) * 55 / maxThemeScore
      : 0;
  }

  // 2. EngagementScore (25%)
  let engagementScore = 0;
  const evidence = [];

  bookThemes.forEach(theme => {
    const completedCount = childProfile.engagementPatterns.completedThemes[theme] || 0;
    if (completedCount > 0) {
      engagementScore += completedCount * 3;
      evidence.push(`${theme} 테마 완독 ${completedCount}회`);
    }

    const focusCount = childProfile.engagementPatterns.highFocusThemes[theme] || 0;
    if (focusCount > 0) {
      engagementScore += focusCount * 2;
      evidence.push(`${theme} 테마 집중 ${focusCount}회`);
    }

    const questionCount = childProfile.engagementPatterns.highQuestionThemes[theme] || 0;
    if (questionCount > 0) {
      engagementScore += questionCount * 1;
      evidence.push(`${theme} 테마 질문 많음 ${questionCount}회`);
    }
  });

  if (engagementScore === 0 && !childProfile.hasData) {
    breakdown.engagement = 15;
  } else {
    const maxEngagement = Math.max(
      ...Object.values(childProfile.engagementPatterns.completedThemes),
      ...Object.values(childProfile.engagementPatterns.highFocusThemes),
      ...Object.values(childProfile.engagementPatterns.highQuestionThemes),
      1
    );
    breakdown.engagement = Math.min(engagementScore * 25 / (maxEngagement * 6), 25);
  }

  // 명시 관심사 boost (themePreference에만 적용)
  if (explicitInterests && explicitInterests.length) {
    const matchedExplicit = explicitInterests.filter(t => bookThemes.includes(t));
    if (matchedExplicit.length) {
      const boost = Math.min(matchedExplicit.length * 8, 16);
      breakdown.themePreference = Math.min(55, breakdown.themePreference + boost);
      evidence.unshift(`명시 관심사 일치: ${matchedExplicit.slice(0, 2).join(', ')}`);
    }
  }

  // 3. ComfortScore (20%)
  let comfortScore = 20;

  if (childProfile.emotionSensitivity === 'high') {
    const triggerKeywords = ['갈등', '공포', '슬픔', '이별', '무서움', '놀람', '화남'];
    const bookDescription = (book.fields['설명'] || '').toLowerCase();
    const bookTheme = (book.fields['테마'] || '').toLowerCase();
    
    let hasTrigger = false;
    triggerKeywords.forEach(keyword => {
      if (bookDescription.includes(keyword) || bookTheme.includes(keyword)) {
        hasTrigger = true;
      }
    });

    const bookThemesLower = bookThemes.join(' ');
    childProfile.comfortTriggers.forEach(trigger => {
      if (bookThemesLower.includes(trigger) || bookDescription.includes(trigger)) {
        hasTrigger = true;
      }
    });

    if (hasTrigger) {
      comfortScore -= 10;
    } else {
      const safeThemes = ['일상', '유머', '가족', '친구', '동물', '자연'];
      const hasSafeTheme = bookThemes.some(theme => safeThemes.some(safe => theme.includes(safe)));
      if (hasSafeTheme) comfortScore += 5;
    }
  }

  breakdown.comfort = Math.max(0, Math.min(comfortScore, 20));

  // 4. Age Score (소프트 페널티)
  const ageField = book.fields['연령'] || '';
  const ageMatch = ageField.match(/(\d+)[-~](\d+)/);
  const childAgeYears = childProfile.ageMonths / 12;

  if (ageMatch) {
    const bookMinAge = parseInt(ageMatch[1]);
    const bookMaxAge = parseInt(ageMatch[2]);
    
    if (childAgeYears < bookMinAge) breakdown.age = -5;
    else if (childAgeYears > bookMaxAge + 2) breakdown.age = -10;
    else if (childAgeYears >= bookMinAge && childAgeYears <= bookMaxAge) breakdown.age = 0;
    else breakdown.age = -2;
  } else {
    breakdown.age = 0;
  }

  // 5. Diversity Score (소폭 보정)
  const recentBooks = readingLogs
    .slice(-10)
    .map(log => allBooks.find(b => b.id === log.fields['책']?.[0]))
    .filter(Boolean);

  const recentPublishers = recentBooks.map(b => b.fields['출판사']).filter(Boolean);
  const recentThemes = recentBooks
    .map(b => (b.fields['테마'] || '').split(',').map(t => t.trim().toLowerCase()))
    .flat()
    .filter(Boolean);

  const publisher = book.fields['출판사'] || '';
  const hasRecentPublisher = recentPublishers.includes(publisher);
  const hasRecentTheme = bookThemes.some(theme => recentThemes.includes(theme));

  if (!hasRecentPublisher && !hasRecentTheme) breakdown.diversity = 3;
  else if (!hasRecentPublisher || !hasRecentTheme) breakdown.diversity = 1;
  else breakdown.diversity = -1;

  // ✅ C: 관심 표시 보너스 (today는 DB 책이라 바로 필드로 판정)
  if (isInterestedValue(book.fields['관심'])) {
    breakdown.interest = INTEREST_BONUS;
  }

  const finalScore = 
    breakdown.themePreference +
    breakdown.engagement +
    breakdown.comfort +
    breakdown.age +
    breakdown.diversity +
    breakdown.interest;

  return {
    finalScore,
    breakdown,
    evidence: evidence.slice(0, 3),
    _themes: bookThemes // ✅ 옵션1 explore에서 재사용
  };
}

// ============================================
// (추가) 하이브리드용: 룰 근거(뼈대) 만들기 + AI는 표현만
// ============================================
function pickUniqueHooksFromText(text, limit = 2) {
  // 아주 가벼운 휴리스틱: 설명에서 의미있는 단어(조사/공통어 제거) 몇 개 뽑기
  if (!text) return [];
  const stop = new Set([
    '그리고', '하지만', '그래서', '또한', '아이', '어린이', '책', '이야기', '내용', '그림', '주인공', '함께',
    '하는', '합니다', '있습니다', '됩니다', '있어요', '있다', '이다', '것', '수', '더', '좀', '정말',
    '우리', '너', '저', '그', '이', '저희', '다양한', '통해', '대한', '관련', '모든', '때', '처럼'
  ]);

  const tokens = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !stop.has(t));

  // 빈도 기반 상위 뽑기(너무 흔한 단어는 stop에 추가해서 조정)
  const freq = new Map();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, limit);
}

function buildRuleReasons(book, scoreData, childProfile, explicitInterests) {
  const reasons = [];
  const matchedThemes = (book.fields['테마'] || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const bookThemesLower = (book.fields['테마'] || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
  const matchedExplicit = (explicitInterests || []).filter(t => bookThemesLower.includes(t));
  if (matchedExplicit.length) {
    reasons.push(`요즘 관심사로 선택한 '${matchedExplicit.slice(0, 2).join(', ')}'와 잘 맞아요`);
  }

  // 1) 테마 근거
  if (scoreData.breakdown.themePreference >= 30 && matchedThemes.length > 0) {
    reasons.push(`아이의 선호 테마(${matchedThemes.slice(0, 2).join(', ')})와 잘 맞아요`);
  } else if (matchedThemes.length > 0) {
    reasons.push(`이번엔 ${matchedThemes.slice(0, 2).join(', ')} 테마로 가볍게 확장해볼 수 있어요`);
  }

  // 2) 참여도 근거(증거가 있으면 우선)
  if (scoreData.evidence?.length) {
    // evidence 예: "oo 테마 완독 2회" → 그대로 쓰기보다 자연어로 살짝 바꿈
    const e = scoreData.evidence[0];
    reasons.push(`최근 기록에서 ${e.replace(/테마\s?/g, '').replace(/\s+/g, ' ')} 경향이 있어요`);
  } else if (scoreData.breakdown.engagement >= 12) {
    reasons.push('끝까지 읽거나 집중도가 높았던 유형과 가까워요');
  }

  // 3) 안정감/트리거 근거
  if (childProfile.emotionSensitivity === 'high') {
    if (scoreData.breakdown.comfort >= 15) reasons.push('감정적으로 편안하게 읽기 좋은 흐름을 우선했어요');
    else reasons.push('민감할 수 있는 요소는 조심해서 선택했어요');
  } else {
    if (scoreData.breakdown.comfort >= 15) reasons.push('부담 없이 편안하게 즐길 수 있는 편이에요');
  }

  // 4) 연령 근거(숫자 언급은 선택)
  const age = book.fields['연령'] || '';
  if (age) reasons.push(`연령 안내(${age})를 참고해도 무난해요`);

  // 너무 길면 3개만
  return reasons.filter(Boolean).slice(0, 3);
}

function buildHybridSystemPrompt() {
  // “표현만” 담당시키는 짧고 강한 시스템 프롬프트
  return `
너는 부모에게 아동 도서를 추천하는 문장 작성자다.
아래 [추천 근거]에 있는 내용만 사용해서 자연스러운 한국어 문장으로 풀어써라.
규칙:
- 근거를 바꾸거나 새 사실을 만들지 마라(추가 정보 추측 금지).
- 광고/과장 표현 금지: "큰 도움이 됩니다", "성장을 돕습니다", "배울 수 있습니다" 금지.
- 모든 책에 공통으로 들어갈 수 있는 뻔한 문장 피하기.
- 2~4문장, 120~220자 내외.
- 가능하면 [책 설명에서 잡은 포인트]를 1개 이상 자연스럽게 포함해(없으면 생략).
`;
}

function extractResponseText(data) {
  // 1. 요약 필드가 있으면 최우선
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  // 2. output 배열 순회
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!item.content) continue;

      for (const c of item.content) {
        if (c.type === 'output_text' && typeof c.text === 'string') {
          return c.text.trim();
        }
      }
    }
  }

  return '';
}

function shuffleArray(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================================
// AI 기반 추천 이유 생성 (하이브리드 버전)
// - 룰 기반 "근거"를 만들고, AI는 그 근거를 자연스럽게 풀어쓰기만 함
// ============================================
async function generateRecommendationReason(book, scoreData, childProfile, explicitInterests) {
  if (!OPENAI_API_KEY) {
    return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: 'rule_no_key' };
  }

  // 1) 룰 근거(뼈대) 만들기
  const ruleReasons = buildRuleReasons(book, scoreData, childProfile, explicitInterests);

  // 근거가 너무 빈약하면 그냥 룰 기반 반환
  if (!ruleReasons.length) {
    return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: 'rule_empty_reasons' };
  }

  // 2) 책 설명에서 “이 책만의 포인트”를 최소로 뽑아 AI에 제공(추측 금지)
  const hooks = pickUniqueHooksFromText(book.fields['설명'] || '', 2);

  // 3) User 프롬프트(재료) 구성
  const userPrompt = `
[책 정보]
- 제목: ${book.fields['제목']}
- 테마: ${book.fields['테마'] || '없음'}
- 연령: ${book.fields['연령'] || '정보 없음'}

[아이 정보]
- 나이: ${Math.floor(childProfile.ageMonths / 12)}세 ${childProfile.ageMonths % 12}개월
- 감정 예민도: ${childProfile.emotionSensitivity}

[추천 근거]
- ${ruleReasons.join('\n- ')}

[책 설명에서 잡은 포인트]
- ${hooks.length ? hooks.join(', ') : '없음'}

위 내용을 바탕으로 추천 이유를 작성해줘.
`;

  try {
    const payload = {
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: buildHybridSystemPrompt() },
        { role: 'user', content: userPrompt },
      ],
      reasoning: { effort: 'low' },
      max_output_tokens: 800,
      text: {
        format: { type: 'text' },
        verbosity: 'low',
      },
    };

    debugLog('[WHY] text.format typeof =', typeof payload.text.format, payload.text.format);

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    const outputTypes = Array.isArray(data.output)
      ? data.output.map((item) => item.type || 'unknown')
      : [];
    const contentTypes = Array.isArray(data.output)
      ? data.output.flatMap((item) =>
          Array.isArray(item.content) ? item.content.map((c) => c.type) : []
        )
      : [];
    debugLog('[WHY] response status:', data.status, 'incomplete_reason:', data?.incomplete_details?.reason);
    debugLog('[WHY] output types:', outputTypes, 'content types:', contentTypes);
    if (!response.ok) {
      debugLog('[WHY] responses non-200:', response.status, JSON.stringify(data));
      return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: `rule_openai_${response.status}` };
    }

    const text = extractResponseText(data);

    if (!text) {
      debugLog('[WHY] empty ai output', JSON.stringify(data));
      return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: 'rule_empty_ai' };
    }

    // 4) 안전장치: 너무 짧거나 금지 표현 포함 시 fallback
    const banned = ['도움이 됩니다', '성장을 돕습니다', '배울 수 있습니다'];
    const tooShort = text.length < 40;
    const hasBanned = banned.some((p) => text.includes(p));

    if (tooShort || hasBanned) {
      return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: 'rule_guard' };
    }

    return { text, source: 'ai' };
  } catch (error) {
    debugLog('[WHY] openai exception:', error?.message || error);
    return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: 'rule_exception' };
  }

  return { text: generateRuleBasedReason(book, scoreData, childProfile, explicitInterests), source: 'rule_fallback' };
}

// 룰 기반 추천 이유 (AI 실패 시 fallback)
function generateRuleBasedReason(book, scoreData, childProfile, explicitInterests) {
  const reasons = [];
  const bookThemesLower = (book.fields['테마'] || '')
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
  const matchedExplicit = (explicitInterests || []).filter(t => bookThemesLower.includes(t));
  if (matchedExplicit.length) {
    reasons.push(`요즘 관심사로 선택한 '${matchedExplicit.slice(0, 2).join(', ')}'와 잘 맞아요`);
  }

  if (scoreData.breakdown.themePreference > 30) {
    reasons.push('좋아하는 테마와 일치합니다');
  }

  if (scoreData.breakdown.engagement > 10) {
    reasons.push('끝까지 읽거나 집중했던 유형입니다');
  }

  if (scoreData.breakdown.comfort > 15) {
    reasons.push('안정적이고 편안한 내용입니다');
  }

  if (scoreData.evidence.length > 0) {
    reasons.push(scoreData.evidence[0]);
  }

  if (reasons.length === 0) {
    return '아이의 발달 단계에 맞는 책입니다';
  }

  return reasons.join(', ') + '입니다.';
}

// ============================================
// 메인 함수
// ============================================
module.exports = async (req, res) => {
  console.log('[API HIT] today-recommendations', req.url);
  // === DEBUG: explicit interests from query ===
  const explicitInterests = (req.query.interests || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  debugLog('[INT] explicitInterests =', explicitInterests);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  const forceRefresh = req.query.force === '1' || req.query.force === 'true';
  res.setHeader(
    'Cache-Control',
    forceRefresh ? 'no-store' : 'public, s-maxage=3600, stale-while-revalidate=86400'
  );
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const supabase = getSupabaseClient();

    // 1. 아이 프로필 (쿼리 파라미터)
    const baseProfile = {
      ageMonths: req.query.ageMonths ? parseInt(req.query.ageMonths) : null,
      emotionSensitivity: req.query.emotionSensitivity || 'normal',
      booksPerDay: req.query.booksPerDay ? parseFloat(req.query.booksPerDay) : null,
    };

    // 2. Supabase에서 데이터 가져오기
    // Books 테이블 (모든 데이터 가져오기 - 페이지네이션)
    let allBooksData = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data: pageData, error: booksError } = await supabase
        .from('books')
        .select('*')
        .range(from, from + pageSize - 1);

      if (booksError) {
        throw new Error(`Supabase Books error: ${booksError.message}`);
      }

      if (pageData && pageData.length > 0) {
        allBooksData = allBooksData.concat(pageData);
        from += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const booksData = allBooksData;

    // Airtable 형식으로 변환 (하위 호환성)
    const allBooks = (booksData || []).map(book => ({
      id: book.id,
      fields: {
        'ISBN': book.isbn,
        '제목': book.title,
        '저자': book.author,
        '출판사': book.publisher,
        '발행년': book.pub_year,
        '표지이미지': book.cover_image,
        '설명': book.description,
        '테마': book.themes,
        '연령': book.age_range,
        '부모_읽기_가이드': book.parent_guide,
        '연계놀이': book.activities,
        '관심': book.interested
      }
    }));

    // ✅ B: 내 DB 기준 테마 통계
    const themeStats = buildThemeStats(allBooks);

    // ReadingLog 테이블 (모든 데이터 가져오기 - 페이지네이션)
    let allLogsData = [];
    from = 0;
    hasMore = true;

    while (hasMore) {
      const { data: pageData, error: logsError } = await supabase
        .from('reading_logs')
        .select('*')
        .range(from, from + pageSize - 1);

      if (logsError) {
        throw new Error(`Supabase ReadingLog error: ${logsError.message}`);
      }

      if (pageData && pageData.length > 0) {
        allLogsData = allLogsData.concat(pageData);
        from += pageSize;
        hasMore = pageData.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    const logsData = allLogsData;

    // Airtable 형식으로 변환 (하위 호환성)
    const readingLogs = (logsData || []).map(log => ({
      id: log.id,
      fields: {
        '책': log.book_id ? [log.book_id] : [],
        '완독여부': log.completed,
        '아이반응': log.child_reaction,
        '메모': log.memo,
        '질문정도': log.question_level,
        '집중정도': log.focus_level,
        'memoSummary': log.memo_summary ? JSON.stringify(log.memo_summary) : null,
        '날짜': log.read_date
      }
    }));

    // 3. 아이 프로필 분석
    const analyzedProfile = analyzeChildProfile(readingLogs, allBooks);
    const resolvedBooksPerDay = resolveBooksPerDay(baseProfile.booksPerDay, readingLogs);
    const childProfile = {
      ...analyzedProfile,
      ageMonths: baseProfile.ageMonths || analyzedProfile.ageMonths || 31,
      emotionSensitivity: baseProfile.emotionSensitivity || analyzedProfile.emotionSensitivity,
      booksPerDay: resolvedBooksPerDay,
    };

    const explicitInterestsNormalized = parseExplicitInterests(req.query.interests);

    // 4. 읽지 않은 책 필터링
    const unreadBooks = allBooks.filter(book => 
      !readingLogs.find(log => log.fields['책']?.[0] === book.id)
    );

    if (unreadBooks.length === 0) {
      return res.status(200).json({
        success: true,
        total: 0,
        books: []
      });
    }

    // 5. 룰 기반 점수 계산
    const scoredBooks = unreadBooks.map(book => {
      const scoreData = calculateRecommendationScore(
        book,
        childProfile,
        allBooks,
        readingLogs,
        themeStats,
        explicitInterestsNormalized
      );
      return {
        book,
        ...scoreData
      };
    });

    // 6. 점수 순 정렬
    scoredBooks.sort((a, b) => b.finalScore - a.finalScore);

    // 7. 다양성 보정 (옵션 1: safe/explore 모두 "pool에서 랜덤 샘플" + refill)
    const topCount = Math.min(getTopCountByBooksPerDay(childProfile.booksPerDay), scoredBooks.length);
    const safeRatio = getSafeRatioByBooksPerDay(childProfile.booksPerDay);
    const safeCount = Math.max(1, Math.floor(topCount * safeRatio));
    const exploreCount = Math.max(0, topCount - safeCount);

    // ✅ SAFE: 상위 SAFE_POOL_SIZE에서 랜덤 샘플링
    const SAFE_POOL_SIZE = 30;
    const safePool = scoredBooks.slice(0, SAFE_POOL_SIZE);
    const safeBooks = shuffleArray(safePool).slice(0, safeCount);

    debugLog('[TODAY] safe sample:', {
      safePoolSize: safePool.length,
      safeCount,
      picked: safeBooks.length
    });

    // exploreCandidates는 safeCount 기준으로 뒤에서(원래 점수순) 가져오되,
    // explore의 "새테마"는 safeBooks의 테마와 비교
    const exploreCandidates = scoredBooks.slice(safeCount);

    const safeThemes = new Set();
    safeBooks.forEach(item => {
    const themes = item._themes || parseThemes(item.book.fields['테마']);
      themes.forEach(t => safeThemes.add(t));
    });

    debugLog('[TODAY] safeThemes size=', safeThemes.size, 'sample=', [...safeThemes].slice(0, 10));

    // rankedExplore: newThemeCount 계산 후
    // ✅ 필터 제거(0도 포함) + ✅ 항상 newThemeCount 우선 정렬
    const rankedExplore = exploreCandidates
      .map(item => {
    const themes = item._themes || parseThemes(item.book.fields['테마']);

        const newThemeCount = themes.filter(t => t && !safeThemes.has(t)).length;
        return { ...item, _newThemeCount: newThemeCount };
      })
      .sort((a, b) => {
        if (b._newThemeCount !== a._newThemeCount) return b._newThemeCount - a._newThemeCount;
        return b.finalScore - a.finalScore;
      });

    debugLog(
      '[TODAY] rankedExplore size:',
      rankedExplore.length,
      'newThemeCount top10:',
      rankedExplore.slice(0, 10).map(x => x._newThemeCount).join(',')
    );

    // ✅ EXPLORE: 상위 EXPLORE_POOL_SIZE에서 랜덤 샘플링
    const EXPLORE_POOL_SIZE = 30;
    const explorePool = rankedExplore.slice(0, EXPLORE_POOL_SIZE);

    let exploreBooks = shuffleArray(explorePool).slice(0, exploreCount);

    debugLog('[TODAY] explore sample:', {
      rankedExplore: rankedExplore.length,
      explorePoolSize: explorePool.length,
      exploreCount,
      picked: exploreBooks.length
    });

    // safeBooks와 중복 제거 (id 기준)
    const safeIds = new Set(safeBooks.map(x => x.book.id).filter(Boolean));
    exploreBooks = exploreBooks.filter(x => x.book?.id && !safeIds.has(x.book.id));

    // 부족하면 explorePool에서 refill
    if (exploreBooks.length < exploreCount) {
      const need = exploreCount - exploreBooks.length;
      const refill = shuffleArray(explorePool)
        .filter(x => x.book?.id && !safeIds.has(x.book.id))
        .slice(0, need);

      exploreBooks = exploreBooks.concat(refill);
    }

    let finalList = [...safeBooks, ...exploreBooks].slice(0, topCount);
    if (forceRefresh) finalList = shuffleArray(finalList);

    debugLog('[TODAY] split:', {
      safe: safeBooks.length,
      explore: exploreBooks.length,
      safeTop: safeBooks.slice(0, 3).map(x => x.book.fields['제목']),
      exploreTop: exploreBooks.slice(0, 3).map(x => x.book.fields['제목']),
    });
    debugLog('[TODAY] scoredBooks:', scoredBooks.length, 'topCount:', topCount, 'forceRefresh:', forceRefresh);
    debugLog('[TODAY] finalList titles:',
      finalList.map(x => `${x.book.fields['제목']} (${Math.round(x.finalScore * 10) / 10})`).join(' | ')
    );

    // 8. AI 기반 추천 이유 생성
    const booksWithReason = await Promise.all(
      finalList.map(async (item) => {
        let why;
        
        if (childProfile.hasData) {
          why = await generateRecommendationReason(item.book, item, childProfile, explicitInterestsNormalized);
        } else {
          why = { text: generateRuleBasedReason(item.book, item, childProfile, explicitInterestsNormalized), source: 'rule_no_data' };
        }

        return {
          id: item.book.id,
          title: item.book.fields['제목'],
          author: item.book.fields['저자'],
          publisher: item.book.fields['출판사'],
          pubYear: item.book.fields['발행년'],
          cover: item.book.fields['표지이미지'],
          theme: item.book.fields['테마'],
          age: item.book.fields['연령'],
          guide: item.book.fields['부모_읽기_가이드'],
          score_breakdown: {
            themePreference: Math.round(item.breakdown.themePreference * 10) / 10,
            engagement: Math.round(item.breakdown.engagement * 10) / 10,
            comfort: Math.round(item.breakdown.comfort * 10) / 10,
            age: Math.round(item.breakdown.age * 10) / 10,
            diversity: Math.round(item.breakdown.diversity * 10) / 10,
            interest: Math.round((item.breakdown.interest || 0) * 10) / 10, // ✅ C
            total: Math.round(item.finalScore * 10) / 10
          },
          why: why.text,
          recommendationReason: why.text, // 프론트엔드 호환성
          recommendationSource: why.source,
          evidence: item.evidence
        };
      })
    );

    res.status(200).json({
      success: true,
      total: booksWithReason.length,
      childProfile: {
        hasData: childProfile.hasData,
        ageMonths: childProfile.ageMonths,
        emotionSensitivity: childProfile.emotionSensitivity,
        booksPerDay: childProfile.booksPerDay,
      },
      meta: {
        explicitInterests: explicitInterestsNormalized
      },
      books: booksWithReason
    });

  } catch (error) {
    console.error('오늘의 추천 API 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
