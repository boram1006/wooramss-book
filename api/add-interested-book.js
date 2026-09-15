// Vercel Serverless Function
// 관심 있는 책 추가 (검색 → AI 가이드 생성 → Supabase 저장)

const { createClient } = require('@supabase/supabase-js');
const { generateBookGuide } = require('../lib/book-guide');
const { inferThemes } = require('../lib/theme-taxonomy');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DEBUG_RECO = process.env.DEBUG_RECO === '1';

function debugLog(...args) {
  if (DEBUG_RECO) console.log(...args);
}
const ALADIN_API_KEY = process.env.ALADIN_API_KEY || 'ttbcasey862231001';

// Supabase 클라이언트 초기화
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error: SUPABASE_URL and SUPABASE_KEY required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

// Books 테이블에서 ISBN으로 검색
async function findBookByISBN(isbn) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('isbn', isbn)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw new Error(`Supabase error: ${error.message}`);
  }

  if (!data) return null;

  // Airtable 형식으로 변환 (하위 호환성)
  return {
    id: data.id,
    fields: {
      'ISBN': data.isbn,
      '제목': data.title,
      '저자': data.author,
      '출판사': data.publisher,
      '발행년': data.pub_year,
      '표지이미지': data.cover_image,
      '설명': data.description,
      '테마': data.themes,
      '연령': data.age_range,
      '부모_읽기_가이드': data.parent_guide,
      '연계놀이': data.activities,
      '관심': data.interested,
      '대상': data.audience || 'wooram',
      '후보상태': data.candidate_status || (data.interested ? 'interested' : ''),
      '후보메모': data.candidate_note || '',
      '다시볼날짜': data.candidate_review_at || ''
    }
  };
}

// 알라딘 API로 책 정보 가져오기
async function getBookFromAladin(isbn) {
  const url = `http://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${ALADIN_API_KEY}&itemIdType=ISBN13&ItemId=${isbn}&output=js&Version=20131101&OptResult=ebookList,usedList,reviewList`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (!data.item || data.item.length === 0) {
    throw new Error('책을 찾을 수 없습니다');
  }
  
  return data.item[0];
}

// Books 테이블에 책 추가
async function addBookToSupabase(bookInfo, aiGuide, candidate = {}) {
  const supabase = getSupabaseClient();
  
  const bookData = {
    isbn: bookInfo.isbn13 || bookInfo.isbn,
    title: bookInfo.title,
    author: bookInfo.author,
    publisher: bookInfo.publisher,
    pub_year: bookInfo.pubDate ? parseInt(bookInfo.pubDate.substring(0, 4)) : null,
    cover_image: bookInfo.cover || '',
    description: bookInfo.description || '',
    themes: inferThemes(bookInfo).join(','),
    age_range: aiGuide.ageRange || '',
    parent_guide: aiGuide.parentGuide || '',
    activities: aiGuide.activities || '',
    interested: candidate.status === 'interested' || candidate.status === 'purchase',
    audience: candidate.audience || 'wooram',
    candidate_status: candidate.status || null,
    candidate_note: candidate.note || null,
    candidate_review_at: candidate.reviewAt || null,
    candidate_updated_at: candidate.status ? new Date().toISOString() : null
  };

  const { data, error } = await supabase
    .from('books')
    .insert(bookData)
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase insert error: ${error.message}`);
  }

  // Airtable 형식으로 변환 (하위 호환성)
  return {
    id: data.id,
    fields: {
      'ISBN': data.isbn,
      '제목': data.title,
      '저자': data.author,
      '출판사': data.publisher,
      '발행년': data.pub_year,
      '표지이미지': data.cover_image,
      '설명': data.description,
      '테마': data.themes,
      '연령': data.age_range,
      '부모_읽기_가이드': data.parent_guide,
      '연계놀이': data.activities,
      '관심': data.interested,
      '대상': data.audience || 'wooram',
      '후보상태': data.candidate_status || '',
      '후보메모': data.candidate_note || '',
      '다시볼날짜': data.candidate_review_at || ''
    }
  };
}

async function updateBookCandidate(bookId, candidate) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('books')
    .update({
      interested: candidate.status === 'interested' || candidate.status === 'purchase',
      audience: candidate.audience || 'wooram',
      candidate_status: candidate.status || null,
      candidate_note: candidate.note || null,
      candidate_review_at: candidate.reviewAt || null,
      candidate_updated_at: new Date().toISOString()
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) {
    throw new Error(`Supabase interest update error: ${error.message}`);
  }

  return data;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const {
      isbn,
      childAgeMonths,
      markInterested = false,
      candidateStatus,
      audience = 'wooram',
      note = '',
      reviewAt = null
    } = req.body;
    
    if (!isbn) {
      return res.status(400).json({ error: 'ISBN이 필요합니다' });
    }
    
    const allowedStatuses = new Set(['review', 'interested', 'purchase', 'owned', 'dismissed']);
    const resolvedStatus = candidateStatus || (markInterested ? 'interested' : null);
    if (resolvedStatus && !allowedStatuses.has(resolvedStatus)) {
      return res.status(400).json({ error: '올바르지 않은 후보 상태입니다' });
    }
    if (!['wooram', 'boram'].includes(audience)) {
      return res.status(400).json({ error: '대상은 우람이 또는 보람이여야 합니다' });
    }

    // 1. Books 테이블에서 검색
    let existingBook = await findBookByISBN(isbn);
    let bookId;
    
    if (existingBook) {
      // 이미 있는 책
      bookId = existingBook.id;
      if (resolvedStatus) {
        await updateBookCandidate(bookId, { status: resolvedStatus, audience, note, reviewAt });
      }
    } else {
      // 없는 책 - 새로 추가
      console.log('📚 알라딘에서 책 정보 가져오는 중...');
      const bookInfo = await getBookFromAladin(isbn);
      
      let aiGuide = { ageRange: '', parentGuide: '', activities: '' };
      const shouldGenerateGuide = audience === 'wooram' && (resolvedStatus === 'interested' || resolvedStatus === null);
      if (shouldGenerateGuide) {
        console.log('🤖 AI 가이드 생성 중...');
        try {
          aiGuide = await generateBookGuide(bookInfo, { apiKey: OPENAI_API_KEY, childAgeMonths });
        } catch (error) {
          // 가이드 생성 실패가 책 등록 자체를 막지 않도록 기본 정보는 저장한다.
          debugLog('[WHY] add-interested-book guide fallback:', error?.message || error);
        }
      }
      
      console.log('💾 Supabase에 저장 중...');
      const newBook = await addBookToSupabase(bookInfo, aiGuide, {
        status: resolvedStatus,
        audience,
        note,
        reviewAt
      });
      bookId = newBook.id;
    }

    res.status(200).json({
      success: true,
      message: resolvedStatus ? '책 후보함에 추가되었습니다' : '책이 추가되었습니다',
      bookId: bookId,
      isNew: !existingBook,
      interested: resolvedStatus
        ? resolvedStatus === 'interested' || resolvedStatus === 'purchase'
        : existingBook?.fields?.['관심'] === true,
      candidateStatus: resolvedStatus,
      audience
    });
    
  } catch (error) {
    console.error('관심 책 추가 오류:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
