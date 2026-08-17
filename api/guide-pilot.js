const { createClient } = require('@supabase/supabase-js');
const { assessGuideQuality, generateBookGuides } = require('../lib/book-guide');

const PILOT_BOOK_IDS = [
  '955099ce-3b1b-494e-9188-c306d413499a', // 반복 말놀이
  '30e74b6c-989b-4f1f-9425-67eecefd1c1d', // 의성어·의태어
  '69f85b68-0be8-4a4c-bd40-732eccac1dd7', // 정보·신체
  '310aaa13-8fe3-460d-9b5a-fc70899c01fb', // 감정 낱말
  'a93d2067-7d61-43ae-97f6-60411ebed4b0', // 시각적 리듬
  '99a37753-bf14-4883-a8bd-1bd409def866', // 사건·예측
  '7f2ef1d8-507f-4d1b-996e-f301b7d7b33d', // 여러 짧은 사건
  'f778f323-675f-437c-8ea2-32ecefe6bdbc', // 이웃·준비 과정
  '0ca90d28-108f-446c-846a-81099dbac119', // 실패·도전·여정
  'a9ca4000-3164-443b-aaf1-de9b02dd1421'  // 만들기 과정
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers['x-guide-pilot'] !== 'strategy-eval-v2') return res.status(404).json({ error: 'Not found' });
  if (!process.env.OPENAI_API_KEY || !process.env.SUPABASE_URL) return res.status(500).json({ error: 'Missing server configuration' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  );
  const { data: books, error } = await supabase
    .from('books')
    .select('id,title,author,publisher,description,isbn')
    .in('id', PILOT_BOOK_IDS);
  if (error) return res.status(500).json({ error: error.message });

  const byId = new Map((books || []).map(book => [book.id, book]));
  const orderedBooks = PILOT_BOOK_IDS.map(id => byId.get(id)).filter(Boolean);
  try {
    const guides = await generateBookGuides(orderedBooks.map(book => ({
      key: book.id,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
      description: book.description
    })), { apiKey: process.env.OPENAI_API_KEY, childAgeMonths: 39 });
    const guideById = new Map(guides.map(guide => [guide.key, guide]));
    return res.status(200).json({
      saved: false,
      samples: orderedBooks.map(book => {
        const guide = guideById.get(book.id);
        return {
          title: book.title,
          description: book.description,
          guide,
          issues: assessGuideQuality(guide)
        };
      })
    });
  } catch (generationError) {
    return res.status(500).json({ error: generationError.message });
  }
};
