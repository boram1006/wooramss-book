// 확인된 여러 책을 Books와 ReadingLog에 재실행 안전하게 일괄 등록

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration error');
  }
  return createClient(supabaseUrl, supabaseKey);
}

function normalizeIsbn(value) {
  return String(value || '').replace(/[^0-9X]/gi, '').toUpperCase();
}

function normalizeBook(book) {
  const isbn = normalizeIsbn(book?.isbn);
  const title = String(book?.title || '').trim();
  if (!isbn || !title) return null;

  const pubYear = parseInt(String(book.pubDate || '').slice(0, 4), 10);
  return {
    isbn,
    title,
    author: String(book.author || '').trim(),
    publisher: String(book.publisher || '').trim(),
    pub_year: Number.isFinite(pubYear) ? pubYear : null,
    cover_image: String(book.cover || '').trim(),
    description: String(book.description || '').trim()
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const inputBooks = Array.isArray(req.body?.books) ? req.body.books.slice(0, 12) : [];
    const normalizedBooks = inputBooks.map(normalizeBook).filter(Boolean);
    const books = Array.from(new Map(normalizedBooks.map(book => [book.isbn, book])).values());
    if (!books.length) {
      return res.status(400).json({ error: '등록할 책 정보가 없습니다.' });
    }

    const logDefaults = req.body?.logDefaults || {};
    const readDate = String(logDefaults.readDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(readDate)) {
      return res.status(400).json({ error: '읽은 날짜를 확인해주세요.' });
    }

    const allowedReactions = new Set(['', '😍', '😊', '😐', '😢', '🥱']);
    const childReaction = allowedReactions.has(logDefaults.childReaction) ? logDefaults.childReaction : '';
    const supabase = getSupabaseClient();
    const isbns = books.map(book => book.isbn);

    // 1) 이미 있는 책을 한 번에 조회
    const { data: existingBooks, error: existingBooksError } = await supabase
      .from('books')
      .select('id,isbn,title')
      .in('isbn', isbns);
    if (existingBooksError) throw new Error(`기존 책 조회 실패: ${existingBooksError.message}`);

    const existingByIsbn = new Map((existingBooks || []).map(book => [normalizeIsbn(book.isbn), book]));
    const missingBooks = books.filter(book => !existingByIsbn.has(book.isbn));

    // 2) 없는 책만 한 번에 생성. 실패 후 재시도해도 선조회에서 걸러진다.
    let insertedBooks = [];
    if (missingBooks.length) {
      const { data, error } = await supabase
        .from('books')
        .insert(missingBooks)
        .select('id,isbn,title');
      if (error) throw new Error(`새 책 저장 실패: ${error.message}`);
      insertedBooks = data || [];
    }

    const allBooks = [...(existingBooks || []), ...insertedBooks];
    const savedByIsbn = new Map(allBooks.map(book => [normalizeIsbn(book.isbn), book]));
    const unresolved = books.filter(book => !savedByIsbn.has(book.isbn));
    if (unresolved.length) {
      throw new Error(`책 ${unresolved.length}권의 저장 결과를 확인하지 못했습니다.`);
    }

    // 3) 기존 읽기 기록은 보존하고, 없는 기록만 한 번에 생성
    const bookIds = books.map(book => savedByIsbn.get(book.isbn).id);
    const { data: existingLogs, error: existingLogsError } = await supabase
      .from('reading_logs')
      .select('id,book_id')
      .in('book_id', bookIds);
    if (existingLogsError) throw new Error(`기존 읽기 기록 조회 실패: ${existingLogsError.message}`);

    const loggedBookIds = new Set((existingLogs || []).map(log => String(log.book_id)));
    const newLogs = bookIds
      .filter(bookId => !loggedBookIds.has(String(bookId)))
      .map(bookId => ({
        book_id: bookId,
        completed: logDefaults.completed === true,
        child_reaction: childReaction,
        memo: '',
        question_level: '',
        focus_level: '',
        read_date: readDate
      }));

    let insertedLogs = [];
    if (newLogs.length) {
      const { data, error } = await supabase
        .from('reading_logs')
        .insert(newLogs)
        .select('id,book_id');
      if (error) throw new Error(`읽기 기록 저장 실패: ${error.message}`);
      insertedLogs = data || [];
    }

    return res.status(200).json({
      success: true,
      bookCount: books.length,
      createdBookCount: insertedBooks.length,
      existingBookCount: (existingBooks || []).length,
      createdLogCount: insertedLogs.length,
      existingLogCount: (existingLogs || []).length
    });
  } catch (error) {
    console.error('읽은 책 일괄 등록 오류:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
