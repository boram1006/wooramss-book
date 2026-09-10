const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.png': 'image/png' };
const books = [];
const logs = [];
const fixture = {
  id: 'book-e2e-1',
  fields: {
    ISBN: '9780000000001', 제목: '테스트 그림책', 저자: '도란 작가', 출판사: '도란 출판사',
    설명: '친구와 마음을 나누는 테스트용 그림책', 테마: '친구,감정 이해', 연령: '3-5세',
    부모_읽기_가이드: '', 연계놀이: '', 관심: true
  }
};

function json(res, body) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function handleApi(req, res, url) {
  if (url.pathname === '/api/supabase' && url.searchParams.get('table') === 'ChildSettings') {
    json(res, { exists: true, profile: { birthDate: '', ageMonths: '', gender: '', booksPerDay: 2, emotionSensitivity: 'normal' }, selectedInterests: [] });
  } else if (url.pathname === '/api/supabase') {
    json(res, url.searchParams.get('table') === 'Books' ? books : logs);
  } else if (url.pathname === '/api/aladin-search') {
    json(res, { success: true, books: [{ isbn: fixture.fields.ISBN, title: fixture.fields.제목, author: fixture.fields.저자, publisher: fixture.fields.출판사, cover: '' }] });
  } else if (url.pathname === '/api/add-interested-book') {
    if (!books.length) books.push(fixture);
    json(res, { success: true, record: fixture });
  } else if (url.pathname === '/api/update-book-guide') {
    fixture.fields.부모_읽기_가이드 = '함께 볼 점: 친구의 표정을 살펴보세요.';
    fixture.fields.연계놀이 = '준비물: 종이. 방법: ① 친구 얼굴을 그려요 ② 마음을 이야기해요.';
    json(res, { success: true });
  } else if (url.pathname === '/api/reading-log') {
    if (!logs.length) logs.push({ id: 'log-e2e-1', fields: { 책: [fixture.id], 완독여부: true, 아이반응: '😍', 메모: '끝까지 집중했어요.' } });
    json(res, { success: true });
  } else if (url.pathname === '/api/aladin-new-books') {
    json(res, { books: [] });
  } else if (url.pathname === '/api/today-recommendations') {
    json(res, { recommendations: [] });
  } else {
    json(res, { success: true, candidates: [], autoTop: [], groups: [], items: [], total: 0 });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url);
    return;
  }
  const pathname = url.pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relative);
  if (!filename.startsWith(root + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filename, (error, data) => {
    if (error) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(4175, '127.0.0.1', () => console.log('E2E server: http://127.0.0.1:4175'));
