// Vercel Serverless Function
// 관심사 후보 추출

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function getRecentLogs(readingLogs, days = 60, limit = 30) {
  const logsWithDates = readingLogs.map(log => {
    const date = log.fields['날짜'] || log.fields['읽은날짜'] || log.fields['읽은 날짜'];
    const logDate = date ? new Date(date) : null;
    const daysAgo = logDate ? Math.floor((Date.now() - logDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
    return { log, daysAgo };
  });

  return logsWithDates
    .filter(({ daysAgo }) => daysAgo === null || daysAgo <= days)
    .sort((a, b) => {
      if (a.daysAgo === null && b.daysAgo === null) return 0;
      if (a.daysAgo === null) return 1;
      if (b.daysAgo === null) return -1;
      return a.daysAgo - b.daysAgo;
    })
    .slice(-limit)
    .map(({ log }) => log);
}

// ============================================
// 아이 프로필 분석 (today-recommendations.js와 동일)
// ============================================
function analyzeChildProfile(readingLogs, allBooks) {
  if (!readingLogs || readingLogs.length === 0) {
    return {
      hasData: false,
      ageMonths: 31,
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

  const recentLogs = getRecentLogs(readingLogs, 60, 30);

  const readBooks = recentLogs
    .map(log => allBooks.find(b => b.id === log.fields['책']?.[0]))
    .filter(Boolean)
    .filter(b => b.fields['연령']);

  let ageMonths = 31;
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

  const reactions = recentLogs
    .map(log => log.fields['아이반응'])
    .filter(r => r);

  const emotionSensitivity = reactions.includes('😰') || reactions.includes('😢')
    ? 'high'
    : reactions.includes('😍') || reactions.includes('😊')
    ? 'low'
    : 'normal';

  const themePreferences = {};
  const engagementPatterns = {
    completedThemes: {},
    highFocusThemes: {},
    highQuestionThemes: {}
  };

  recentLogs.forEach(log => {
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

    const ratingMap = { '😍': 5, '😊': 4, '😐': 3, '😢': 2, '🥱': 1 };
    const rating = ratingMap[reaction] || 3;
    const normalizedRating = (rating - 1) / 4;

    const immersionWeight = focusLevel === '높음' ? 1.0 : focusLevel === '보통' ? 0.6 : 0.3;

    themes.forEach(theme => {
      if (!themePreferences[theme]) {
        themePreferences[theme] = { scores: [], count: 0 };
      }

      const themeScore = (normalizedRating * 0.6 + immersionWeight * 0.4);
      themePreferences[theme].scores.push(themeScore);
      themePreferences[theme].count += 1;

      if (completed) {
        engagementPatterns.completedThemes[theme] = (engagementPatterns.completedThemes[theme] || 0) + 1;
      }
      if (focusLevel === '높음') {
        engagementPatterns.highFocusThemes[theme] = (engagementPatterns.highFocusThemes[theme] || 0) + 1;
      }
      if (questionLevel === '많음') {
        engagementPatterns.highQuestionThemes[theme] = (engagementPatterns.highQuestionThemes[theme] || 0) + 1;
      }
    });
  });

  Object.keys(themePreferences).forEach(theme => {
    const data = themePreferences[theme];
    themePreferences[theme] = data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length;
  });

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
        // ignore
      }
    }
  });

  return {
    hasData: true,
    ageMonths,
    emotionSensitivity,
    themePreferences,
    engagementPatterns,
    comfortTriggers: [...new Set(comfortTriggers)]
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = getSupabaseClient();

    // books
    let allBooksData = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase.from('books').select('*').range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      allBooksData = allBooksData.concat(data || []);
      hasMore = (data || []).length === pageSize;
      from += pageSize;
    }

    const allBooks = allBooksData.map(book => ({
      id: book.id,
      fields: {
        '테마': book.themes,
        '연령': book.age_range,
        '설명': book.description,
        '제목': book.title
      }
    }));

    // reading_logs
    let allLogsData = [];
    from = 0;
    hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase.from('reading_logs').select('*').range(from, from + pageSize - 1);
      if (error) throw new Error(error.message);
      allLogsData = allLogsData.concat(data || []);
      hasMore = (data || []).length === pageSize;
      from += pageSize;
    }

    const readingLogs = allLogsData.map(log => ({
      id: log.id,
      fields: {
        '책': log.book_id ? [log.book_id] : [],
        '완독여부': log.completed,
        '아이반응': log.child_reaction,
        '질문정도': log.question_level,
        '집중정도': log.focus_level,
        'memoSummary': log.memo_summary ? JSON.stringify(log.memo_summary) : null,
        '날짜': log.read_date
      }
    }));

    const childProfile = analyzeChildProfile(readingLogs, allBooks);

    const candidates = [];
    const add = (label, source) => {
      const key = label.trim().toLowerCase();
      if (!key) return;
      if (candidates.find(c => c.value === key)) return;
      candidates.push({ label: label.trim(), value: key, source });
    };

    // 1) themePreferences 상위 8
    const themeTop = Object.entries(childProfile.themePreferences || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);
    themeTop.forEach(t => add(t, 'themePref'));

    // 2) engagementPatterns 상위 4
    const scoreEng = {};
    const ep = childProfile.engagementPatterns || {};
    const allKeys = new Set([
      ...Object.keys(ep.completedThemes || {}),
      ...Object.keys(ep.highFocusThemes || {}),
      ...Object.keys(ep.highQuestionThemes || {})
    ]);
    for (const k of allKeys) {
      scoreEng[k] = (ep.completedThemes?.[k] || 0) * 3
        + (ep.highFocusThemes?.[k] || 0) * 2
        + (ep.highQuestionThemes?.[k] || 0);
    }
    Object.entries(scoreEng)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([k]) => add(k, 'engagement'));

    // 3) 최근 읽은 책 테마 상위 4
    const recentLogs = getRecentLogs(readingLogs, 60, 30);
    const recentThemeCount = {};
    recentLogs.forEach(log => {
      const book = allBooks.find(b => b.id === log.fields['책']?.[0]);
      const themes = (book?.fields?.['테마'] || '')
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      themes.forEach(t => {
        recentThemeCount[t] = (recentThemeCount[t] || 0) + 1;
      });
    });
    Object.entries(recentThemeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .forEach(([k]) => add(k, 'recent'));

    const final = candidates.slice(0, 12);

    res.status(200).json({
      success: true,
      hasData: childProfile.hasData,
      autoTop: themeTop.slice(0, 5),
      candidates: final
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
