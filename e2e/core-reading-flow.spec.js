const { test, expect } = require('@playwright/test');

test('책 추가 → 부모 가이드 생성 → 읽기 기록 저장', async ({ page }) => {
  const books = [];
  const logs = [];
  const calls = { add: 0, guide: 0, reading: 0 };
  const newBook = {
    id: 'book-e2e-1',
    fields: {
      ISBN: '9780000000001',
      제목: '테스트 그림책',
      저자: '도란 작가',
      출판사: '도란 출판사',
      설명: '친구와 마음을 나누는 테스트용 그림책',
      테마: '친구,감정 이해',
      연령: '3-5세',
      부모_읽기_가이드: '',
      연계놀이: '',
      관심: true
    }
  };

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

    if (url.pathname === '/api/supabase' && url.searchParams.get('table') === 'ChildSettings') {
      return json({ profile: { birthDate: '', ageMonths: '', gender: '', booksPerDay: 2, emotionSensitivity: 'normal' }, selectedInterests: [] });
    }
    if (url.pathname === '/api/supabase') {
      return json(url.searchParams.get('table') === 'Books' ? books : logs);
    }
    if (url.pathname === '/api/aladin-search') {
      return json({ success: true, books: [{ isbn: newBook.fields.ISBN, title: newBook.fields.제목, author: newBook.fields.저자, publisher: newBook.fields.출판사, cover: '' }] });
    }
    if (url.pathname === '/api/add-interested-book') {
      calls.add += 1;
      books.push(newBook);
      return json({ success: true, record: newBook });
    }
    if (url.pathname === '/api/update-book-guide') {
      calls.guide += 1;
      newBook.fields.부모_읽기_가이드 = '함께 볼 점: 친구의 표정을 살펴보세요.';
      newBook.fields.연계놀이 = '준비물: 종이. 방법: ① 친구 얼굴을 그려요 ② 마음을 이야기해요.';
      return json({ success: true });
    }
    if (url.pathname === '/api/reading-log') {
      calls.reading += 1;
      logs.push({ id: 'log-e2e-1', fields: { 책: [newBook.id], 완독여부: true, 아이반응: '😍', 메모: '끝까지 집중했어요.' } });
      return json({ success: true });
    }
    if (url.pathname === '/api/aladin-new-books') return json({ books: [] });
    if (url.pathname === '/api/today-recommendations') return json({ recommendations: [] });
    return json({ success: true, candidates: [], autoTop: [], groups: [], items: [], total: 0 });
  });

  await page.goto('/');
  await expect(page.getByText('우람이랑 도란도란', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '책 추가' }).click();
  await page.getByPlaceholder('책 제목 *').fill('테스트 그림책');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByText('테스트 그림책', { exact: true }).click();
  await page.getByRole('button', { name: '추가하기' }).click();

  await page.getByText('관심책', { exact: true }).click();
  await expect(page.getByText('테스트 그림책', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /가이드 생성/ }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('alertdialog').getByRole('button', { name: '확인' }).click();
  await expect(page.getByText('부모 가이드가 생성되었습니다!')).toBeVisible();

  await page.getByText('테스트 그림책', { exact: true }).click();
  await page.getByText('중간에 멈췄어요', { exact: true }).click();
  await page.getByRole('button', { name: '😍' }).click();
  await page.getByPlaceholder(/책을 읽으면서/).fill('끝까지 집중했어요.');
  await page.getByRole('button', { name: '저장하기' }).click();
  await expect(page.getByRole('button', { name: '저장 완료!' })).toBeVisible();

  expect(calls).toEqual({ add: 1, guide: 1, reading: 1 });
  expect(logs).toHaveLength(1);
});
