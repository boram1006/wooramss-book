const { useState, useEffect, useRef } = React;

        // ⚙️ 설정 (API 키는 서버에서 관리)
        const CONFIG = {
            BOOKS_TABLE: 'Books',
            READING_LOG_TABLE: 'ReadingLog'
        };
        const RECOMMENDATION_CACHE_VERSION = 3;
        const OWNED_RECOMMENDATION_CACHE_VERSION = 3;

        function notify(message, options = {}) {
            window.dispatchEvent(new CustomEvent('doran:notice', {
                detail: {
                    message: String(message || ''),
                    tone: options.tone || (/오류|실패|필요|없습니다/.test(String(message)) ? 'error' : 'success')
                }
            }));
        }

        function confirmAction(message) {
            return new Promise(resolve => {
                window.dispatchEvent(new CustomEvent('doran:confirm', {
                    detail: { message: String(message || ''), resolve }
                }));
            });
        }

        function NotificationCenter() {
            const [notices, setNotices] = useState([]);
            const [confirmation, setConfirmation] = useState(null);

            useEffect(() => {
                const handleNotice = (event) => {
                    const notice = {
                        id: Date.now() + '-' + Math.random(),
                        message: event.detail?.message || '',
                        tone: event.detail?.tone || 'success'
                    };
                    setNotices(current => [...current.slice(-2), notice]);
                    window.setTimeout(() => {
                        setNotices(current => current.filter(item => item.id !== notice.id));
                    }, 4200);
                };
                window.addEventListener('doran:notice', handleNotice);
                const handleConfirm = event => setConfirmation(event.detail || null);
                window.addEventListener('doran:confirm', handleConfirm);
                return () => {
                    window.removeEventListener('doran:notice', handleNotice);
                    window.removeEventListener('doran:confirm', handleConfirm);
                };
            }, []);

            return (
                <>
                    <div className="notice-region" aria-live="polite" aria-atomic="false">
                        {notices.map(notice => (
                            <div className={'clay-notice clay-notice-' + notice.tone} role="status" key={notice.id}>
                                <span className="clay-notice-mark">
                                    <AppIcon name={notice.tone === 'error' ? 'settings' : 'check'} size={18} />
                                </span>
                                <span>{notice.message}</span>
                                <button
                                    className="clay-notice-close"
                                    type="button"
                                    aria-label="알림 닫기"
                                    onClick={() => setNotices(current => current.filter(item => item.id !== notice.id))}
                                >×</button>
                            </div>
                        ))}
                    </div>
                    {confirmation && (
                        <div className="clay-modal-overlay clay-confirm-overlay" role="presentation">
                            <div className="clay-confirm-panel" role="alertdialog" aria-modal="true" aria-labelledby="clay-confirm-title">
                                <span className="clay-confirm-mark"><AppIcon name="brand" size={21} /></span>
                                <h2 id="clay-confirm-title">한 번 확인해주세요</h2>
                                <p>{confirmation.message}</p>
                                <div className="clay-confirm-actions">
                                    <button type="button" className="clay-button clay-button-secondary" onClick={() => {
                                        confirmation.resolve(false);
                                        setConfirmation(null);
                                    }}>취소</button>
                                    <button type="button" className="clay-button" autoFocus onClick={() => {
                                        confirmation.resolve(true);
                                        setConfirmation(null);
                                    }}>확인</button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            );
        }

        function computeAgeMonthsFromBirthdate(birthDateString) {
            if (!birthDateString) return null;
            const parts = birthDateString.split('-');
            if (parts.length !== 3) return null;
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            const day = parseInt(parts[2], 10);
            if (!year || !month || !day) return null;

            const birthDate = new Date(year, month - 1, day);
            if (Number.isNaN(birthDate.getTime())) return null;

            const today = new Date();
            let months =
                (today.getFullYear() - birthDate.getFullYear()) * 12 +
                (today.getMonth() - birthDate.getMonth());

            if (today.getDate() < birthDate.getDate()) {
                months -= 1;
            }

            if (months < 0) months = 0;
            return months;
        }

        function AppIcon({ name, size = 20, strokeWidth = 1.9 }) {
            const icons = {
                brand: <><path d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M19 5.5h-6.5A2.5 2.5 0 0 0 10 8v11h6.5a2.5 2.5 0 0 1 2.5 2.5z"/></>,
                home: <><path d="m3 11 9-8 9 8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-7h5v7"/></>,
                library: <><rect x="4" y="3" width="5" height="18" rx="1.5"/><rect x="10.5" y="3" width="5" height="18" rx="1.5"/><path d="m17 4 3 16"/></>,
                check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16.5 9"/></>,
                heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z"/>,
                settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
                search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
                plus: <><path d="M12 5v14M5 12h14"/></>,
                camera: <><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></>,
                sparkle: <><path d="m12 3 1.2 4.1L17 9l-3.8 1.9L12 15l-1.2-4.1L7 9l3.8-1.9z"/><path d="m5 15 .7 2.3L8 18l-2.3.7L5 21l-.7-2.3L2 18l2.3-.7z"/></>,
                user: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>
            };

            return (
                <svg className="app-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {icons[name] || icons.brand}
                </svg>
            );
        }

        function App() {
            const [books, setBooks] = useState([]);
            const [readingLogs, setReadingLogs] = useState([]);
            const [loading, setLoading] = useState(true);
            const [currentView, setCurrentView] = useState('home'); // home, collection, theme, all, filter, settings
            const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
            const [selectedCollection, setSelectedCollection] = useState(null);
            const [selectedTheme, setSelectedTheme] = useState(null);
            const [selectedBook, setSelectedBook] = useState(null);
            const [selectedAladinBook, setSelectedAladinBook] = useState(null);

            useEffect(() => {
                const handleResize = () => {
                    if (window.innerWidth > 768) {
                        setIsSidebarOpen(true);
                    } else {
                        setIsSidebarOpen(false);
                    }
                };

                window.addEventListener('resize', handleResize);
                return () => window.removeEventListener('resize', handleResize);
            }, []);

            const closeSidebarIfMobile = () => {
                if (window.innerWidth <= 768) {
                    setIsSidebarOpen(false);
                }
            };

            // 🔙 뷰 변경 시 히스토리 추가
            const changeView = (view, data = {}) => {
                setCurrentView(view);
                if (view !== 'home') {
                    window.history.pushState({ view, ...data }, '');
                }
                if (data.theme) setSelectedTheme(data.theme);
                if (data.filterType) setFilterType(data.filterType);
            };

            // 🔙 홈으로 돌아가기
            const goHome = () => {
                setCurrentView('home');
                setSelectedTheme(null);
                setFilterType(null);
                if (window.history.state?.view) {
                    window.history.back();
                }
            };

            // 🔙 브라우저 뒤로가기 처리
            useEffect(() => {
                const handlePopState = (event) => {
                    if (selectedBook) {
                        // 모달이 열려있으면 닫기
                        setSelectedBook(null);
                    } else if (currentView !== 'home') {
                        // 뷰가 홈이 아니면 홈으로
                        setCurrentView('home');
                        setSelectedTheme(null);
                        setFilterType(null);
                    }
                };

                window.addEventListener('popstate', handlePopState);
                return () => window.removeEventListener('popstate', handlePopState);
            }, [selectedBook, currentView]);

            // 📖 책 선택 시 히스토리에 추가
            const selectBook = (book) => {
                setSelectedBook(book);
                // 히스토리에 상태 추가
                window.history.pushState({ modal: true }, '');
            };

            // 📕 책 닫기
            const closeBook = () => {
                setSelectedBook(null);
                // 히스토리 뒤로가기 (pushState로 추가한 항목 제거)
                if (window.history.state?.modal) {
                    window.history.back();
                }
            };
            const [searchTerm, setSearchTerm] = useState('');
            const [showAddForm, setShowAddForm] = useState(false);
            const [aladinNewBooks, setAladinNewBooks] = useState([]);
            const [aladinLoading, setAladinLoading] = useState(false);
            const [filterType, setFilterType] = useState(null);
            const [showSearchModal, setShowSearchModal] = useState(false);
            const [showReadPhotoModal, setShowReadPhotoModal] = useState(false);
            const [searchQuery, setSearchQuery] = useState('');
            const [searchScanOpen, setSearchScanOpen] = useState(false);
            const [searchScanDecoding, setSearchScanDecoding] = useState(false);
            const [searchScanReady, setSearchScanReady] = useState(false);
            const [searchScanImage, setSearchScanImage] = useState(null);
            const [searchScanMessage, setSearchScanMessage] = useState('');
            const searchVideoRef = useRef(null);
            const searchCanvasRef = useRef(null);
            const searchStreamRef = useRef(null);
            const [searchResults, setSearchResults] = useState([]);
            const [searchLoading, setSearchLoading] = useState(false); // 'read', 'loved', 'reading'
            const [showChildProfile, setShowChildProfile] = useState(false);
            const [childProfile, setChildProfile] = useState(() => {
                // localStorage에서 아이 프로필 불러오기
                const saved = localStorage.getItem('childProfile');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    return {
                        birthDate: parsed.birthDate || '',
                        ageMonths: parsed.ageMonths || '',
                        gender: parsed.gender || '',
                        booksPerDay: parsed.booksPerDay || 2,
                        emotionSensitivity: parsed.emotionSensitivity || 'normal'
                    };
                }
                return {
                    birthDate: '',
                    ageMonths: '',
                    gender: '',
                    booksPerDay: 2,
                    emotionSensitivity: 'normal'
                };
            });
            const [selectedInterests, setSelectedInterests] = useState(() => {
                const saved = localStorage.getItem('selectedInterests');
                try {
                    const parsed = saved ? JSON.parse(saved) : [];
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    return [];
                }
            });
            useEffect(() => {
                localStorage.setItem('selectedInterests', JSON.stringify(selectedInterests));
            }, [selectedInterests]);

            useEffect(() => {
                let cancelled = false;
                const loadSavedSettings = async () => {
                    try {
                        const response = await fetch('/api/supabase?table=ChildSettings', { cache: 'no-store' });
                        if (!response.ok) throw new Error('server settings unavailable');
                        const data = await response.json();
                        if (cancelled) return;
                        if (!data.exists) {
                            await fetch('/api/supabase?table=ChildSettings', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ profile: childProfile, selectedInterests })
                            });
                            return;
                        }
                        if (data.profile) {
                            setChildProfile(data.profile);
                            localStorage.setItem('childProfile', JSON.stringify(data.profile));
                        }
                        if (Array.isArray(data.selectedInterests)) {
                            setSelectedInterests(data.selectedInterests);
                            localStorage.setItem('selectedInterests', JSON.stringify(data.selectedInterests));
                        }
                    } catch (error) {
                        console.warn('[child-settings] 브라우저에 저장된 설정을 사용합니다.', error);
                    }
                };
                loadSavedSettings();
                return () => { cancelled = true; };
            }, []);

            const [notInterestedBooks, setNotInterestedBooks] = useState(() => {
                try {
                    const saved = localStorage.getItem('notInterestedBooks');
                    return saved ? JSON.parse(saved) : [];
                } catch (e) {
                    return [];
                }
            });

            const computedAgeMonths = computeAgeMonthsFromBirthdate(childProfile.birthDate);
            const effectiveAgeMonths = Number.isFinite(computedAgeMonths)
                ? computedAgeMonths
                : (Number.isFinite(parseInt(childProfile.ageMonths, 10)) ? parseInt(childProfile.ageMonths, 10) : '');

            // 아이 프로필 저장
            const saveChildProfile = async (profile, interests = selectedInterests) => {
                const derivedAgeMonths = computeAgeMonthsFromBirthdate(profile.birthDate);
                const normalizedProfile = {
                    ...profile,
                    ageMonths: Number.isFinite(derivedAgeMonths) ? derivedAgeMonths : (profile.ageMonths || '')
                };
                setChildProfile(normalizedProfile);
                localStorage.setItem('childProfile', JSON.stringify(normalizedProfile));
                localStorage.setItem('selectedInterests', JSON.stringify(interests));
                const response = await fetch('/api/supabase?table=ChildSettings', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile: normalizedProfile, selectedInterests: interests })
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || '설정을 서버에 저장하지 못했어요.');
                return data;
                // 추천 재로드는 useEffect([effectiveAgeMonths, ...])가 리렌더 후 올바른 값으로 처리
            };

            useEffect(() => {
                loadData();
            }, []);

            useEffect(() => {
                // 데이터 로드 후 오늘의 추천 가져오기 (10권 증가 체크는 loadData에서 처리)
                if (books.length > 0 && readingLogs.length > 0) {
                    const lastReadingCount = parseInt(localStorage.getItem('lastReadingCount') || '0');
                    const currentReadingCount = readingLogs.length;
                    const shouldForceRefresh = currentReadingCount - lastReadingCount >= 10;
                    
                    if (!shouldForceRefresh) {
                        loadTodayRecommendations().catch(err => console.error('오늘의 추천 로드 실패:', err));
                    }
                }
            }, [books, readingLogs]);

            // 아이 프로필 변경 시 추천 재로드
            useEffect(() => {
                if (books.length > 0 && readingLogs.length > 0 && effectiveAgeMonths !== '') {
                    // 프로필이 설정되어 있으면 추천 재로드
                    loadTodayRecommendations(true).catch(err => console.error('오늘의 추천 재로드 실패:', err));
                    loadAladinNewBooks(true).catch(err => console.error('알라딘 신간 재로드 실패:', err));
                }
            }, [effectiveAgeMonths, childProfile.emotionSensitivity, childProfile.booksPerDay, selectedInterests]);

            async function loadData() {
                try {
                    const [booksData, logsData] = await Promise.all([
                        fetchAirtable(CONFIG.BOOKS_TABLE),
                        fetchAirtable(CONFIG.READING_LOG_TABLE)
                    ]);
                    setBooks(booksData);
                    setReadingLogs(logsData);
                    
                    // 읽기 기록 수 비교 (10권 이상 증가했으면 강제 새로고침)
                    const lastReadingCount = parseInt(localStorage.getItem('lastReadingCount') || '0');
                    const currentReadingCount = logsData.length;
                    const shouldForceRefresh = currentReadingCount - lastReadingCount >= 10;
                    
                    if (shouldForceRefresh) {
                        console.log(`📚 읽기 기록이 ${currentReadingCount - lastReadingCount}권 증가했습니다. 추천을 새로고침합니다.`);
                        localStorage.setItem('lastReadingCount', currentReadingCount.toString());
                        // 강제 새로고침
                        loadAladinNewBooks(true).catch(err => console.error('알라딘 신간 재로드 실패:', err));
                        loadTodayRecommendations(true).catch(err => console.error('오늘의 추천 재로드 실패:', err));
                    } else {
                        // 일반 로드
                        loadAladinNewBooks().catch(err => console.error('알라딘 신간 로드 실패:', err));
                        // 마지막 읽기 기록 수 업데이트
                        localStorage.setItem('lastReadingCount', currentReadingCount.toString());
                    }
                } catch (error) {
                    console.error('데이터 로드 실패:', error);
                } finally {
                    setLoading(false);
                }
            }

            // 📚 신간 기반 오늘의 추천 (4~7세, 캐릭터 제외) - 한 달에 한 번만 로드
            async function loadAladinNewBooks(forceRefresh = false) {
                const today = new Date();
                const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
                
                // 강제 새로고침이 아니면 캐시 확인
                if (!forceRefresh) {
                    try {
                        const cached = localStorage.getItem('today_recommend_cache');
                        if (cached) {
                            const { date, books, ageMonths: cachedAgeMonths, version, expiresAt } = JSON.parse(cached);
                            const ageMonthsMatch = effectiveAgeMonths === '' || cachedAgeMonths === effectiveAgeMonths;
                            const cacheFresh = expiresAt ? Date.now() < expiresAt : date === monthKey;
                            if (version === RECOMMENDATION_CACHE_VERSION && cacheFresh && books.length > 0 && ageMonthsMatch) {
                                console.log('📘 오늘의 추천 캐시 사용:', books.length, '권');
                                setAladinNewBooks(books);
                                return books;
                            }
                        }
                    } catch (e) {
                        console.error('캐시 로드 실패:', e);
                    }
                } else {
                    localStorage.removeItem('today_recommend_cache');
                }
                
                // 새로 로드
                setAladinLoading(true);
                console.log('📘 오늘의 추천(신간 기반) API 호출...');
                
                try {
                    // 아이 프로필을 쿼리 파라미터로 전달
                    const profileParams = new URLSearchParams();
                    if (effectiveAgeMonths !== '') profileParams.append('ageMonths', effectiveAgeMonths);
                    if (childProfile.gender) profileParams.append('gender', childProfile.gender);
                    if (childProfile.booksPerDay) profileParams.append('booksPerDay', childProfile.booksPerDay);
                    if (childProfile.emotionSensitivity) profileParams.append('emotionSensitivity', childProfile.emotionSensitivity);
                    if (selectedInterests.length > 0) profileParams.append('interests', selectedInterests.join(','));
                    profileParams.append('poolSource', 'all');
                    profileParams.append('userId', 'default');
                    
                    if (forceRefresh) {
                        profileParams.append('force', '1');
                        profileParams.append('ts', Date.now().toString());
                    }
                    
                    const url = `/api/aladin-new-books${profileParams.toString() ? '?' + profileParams.toString() : ''}`;
                    const response = await fetch(url, { cache: 'no-store' });
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('📘 API 호출 실패:', response.status, errorText);
                        throw new Error('API 호출 실패: ' + response.status);
                    }
                    const data = await response.json();
                    
                    // 디버깅 정보 출력
                    if (data.debug) {
                        console.log('📘 추천 디버깅 정보:', data.debug);
                    }
                    
                    // 백엔드가 반환하는 형식: { success: true, total: number, books: [...] }
                    if (data.success && data.books && data.books.length > 0) {
                        console.log('📘 오늘의 추천:', data.books.length, '권', data.books);
                        
                        // 첫 번째 책의 recommendationReason 확인
                        if (data.books[0]) {
                            console.log('📘 첫 번째 추천 이유:', data.books[0].recommendationReason);
                        }
                        
                        const filtered = data.books;
                        
                        // localStorage에 저장 (월별 키 사용)
                        try {
                            const today = new Date();
                            const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
                            const allReasonsGenerated = filtered.every(book => book.recommendationSource === 'ai_batch');
                            localStorage.setItem('today_recommend_cache', JSON.stringify({
                                version: RECOMMENDATION_CACHE_VERSION,
                                date: monthKey,
                                books: filtered,
                                ageMonths: effectiveAgeMonths,
                                expiresAt: allReasonsGenerated ? null : Date.now() + 5 * 60 * 1000
                            }));
                            console.log('📘 오늘의 추천 캐시 저장:', filtered.length, '권');
                        } catch (e) {
                            console.error('캐시 저장 실패:', e);
                        }
                        
                        setAladinNewBooks(filtered);
                        return filtered;
                    } else {
                        console.log('📘 오늘의 추천 없음', data);
                        // 신간이 없어도 기존 데이터는 유지 (빈 배열로 설정하지 않음)
                        if (aladinNewBooks.length === 0) {
                            setAladinNewBooks([]);
                        }
                        return [];
                    }
                } catch (error) {
                    console.error('📘 오늘의 추천 API 오류:', error);
                    // 에러 발생 시에도 기존 데이터 유지
                    if (aladinNewBooks.length === 0) {
                        setAladinNewBooks([]);
                    }
                    return [];
                } finally {
                    setAladinLoading(false);
                }
            }

            async function excludeAladinBook(book, reason = '') {
                try {
                    const response = await fetch('/api/exclude-aladin-book', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            isbn13: book.isbn13 || book.isbn,
                            title: book.title,
                            reason,
                            userId: 'default'
                        })
                    });
                    const data = await response.json();
                    if (!data.success) {
                        notify('오류: ' + (data.error || '제외 실패'));
                        return false;
                    }
                    setAladinNewBooks(prev => prev.filter(item =>
                        (item.isbn13 || item.isbn) !== (book.isbn13 || book.isbn)
                    ));
                    return true;
                } catch (error) {
                    console.error('제외 처리 오류:', error);
                    notify('제외 처리 중 오류가 발생했습니다');
                    return false;
                }
            }

            // DB 책 "안볼래요" 처리
            const skipDbBook = (bookId) => {
                const id = String(bookId);
                const updated = [...notInterestedBooks, id];
                setNotInterestedBooks(updated);
                localStorage.setItem('notInterestedBooks', JSON.stringify(updated));
                // 즉시 목록에서 제거
                setRecommendations(prev => prev.filter(item => String(item.book.id) !== id));
                // 캐시 무효화 (다음 로드 시 skip 반영)
                localStorage.removeItem('todayRecommendations');
            };

            const stopSearchCamera = () => {
                if (searchStreamRef.current) {
                    searchStreamRef.current.getTracks().forEach((track) => track.stop());
                    searchStreamRef.current = null;
                }
                if (searchVideoRef.current) {
                    searchVideoRef.current.srcObject = null;
                }
                setSearchScanReady(false);
            };

            const startSearchCamera = () => {
                setSearchScanReady(false);
                setSearchScanDecoding(false);
                setSearchScanImage(null);
                setSearchScanMessage('');

                navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false
                }).then((stream) => {
                    searchStreamRef.current = stream;
                    if (searchVideoRef.current) {
                        searchVideoRef.current.srcObject = stream;
                        searchVideoRef.current.play();
                    }
                }).catch((error) => {
                    console.error('카메라 접근 오류:', error);
                    notify('카메라 접근 권한이 필요합니다. 브라우저 설정에서 카메라 권한을 허용해주세요.');
                    setSearchScanOpen(false);
                });
            };

            const handleSearchScanStart = () => {
                if (!window.Quagga) {
                    notify('바코드 스캐너 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해주세요.');
                    return;
                }
                setSearchScanOpen(true);
                startSearchCamera();
            };

            const handleSearchCapture = () => {
                if (!searchVideoRef.current || !searchCanvasRef.current) {
                    return;
                }

                const video = searchVideoRef.current;
                const canvas = searchCanvasRef.current;
                if (!video.videoWidth || !video.videoHeight) {
                    notify('카메라 준비 중입니다. 잠시 후 다시 시도해주세요.');
                    return;
                }
                const width = video.videoWidth;
                const height = video.videoHeight;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/png');
                setSearchScanImage(dataUrl);
                setSearchScanMessage('');
                stopSearchCamera();
                setSearchScanDecoding(true);

                const tryDecode = (size) => new Promise((resolve) => {
                    Quagga.decodeSingle({
                        src: dataUrl,
                        numOfWorkers: 0,
                        inputStream: { size, singleChannel: false },
                        locator: { patchSize: "medium", halfSample: true },
                        decoder: {
                            readers: [
                                "ean_reader",
                                "ean_8_reader",
                                "upc_reader",
                                "upc_e_reader",
                                "code_128_reader"
                            ]
                        },
                        locate: true
                    }, (result) => resolve(result));
                });

                const attempt = async () => {
                    const sizes = [2000, 1600, 1200, 800];
                    for (const size of sizes) {
                        const result = await tryDecode(size);
                        if (result && result.codeResult && result.codeResult.code) {
                            return result.codeResult.code;
                        }
                    }
                    return null;
                };

                attempt().then((code) => {
                    setSearchScanDecoding(false);
                    if (code) {
                        const isbn = code.replace(/[^0-9X]/g, '');
                        if (isbn.length === 10 || isbn.length === 13) {
                            setSearchQuery(isbn);
                            searchAladinBooks(isbn, true);
                            setSearchScanOpen(false);
                            return;
                        }
                        setSearchScanMessage('올바른 ISBN 바코드를 인식하지 못했습니다. 다시 찍어주세요.');
                    } else {
                        setSearchScanMessage('인식 실패: 더 가까이/밝은 곳에서 다시 찍어주세요.');
                    }
                });
            };

            const handleSearchScanRetry = () => {
                setSearchScanImage(null);
                setSearchScanMessage('');
                startSearchCamera();
            };

            // 📚 알라딘 책 검색
            async function searchAladinBooks(query, isIsbn = false) {
                if (!query.trim()) return;
                
                setSearchLoading(true);
                try {
                    const response = await fetch(`/api/aladin-search?query=${encodeURIComponent(query)}${isIsbn ? '&isbn=true' : ''}`);
                    const data = await response.json();
                    
                    if (data.success) {
                        setSearchResults(data.books || []);
                    } else {
                        notify('검색 실패: ' + data.error);
                    }
                } catch (error) {
                    console.error('검색 오류:', error);
                    notify('검색 중 오류가 발생했습니다');
                } finally {
                    setSearchLoading(false);
                }
            }

            // 📖 관심 있는 책 추가 (Airtable에 저장)
            async function addInterestedBook(book) {
                try {
                    // Airtable에서 책 찾기 (ISBN 또는 제목으로)
                    const booksData = await fetchAirtable(CONFIG.BOOKS_TABLE);
                    const existingBook = booksData.find(b => 
                        (b.fields['ISBN'] && book.isbn && b.fields['ISBN'] === book.isbn) ||
                        (b.fields['제목'] && book.title && b.fields['제목'] === book.title)
                    );
                    
                    if (existingBook) {
                        // 이미 있는 책이면 관심 필드만 업데이트
                        const response = await fetch('/api/update-book-field', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                recordId: existingBook.id,
                                fields: {
                                    '관심': true
                                }
                            })
                        });
                        
                        const data = await response.json();
                        if (data.success) {
                            notify('관심책에 추가되었습니다!');
                            await loadData();
                        } else {
                            notify('오류: ' + (data.error || '저장 실패'));
                        }
                    } else {
                        // 책이 없으면 조용히 무시 (팝업 없음)
                    }
                } catch (error) {
                    console.error('관심책 추가 오류:', error);
                    notify('관심책 추가 중 오류가 발생했습니다');
                }
            }

            async function fetchAirtable(tableName) {
                // Supabase로 마이그레이션됨 - 하위 호환성을 위해 함수명 유지
                const response = await fetch(`/api/supabase?table=${tableName}`);
                if (!response.ok) {
                    throw new Error('Supabase fetch failed');
                }
                return await response.json();
            }

            async function updateReadingLog(bookId, logData) {
                try {
                    const existingLog = readingLogs.find(log => log.fields['책']?.[0] === bookId);

                    const response = await fetch('/api/reading-log', {
                        method: existingLog ? 'PATCH' : 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            bookId,
                            logData,
                            recordId: existingLog?.id
                        })
                    });

                    if (response.ok) {
                        console.log('✅ 로그 저장 성공');
                        await loadData(); // 새로고침
                        // 읽기 기록 업데이트 후 추천 재로드
                        setTimeout(() => {
                            loadTodayRecommendations(true).catch(err => console.error('오늘의 추천 재로드 실패:', err));
                            loadAladinNewBooks(true).catch(err => console.error('알라딘 신간 재로드 실패:', err));
                        }, 500);
                        return true;
                    } else {
                        const error = await response.json();
                        console.error('❌ 오류:', error);
                        notify('오류: ' + (error.error || '알 수 없는 오류'));
                        return false;
                    }
                } catch (error) {
                    console.error('❌ 로그 업데이트 실패:', error);
                    notify('오류: ' + error.message);
                    return false;
                }
            }

            // 📊 통계 계산
            const stats = {
                total: books.length,
                read: readingLogs.length,
                loved: readingLogs.filter(log => log.fields['아이반응'] === '😍').length,
                interested: books.filter(b => b.fields['관심'] === true || b.fields['관심'] === 'true').length
            };

            // 🎯 오늘의 추천 (점수 기반 알고리즘)
            const getTodayRecommendations = (booksData, logsData) => {
                const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                
                // 읽지 않은 책
                const unreadBooks = booksData.filter(book => 
                    !logsData.find(log => log.fields['책']?.[0] === book.id)
                );
                
                if (unreadBooks.length === 0) return null;
                
                // 😍 최애 책들의 테마 수집
                const lovedBooks = logsData
                    .filter(log => log.fields['아이반응'] === '😍')
                    .map(log => booksData.find(b => b.id === log.fields['책']?.[0]))
                    .filter(Boolean);
                
                const lovedThemes = lovedBooks
                    .map(b => b.fields['테마'])
                    .filter(Boolean)
                    .join(',')
                    .split(',')
                    .map(t => t.trim().toLowerCase())
                    .filter(Boolean);
                
                // 최근 읽은 책들의 테마
                const recentBooks = logsData
                    .slice(-10) // 최근 10권
                    .map(log => booksData.find(b => b.id === log.fields['책']?.[0]))
                    .filter(Boolean);
                
                const recentThemes = recentBooks
                    .map(b => b.fields['테마'])
                    .filter(Boolean)
                    .join(',')
                    .split(',')
                    .map(t => t.trim().toLowerCase())
                    .filter(Boolean);
                
                // 우람이 연령 추정 (읽은 책들 기준)
                const readBooksWithAge = logsData
                    .map(log => booksData.find(b => b.id === log.fields['책']?.[0]))
                    .filter(b => b && b.fields['연령']);
                
                let targetMinAge = 4, targetMaxAge = 7;
                if (readBooksWithAge.length > 0) {
                    const ageRanges = readBooksWithAge
                        .map(b => {
                            const match = b.fields['연령'].match(/(\d+)[-~](\d+)/);
                            if (match) return { min: parseInt(match[1]), max: parseInt(match[2]) };
                            const single = b.fields['연령'].match(/(\d+)/);
                            if (single) return { min: parseInt(single[1]), max: parseInt(single[1]) };
                            return null;
                        })
                        .filter(Boolean);
                    
                    if (ageRanges.length > 0) {
                        targetMinAge = Math.round(ageRanges.reduce((sum, r) => sum + r.min, 0) / ageRanges.length);
                        targetMaxAge = Math.round(ageRanges.reduce((sum, r) => sum + r.max, 0) / ageRanges.length);
                    }
                }
                
                // 각 책에 점수 계산 (총 100점)
                const scoredBooks = unreadBooks.map(book => {
                    let score = 0;
                    
                    // 1. 테마 점수 (50점) - 우선순위 강화
                    const bookThemes = (book.fields['테마'] || '')
                        .split(',')
                        .map(t => t.trim().toLowerCase())
                        .filter(Boolean);
                    
                    let lovedMatches = 0;
                    let recentMatches = 0;
                    
                    bookThemes.forEach(theme => {
                        if (lovedThemes.includes(theme)) lovedMatches++;
                        if (recentThemes.includes(theme)) recentMatches++;
                    });
                    
                    if (lovedMatches >= 2) score += 50;
                    else if (lovedMatches === 1) score += 30;
                    else if (recentMatches > 0) score += 15;
                    
                    // 2. 연령 점수 (30점)
                    const ageField = book.fields['연령'] || '';
                    const ageMatch = ageField.match(/(\d+)[-~](\d+)/);
                    
                    if (ageMatch) {
                        const bookMinAge = parseInt(ageMatch[1]);
                        const bookMaxAge = parseInt(ageMatch[2]);
                        
                        // 정확히 일치
                        if (bookMinAge === targetMinAge && bookMaxAge === targetMaxAge) {
                            score += 30;
                        }
                        // 범위 내
                        else if (bookMinAge <= targetMaxAge && bookMaxAge >= targetMinAge) {
                            score += 20;
                        }
                    } else {
                        const singleAge = ageField.match(/(\d+)/);
                        if (singleAge) {
                            const age = parseInt(singleAge[1]);
                            if (age >= targetMinAge && age <= targetMaxAge) {
                                score += 25;
                            }
                        }
                    }
                    
                    // 3. 다양성 점수 (20점)
                    const publisher = book.fields['출판사'] || '';
                    const collection = book.fields['전집명'] || '';
                    
                    const recentPublishers = recentBooks.map(b => b.fields['출판사']).filter(Boolean);
                    const recentCollections = recentBooks.map(b => b.fields['전집명']).filter(Boolean);
                    
                    if (!recentPublishers.includes(publisher) || !publisher) score += 10;
                    if (!recentCollections.includes(collection) || !collection) score += 10;
                    
                    return { book, score, lovedMatches, recentMatches };
                });
                
                // 점수 순으로 정렬
                scoredBooks.sort((a, b) => b.score - a.score);
                
                // 같은 점수면 날짜 시드로 섞기
                const seed = today.split('-').reduce((a, b) => parseInt(a) + parseInt(b), 0);
                let randomSeed = seed;
                const seededRandom = () => {
                    randomSeed = (randomSeed * 9301 + 49297) % 233280;
                    return randomSeed / 233280;
                };
                
                const grouped = {};
                scoredBooks.forEach(item => {
                    if (!grouped[item.score]) grouped[item.score] = [];
                    grouped[item.score].push(item);
                });
                
                Object.keys(grouped).forEach(score => {
                    const group = grouped[score];
                    for (let i = group.length - 1; i > 0; i--) {
                        const j = Math.floor(seededRandom() * (i + 1));
                        [group[i], group[j]] = [group[j], group[i]];
                    }
                });
                
                const finalList = Object.keys(grouped)
                    .sort((a, b) => b - a)
                    .flatMap(score => grouped[score]);
                
                return {
                    recommendations: finalList.slice(0, 10),
                    userProfile: {
                        lovedThemes: [...new Set(lovedThemes)],
                        recentThemes: [...new Set(recentThemes)],
                        ageRange: `${targetMinAge}-${targetMaxAge}세`
                    }
                };
            };

            // 🎯 오늘의 추천 (API로 가져오기)
            const [recommendations, setRecommendations] = useState([]);
            const [recommendationsLoading, setRecommendationsLoading] = useState(false);

            async function loadTodayRecommendations(forceRefresh = false) {
                const today = new Date().toISOString().split('T')[0];
                
                // 강제 새로고침이 아니면 캐시 확인
                if (!forceRefresh) {
                    try {
                        const cached = localStorage.getItem('todayRecommendations');
                        if (cached) {
                            const { date, books, version, ageMonths: cachedAgeMonths, expiresAt } = JSON.parse(cached);
                            const ageMonthsMatch = effectiveAgeMonths === '' || cachedAgeMonths === effectiveAgeMonths;
                            const cacheFresh = expiresAt ? Date.now() < expiresAt : date === today;
                            if (version === OWNED_RECOMMENDATION_CACHE_VERSION && cacheFresh && books.length > 0 && ageMonthsMatch) {
                                console.log('🎯 오늘의 추천 캐시 사용:', books.length, '권');
                                setRecommendations(books);
                                return books;
                            }
                        }
                    } catch (e) {
                        console.error('캐시 로드 실패:', e);
                    }
                } else {
                    localStorage.removeItem('todayRecommendations');
                }
                
                setRecommendationsLoading(true);
                console.log('🎯 오늘의 추천 API 호출...');
                
                try {
                    // 아이 프로필을 쿼리 파라미터로 전달
                    const profileParams = new URLSearchParams();
                    if (effectiveAgeMonths !== '') profileParams.append('ageMonths', effectiveAgeMonths);
                    if (childProfile.gender) profileParams.append('gender', childProfile.gender);
                    if (childProfile.booksPerDay) profileParams.append('booksPerDay', childProfile.booksPerDay);
                    if (childProfile.emotionSensitivity) profileParams.append('emotionSensitivity', childProfile.emotionSensitivity);
                    if (selectedInterests.length > 0) profileParams.append('interests', selectedInterests.join(','));
                    if (notInterestedBooks.length > 0) profileParams.append('skip', notInterestedBooks.join(','));

                    if (forceRefresh) {
                        profileParams.append('force', '1');
                        profileParams.append('ts', Date.now().toString());
                    }

                    const url = `/api/today-recommendations${profileParams.toString() ? '?' + profileParams.toString() : ''}`;
                    const response = await fetch(url, { cache: 'no-store' });
                    
                    if (!response.ok) {
                        throw new Error('API 호출 실패: ' + response.status);
                    }
                    
                    const data = await response.json();
                    
                    if (data.success && data.books && data.books.length > 0) {
                        console.log('🎯 오늘의 추천:', data.books.length, '권');
                        
                        // Airtable 책 데이터와 매칭
                        const matchedBooks = data.books.map(apiBook => {
                            const book = books.find(b => b.id === apiBook.id);
                            return book ? {
                                book,
                                score: apiBook.score,
                                recommendationReason: apiBook.recommendationReason,
                                recommendationSource: apiBook.recommendationSource,
                                evidence: apiBook.evidence
                            } : null;
                        }).filter(Boolean);
                        
                        // localStorage에 저장
                        try {
                            const allReasonsGenerated = matchedBooks.every(item => item.recommendationSource === 'ai_batch');
                            localStorage.setItem('todayRecommendations', JSON.stringify({
                                version: OWNED_RECOMMENDATION_CACHE_VERSION,
                                date: today,
                                books: matchedBooks,
                                ageMonths: effectiveAgeMonths,
                                expiresAt: allReasonsGenerated ? null : Date.now() + 5 * 60 * 1000
                            }));
                            console.log('🎯 오늘의 추천 캐시 저장:', matchedBooks.length, '권');
                        } catch (e) {
                            console.error('캐시 저장 실패:', e);
                        }
                        
                        setRecommendations(matchedBooks);
                        return matchedBooks;
                    } else {
                        console.log('🎯 오늘의 추천 없음', data);
                        setRecommendations([]);
                        return [];
                    }
                } catch (error) {
                    console.error('🎯 오늘의 추천 API 오류:', error);
                    // 에러 시 기존 로직으로 fallback
                    const todayResult = books.length > 0 && readingLogs.length > 0 
                        ? getTodayRecommendations(books, readingLogs) 
                        : null;
                    const fallbackRecs = todayResult?.recommendations || [];
                    setRecommendations(fallbackRecs.map(item => ({ ...item, recommendationReason: null })));
                    return fallbackRecs;
                } finally {
                    setRecommendationsLoading(false);
                }
            }

            // 📖 읽고 있는 책 (제거 - 의도된 기능이 아님)
            // const currentlyReading = readingLogs
            //     .filter(log => !log.fields['완독여부'])
            //     .map(log => books.find(book => book.id === log.fields['책']?.[0]))
            //     .filter(Boolean);

            // 📚 전집 목록
            const collections = [...new Set(books.map(b => b.fields['전집명']).filter(Boolean))]
                .map(name => ({
                    name,
                    count: books.filter(b => b.fields['전집명'] === name).length
                }))
                .sort((a, b) => b.count - a.count);

            // 🏷️ 인기 테마
            const allThemes = books
                .map(b => b.fields['테마'])
                .filter(Boolean)
                .join(',')
                .split(',')
                .map(t => t.trim())
                .filter(Boolean);
            
            const themeCount = {};
            allThemes.forEach(theme => {
                themeCount[theme] = (themeCount[theme] || 0) + 1;
            });
            
            const popularThemes = Object.entries(themeCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([theme]) => theme);

            if (loading) {
                return (
                    <div className="loading">
                        <span className="loading-mark"><AppIcon name="brand" size={24} /></span>
                        <span>도서 정보를 불러오는 중...</span>
                    </div>
                );
            }

            return (
                <div className="app-container">
                    <div
                        className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
                        onClick={() => setIsSidebarOpen(false)}
                    ></div>
                    {/* 사이드바 */}
                    <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                        <div className="sidebar-header">
                            <span><AppIcon name="brand" size={22} /></span>
                            <span>도란도란</span>
                        </div>
                        <div className="sidebar-nav">
                            <div 
                                className={`nav-item ${currentView === 'home' ? 'active' : ''}`}
                                onClick={() => {
                                    goHome();
                                    setSearchTerm('');
                                    closeSidebarIfMobile();
                                }}
                            >
                                <span><AppIcon name="home" /></span>
                                <span>대시보드</span>
                            </div>
                            <div 
                                className={`nav-item ${currentView === 'all' ? 'active' : ''}`}
                                onClick={() => {
                                    changeView('all');
                                    closeSidebarIfMobile();
                                }}
                            >
                                <span><AppIcon name="library" /></span>
                                <span>전체 책</span>
                            </div>
                            <div 
                                className={`nav-item ${currentView === 'filter' && filterType === 'read' ? 'active' : ''}`}
                                onClick={() => {
                                    changeView('filter', { filterType: 'read' });
                                    closeSidebarIfMobile();
                                }}
                            >
                                <span><AppIcon name="check" /></span>
                                <span>읽은 책</span>
                            </div>
                            <div 
                                className={`nav-item ${currentView === 'filter' && filterType === 'interested' ? 'active' : ''}`}
                                onClick={() => {
                                    changeView('filter', { filterType: 'interested' });
                                    closeSidebarIfMobile();
                                }}
                            >
                                <span><AppIcon name="heart" /></span>
                                <span>관심책</span>
                            </div>
                            <div 
                                className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
                                onClick={() => {
                                    changeView('settings');
                                    closeSidebarIfMobile();
                                }}
                            >
                                <span><AppIcon name="settings" /></span>
                                <span>설정</span>
                            </div>
                        </div>
                        <div className="sidebar-footer">
                            <div className="profile-avatar"><AppIcon name="user" size={21} /></div>
                            <div className="profile-info">
                                <div className="profile-name">우람이</div>
                                <div className="profile-role">부모 계정</div>
                            </div>
                        </div>
                    </div>

                    {/* 메인 콘텐츠 */}
                    <div className="main-content">
                        {/* 상단 헤더 - 홈에서만 검색/책 추가 표시 */}
                        <div className="top-header">
                            <button
                                className="menu-button"
                                onClick={() => setIsSidebarOpen(true)}
                                aria-label="사이드바 열기"
                            >
                                ☰
                            </button>
                            {currentView === 'home' && (
                                <>
                                    <div className="search-bar">
                                        <span className="search-icon"><AppIcon name="search" size={19} /></span>
                                        <input
                                            type="text"
                                            placeholder="책 제목, 저자, 테마로 검색..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        className="add-book-btn"
                                        onClick={() => setShowAddForm(true)}
                                    >
                                        <span><AppIcon name="plus" size={19} /></span>
                                        <span>책 추가</span>
                                    </button>
                                </>
                            )}
                        </div>

                    {/* 홈 화면 */}
                    {currentView === 'home' && (
                        <div>
                            {/* 검색 결과 표시 */}
                            {searchTerm && (
                                <Section
                                    title={`🔍 검색 결과: "${searchTerm}"`}
                                    subtitle={`${books.filter(b => 
                                        b.fields['제목']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        b.fields['저자']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        b.fields['테마']?.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).length}권 발견`}
                                >
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                                        gap: '1.5rem'
                                    }}>
                                        {books
                                            .filter(b => 
                                                b.fields['제목']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                b.fields['저자']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                                b.fields['테마']?.toLowerCase().includes(searchTerm.toLowerCase())
                                            )
                                            .slice(0, 12)
                                            .map(book => {
                                                const log = readingLogs.find(l => l.fields['책']?.[0] === book.id);
                                                return (
                                                    <BookCard
                                                        key={book.id}
                                                        book={book}
                                                        log={log}
                                                        onClick={() => selectBook(book)}
                                                    />
                                                );
                                            })}
                                    </div>
                                    {books.filter(b => 
                                        b.fields['제목']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        b.fields['저자']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                        b.fields['테마']?.toLowerCase().includes(searchTerm.toLowerCase())
                                    ).length > 12 && (
                                        <button
                                            onClick={() => changeView('all', { searchTerm: searchTerm })}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                marginTop: '1rem',
                                                background: '#FF69B4',
                                                border: 'none',
                                                borderRadius: '10px',
                                                color: 'white',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            전체 검색 결과 보기 →
                                        </button>
                                    )}
                                </Section>
                            )}

                            {!searchTerm && (
                                <>
                            {/* 환영 섹션 */}
                            <div className="welcome-section">
                                <div className="welcome-copy">
                                    <span className="welcome-eyebrow">DORANDORAN READING CLUB</span>
                                    <h1 className="welcome-title">
                                        우람이랑 도란도란
                                    </h1>
                                    <p className="welcome-subtitle">
                                        오늘, 어떤 이야기를 펼쳐볼까요? 우람이의 마음과 호기심에 꼭 맞는 책을 발견하고, 함께 읽은 순간을 차곡차곡 기록해요.
                                    </p>
                                </div>
                                <div className="welcome-art" aria-hidden="true">
                                    <img src="./assets/clay-reading-hero.png" alt="" />
                                </div>
                            </div>

                            {/* 통계 카드 */}
                            <div className="stats-grid">
                                <div 
                                    className="stat-card"
                                    onClick={() => goHome()}
                                >
                                    <div className="stat-icon" style={{ background: '#E3F2FD', borderRadius: '12px' }}>
                                        <AppIcon name="library" size={22} />
                                    </div>
                                    <div className="stat-value">{stats.total}</div>
                                    <div className="stat-label">전체 책</div>
                                </div>
                                <div 
                                    className="stat-card"
                                    onClick={() => changeView('filter', { filterType: 'read' })}
                                >
                                    <div className="stat-icon" style={{ background: '#E8F5E9', borderRadius: '12px' }}>
                                        <AppIcon name="check" size={22} />
                                    </div>
                                    <div className="stat-value">{stats.read}</div>
                                    <div className="stat-label">읽은 책</div>
                                </div>
                                <div 
                                    className="stat-card"
                                    onClick={() => changeView('filter', { filterType: 'interested' })}
                                >
                                    <div className="stat-icon" style={{ background: '#FFF3E0', borderRadius: '12px' }}>
                                        <AppIcon name="heart" size={22} />
                                    </div>
                                    <div className="stat-value">{stats.interested}</div>
                                    <div className="stat-label">관심책</div>
                                </div>
                            </div>

                            {/* 추천 섹션 */}
                            {recommendations.length > 0 && (
                                <div className="section">
                                    <div className="section-header">
                                        <div className="section-title">
                                            <span>우람이를 위한 추천</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                localStorage.removeItem('todayRecommendations');
                                                loadTodayRecommendations(true);
                                            }}
                                            disabled={recommendationsLoading}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: recommendationsLoading ? '#ccc' : 'white',
                                                border: '1px solid #E5E5E5',
                                                borderRadius: '20px',
                                                color: '#8B7EC8',
                                                fontSize: '0.85rem',
                                                cursor: recommendationsLoading ? 'not-allowed' : 'pointer',
                                                opacity: recommendationsLoading ? 0.6 : 1
                                            }}
                                        >
                                            {recommendationsLoading ? '로딩 중...' : '새로고침'}
                                        </button>
                                    </div>
                                    <p className="section-subtitle">
                                        읽기 관심사와 좋아하는 책을 기반으로 추천합니다
                                    </p>
                                    <div 
                                        className="horizontal-scroll"
                                        style={{
                                        display: 'flex',
                                        overflowX: 'auto',
                                        overflowY: 'visible',
                                        gap: '1rem',
                                        paddingTop: '0.5rem',
                                        paddingBottom: '1rem',
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: '#FFB6C1 #f5f5f5',
                                        WebkitOverflowScrolling: 'touch'
                                    }}>
                                        {recommendations.map(item => (
                                            <div 
                                                key={item.book.id}
                                                style={{
                                                    minWidth: '250px',
                                                    maxWidth: '250px'
                                                }}
                                            >
                                                <div 
                                                    onClick={() => selectBook(item.book)}
                                                    style={{
                                                        background: 'white',
                                                        borderRadius: '15px',
                                                        padding: '1.5rem',
                                                        border: '2px solid #FFB6C1',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-5px)';
                                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
                                                    }}
                                                >
                                                    {item.book.fields['표지이미지'] && (
                                                        <div style={{
                                                            width: '100%',
                                                            height: '180px',
                                                            marginBottom: '1rem',
                                                            borderRadius: '10px',
                                                            overflow: 'hidden',
                                                            background: '#f5f5f5'
                                                        }}>
                                                            <img 
                                                                src={item.book.fields['표지이미지']} 
                                                                alt=""
                                                                aria-hidden="true"
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'cover'
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    
                                                    <h3 style={{
                                                        fontSize: '1.1rem',
                                                        color: '#333',
                                                        marginBottom: '0.5rem',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {item.book.fields['제목']}
                                                    </h3>
                                                    
                                                    <p style={{ 
                                                        fontSize: '0.85rem', 
                                                        color: '#666',
                                                        marginBottom: '0.5rem'
                                                    }}>
                                                        {item.book.fields['저자']}
                                                    </p>
                                                    
                                                    <p style={{ 
                                                        fontSize: '0.8rem', 
                                                        color: '#999',
                                                        marginBottom: '1rem'
                                                    }}>
                                                        {item.book.fields['출판사']}
                                                    </p>
                                                    
                                                    {/* 우리아이에게 추천하는 이유 */}
                                                    {item.recommendationReason && (
                                                        <div style={{
                                                            padding: '0.75rem',
                                                            background: '#F5F5F5',
                                                            borderRadius: '10px',
                                                            fontSize: '0.85rem',
                                                            color: '#333',
                                                            lineHeight: '1.5'
                                                        }}>
                                                            <div className="recommendation-label" style={{
                                                                fontSize: '0.75rem',
                                                                color: '#666',
                                                                fontWeight: '600',
                                                                marginBottom: '0.5rem'
                                                            }}>
                                                                <AppIcon name="sparkle" size={15} />
                                                                <span>우리아이에게 추천하는 이유</span>
                                                            </div>
                                                            <div>
                                                                {item.recommendationReason}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (await confirmAction('이 책을 추천 목록에서 빼드릴게요. 괜찮으세요?')) {
                                                                skipDbBook(item.book.id);
                                                            }
                                                        }}
                                                        style={{
                                                            marginTop: '0.75rem',
                                                            width: '100%',
                                                            padding: '0.4rem 0',
                                                            background: 'transparent',
                                                            border: '1px solid #ddd',
                                                            borderRadius: '8px',
                                                            color: '#aaa',
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        안 볼래요
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 신간 섹션 */}
                            {aladinNewBooks.length > 0 && (
                                <div className="section">
                                    <div className="section-header">
                                        <div className="section-title">
                                            <span>신간</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                localStorage.removeItem('today_recommend_cache');
                                                loadAladinNewBooks(true);
                                            }}
                                            disabled={aladinLoading}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: aladinLoading ? '#ccc' : 'white',
                                                border: '1px solid #E5E5E5',
                                                borderRadius: '20px',
                                                color: '#8B7EC8',
                                                fontSize: '0.85rem',
                                                cursor: aladinLoading ? 'not-allowed' : 'pointer',
                                                opacity: aladinLoading ? 0.6 : 1
                                            }}
                                        >
                                            {aladinLoading ? '로딩 중...' : '새로고침'}
                                        </button>
                                    </div>
                                    <p className="section-subtitle">
                                        새로 추가된 신선한 이야기들 · {(() => {
                                            try {
                                                const cached = localStorage.getItem('today_recommend_cache');
                                                if (cached) {
                                                    const { date } = JSON.parse(cached);
                                                    if (date) {
                                                        const [year, month] = date.split('-');
                                                        return `${year}년 ${parseInt(month)}월 업데이트`;
                                                    }
                                                }
                                            } catch (e) {}
                                            return '';
                                        })()}
                                    </p>
                                    <div 
                                        className="horizontal-scroll"
                                        style={{
                                        display: 'flex',
                                        overflowX: 'auto',
                                        overflowY: 'visible',
                                        gap: '1rem',
                                        paddingTop: '0.5rem',
                                        paddingBottom: '1rem',
                                        scrollbarWidth: 'thin',
                                        scrollbarColor: '#FFB6C1 #f5f5f5',
                                        WebkitOverflowScrolling: 'touch'
                                    }}>
                                        {aladinNewBooks.map((book, idx) => (
                                            <div 
                                                key={book.isbn || idx}
                                                style={{
                                                    minWidth: '250px',
                                                    maxWidth: '250px'
                                                }}
                                            >
                                                <div 
                                                    onClick={() => setSelectedAladinBook(book)}
                                                    style={{
                                                        background: 'white',
                                                        borderRadius: '15px',
                                                        padding: '1.5rem',
                                                        border: '2px solid #98D8C8',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                                                        position: 'relative',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(-5px)';
                                                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.transform = 'translateY(0)';
                                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
                                                    }}
                                                >
                                                    <button
                                                        aria-label={`${book.title} 추천에서 제외`}
                                                        title="이 추천 숨기기"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (await confirmAction('이 책을 신간 추천에서 제외할까요?')) {
                                                                excludeAladinBook(book, 'user_excluded');
                                                            }
                                                        }}
                                                        style={{
                                                            position: 'absolute',
                                                            top: '0.5rem',
                                                            left: '0.5rem',
                                                            background: '#FFE4E1',
                                                            color: '#FF69B4',
                                                            border: 'none',
                                                            padding: '0.25rem 0.5rem',
                                                            borderRadius: '20px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 'bold',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        추천 제외
                                                    </button>
                                                    {' '}
                                                    <span style={{
                                                        position: 'absolute',
                                                        top: '0.5rem',
                                                        right: '0.5rem',
                                                        background: '#98D8C8',
                                                        color: 'white',
                                                        padding: '0.25rem 0.5rem',
                                                        borderRadius: '20px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        NEW
                                                    </span>
                                                    
                                                    {book.cover && (
                                                        <div style={{
                                                            width: '100%',
                                                            height: '180px',
                                                            marginBottom: '1rem',
                                                            borderRadius: '10px',
                                                            overflow: 'hidden',
                                                            background: '#f5f5f5'
                                                        }}>
                                                            <img 
                                                                src={book.cover} 
                                                                alt=""
                                                                aria-hidden="true"
                                                                style={{
                                                                    width: '100%',
                                                                    height: '100%',
                                                                    objectFit: 'cover'
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                    
                                                    <h3 style={{
                                                        fontSize: '1.1rem',
                                                        color: '#333',
                                                        marginBottom: '0.5rem',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {book.title}
                                                    </h3>
                                                    
                                                    <p style={{ 
                                                        fontSize: '0.85rem', 
                                                        color: '#666',
                                                        marginBottom: '0.5rem'
                                                    }}>
                                                        {book.author}
                                                    </p>
                                                    
                                                    <p style={{ 
                                                        fontSize: '0.8rem', 
                                                        color: '#999'
                                                    }}>
                                                        {book.publisher} · {book.pubDate ? book.pubDate.substring(0, 4) : ''}
                                                    </p>
                                                    
                                                    {/* 우리아이에게 추천하는 이유 */}
                                                    <div style={{
                                                        marginTop: '1rem',
                                                        padding: '0.75rem',
                                                        background: '#F5F5F5',
                                                        borderRadius: '10px',
                                                        fontSize: '0.85rem',
                                                        color: '#333',
                                                        lineHeight: '1.5'
                                                    }}>
                                                        <div className="recommendation-label" style={{
                                                            fontSize: '0.75rem',
                                                            color: '#666',
                                                            fontWeight: '600',
                                                            marginBottom: '0.5rem'
                                                        }}>
                                                            <AppIcon name="sparkle" size={15} />
                                                            <span>우리아이에게 추천하는 이유</span>
                                                        </div>
                                                        <div>
                                                            {book.recommendationReason || '이 책의 추천 이유를 준비하고 있어요.'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 읽고 있는 책 - 제거됨 */}
                            {false && (
                                <Section
                                    title="📖 읽고 있는 책"
                                    subtitle={`${currentlyReading.length}권`}
                                >
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                                        gap: '1rem'
                                    }}>
                                        {currentlyReading.map(book => {
                                            const log = readingLogs.find(l => l.fields['책']?.[0] === book.id);
                                            return (
                                                <BookCard
                                                    key={book.id}
                                                    book={book}
                                                    log={log}
                                                    onClick={() => selectBook(book)}
                                                    compact
                                                />
                                            );
                                        })}
                                    </div>
                                </Section>
                            )}

                            </>
                            )}
                        </div>
                    )}

                    {/* 전집 보기 */}
                    {currentView === 'collection' && (
                        <CollectionView
                            collections={collections}
                            books={books}
                            onBack={() => goHome()}
                            onSelectBook={selectBook}
                        />
                    )}

                    {/* 테마 보기 */}
                    {currentView === 'theme' && selectedTheme && (
                        <ThemeView
                            theme={selectedTheme}
                            books={books.filter(b => b.fields['테마']?.includes(selectedTheme))}
                            onBack={() => goHome()}
                            onSelectBook={selectBook}
                        />
                    )}

                    {/* 전체 보기 */}
                    {currentView === 'all' && (
                        <AllBooksView
                            books={books}
                            readingLogs={readingLogs}
                            onBack={() => goHome()}
                            onSelectBook={selectBook}
                        />
                    )}

                    {/* 필터 보기 (읽음, 최애, 관심 있는 책) */}
                    {currentView === 'filter' && filterType && (
                        <FilterView
                            filterType={filterType}
                            books={books}
                            readingLogs={readingLogs}
                            childAgeMonths={effectiveAgeMonths}
                            onBack={() => {
                                goHome();
                                setFilterType(null);
                            }}
                            onSelectBook={selectBook}
                            setShowSearchModal={setShowSearchModal}
                            setShowReadPhotoModal={setShowReadPhotoModal}
                            onDataUpdate={loadData}
                        />
                    )}

                    {/* 책 추가 모달 */}
                    {showAddForm && (
                        <AddBookModal
                            childAgeMonths={effectiveAgeMonths}
                            onClose={() => setShowAddForm(false)}
                            onAdd={async (title, author) => {
                                // 책이 이미 추가되었으므로 새로고침만
                                await loadData(); // 새로고침
                                setShowAddForm(false);
                            }}
                        />
                    )}

                    {/* 책등 사진으로 읽은 책 등록 */}
                    {showReadPhotoModal && (
                        <ReadBooksPhotoModal
                            childAgeMonths={effectiveAgeMonths}
                            onClose={() => setShowReadPhotoModal(false)}
                            onComplete={async () => {
                                await loadData();
                                setShowReadPhotoModal(false);
                            }}
                        />
                    )}

                    {/* 검색 모달 */}
                    {showSearchModal && (
                        <div className="clay-modal-overlay" style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.5)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 1000,
                            padding: '1rem'
                        }}
                        onClick={() => {
                            stopSearchCamera();
                            setSearchScanOpen(false);
                            setSearchScanImage(null);
                            setSearchScanMessage('');
                            setShowSearchModal(false);
                        }}
                        >
                            <div
                                className="clay-modal-panel clay-modal-panel-search"
                                style={{
                                    background: 'white',
                                    borderRadius: '20px',
                                    padding: '2rem',
                                    maxWidth: '600px',
                                    width: '100%',
                                    maxHeight: '80vh',
                                    overflow: 'auto'
                                }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h2 className="modal-title" style={{ marginBottom: '1.5rem', color: '#FF69B4' }}>
                                    <span className="modal-title-mark"><AppIcon name="search" size={20} /></span>
                                    <span>책 검색하기</span>
                                </h2>
                                {!searchScanOpen ? (
                                    <button
                                        onClick={handleSearchScanStart}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            marginBottom: '1rem',
                                            background: '#98D8C8',
                                            border: 'none',
                                            borderRadius: '10px',
                                            color: 'white',
                                            fontSize: '1rem',
                                            fontWeight: 'bold',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <AppIcon name="camera" size={17} />
                                        <span>바코드로 검색</span>
                                    </button>
                                ) : (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{
                                            width: '100%',
                                            maxWidth: '400px',
                                            height: '220px',
                                            margin: '0 auto',
                                            borderRadius: '10px',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            background: '#000'
                                        }}>
                                            {searchScanImage ? (
                                                <img
                                                    src={searchScanImage}
                                                    alt="captured barcode"
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover'
                                                    }}
                                                />
                                            ) : (
                                                <video
                                                    ref={searchVideoRef}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover'
                                                    }}
                                                    playsInline
                                                    muted
                                                    onLoadedMetadata={() => setSearchScanReady(true)}
                                                ></video>
                                            )}
                                            <canvas ref={searchCanvasRef} style={{ display: 'none' }}></canvas>
                                        </div>
                                        <p style={{ 
                                            textAlign: 'center', 
                                            color: '#666', 
                                            fontSize: '0.9rem',
                                            marginTop: '0.5rem',
                                            marginBottom: '0.5rem'
                                        }}>
                                            {searchScanDecoding
                                                ? '바코드 분석 중...'
                                                : (searchScanMessage
                                                    ? searchScanMessage
                                                    : (searchScanImage
                                                        ? '사진이 찍혔습니다. 인식 실패 시 다시 찍어주세요.'
                                                        : (searchScanReady ? '바코드를 화면 중앙에 맞춘 뒤 사진을 찍어주세요' : '카메라 준비 중...')))}
                                        </p>
                                        {searchScanImage ? (
                                            <button
                                                onClick={handleSearchScanRetry}
                                                disabled={searchScanDecoding}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    background: searchScanDecoding ? '#ccc' : '#98D8C8',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    color: 'white',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    cursor: searchScanDecoding ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <AppIcon name="camera" size={17} />
                                                <span>다시 찍기</span>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSearchCapture}
                                                disabled={searchScanDecoding || !searchScanReady}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    background: (searchScanDecoding || !searchScanReady) ? '#ccc' : '#98D8C8',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    color: 'white',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    cursor: (searchScanDecoding || !searchScanReady) ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <AppIcon name="camera" size={17} />
                                                <span>사진 찍기</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                stopSearchCamera();
                                                setSearchScanOpen(false);
                                                setSearchScanImage(null);
                                                setSearchScanMessage('');
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                marginTop: '0.5rem',
                                                background: '#f0f0f0',
                                                border: 'none',
                                                borderRadius: '10px',
                                                color: '#666',
                                                fontSize: '0.95rem',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            닫기
                                        </button>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && searchAladinBooks(searchQuery)}
                                        placeholder="책 제목을 입력하세요"
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            fontSize: '1rem',
                                            border: '2px solid #ddd',
                                            borderRadius: '10px'
                                        }}
                                    />
                                    <button
                                        onClick={() => searchAladinBooks(searchQuery)}
                                        disabled={searchLoading}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            background: searchLoading ? '#ccc' : '#FF69B4',
                                            border: 'none',
                                            borderRadius: '10px',
                                            color: 'white',
                                            fontSize: '1rem',
                                            fontWeight: 'bold',
                                            cursor: searchLoading ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {searchLoading ? '검색 중...' : '검색'}
                                    </button>
                                </div>
                                
                                {searchLoading && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#FF69B4' }}>
                                        검색 중...
                                    </div>
                                )}
                                
                                {!searchLoading && searchResults.length === 0 && searchQuery && (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                                        검색 결과가 없습니다
                                    </div>
                                )}
                                
                                {searchResults.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {searchResults.map(book => (
                                            <div key={book.isbn} style={{
                                                display: 'flex',
                                                gap: '1rem',
                                                padding: '1rem',
                                                border: '1px solid #eee',
                                                borderRadius: '10px'
                                            }}>
                                                <img 
                                                    src={book.cover} 
                                                    alt={book.title}
                                                    style={{
                                                        width: '80px',
                                                        height: '120px',
                                                        objectFit: 'cover',
                                                        borderRadius: '8px'
                                                    }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <h4 style={{ marginBottom: '0.5rem' }}>{book.title}</h4>
                                                    <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                                                        {book.author} | {book.publisher}
                                                    </p>
                                                    <button
                                                        onClick={() => addInterestedBook(book)}
                                                        style={{
                                                            padding: '0.5rem 1rem',
                                                            background: '#DDA0DD',
                                                            border: 'none',
                                                            borderRadius: '8px',
                                                            color: 'white',
                                                            fontSize: '0.9rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        <AppIcon name="heart" size={16} />
                                                        <span>관심 있는 책 추가</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <button className="modal-secondary-button"
                                    onClick={() => {
                                        stopSearchCamera();
                                        setSearchScanOpen(false);
                                        setSearchScanImage(null);
                                        setSearchScanMessage('');
                                        setShowSearchModal(false);
                                        setSearchQuery('');
                                        setSearchResults([]);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        marginTop: '1.5rem',
                                        background: 'white',
                                        border: '2px solid #FFB6C1',
                                        borderRadius: '10px',
                                        color: '#FF69B4',
                                        fontSize: '1rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 책 상세 모달 */}
                    {selectedBook && (
                        <BookDetailModal
                            book={selectedBook}
                            log={readingLogs.find(l => l.fields['책']?.[0] === selectedBook.id)}
                            onClose={closeBook}
                            updateReadingLog={updateReadingLog}
                            onDataUpdate={loadData}
                        />
                    )}

                    {/* 알라딘 신간 모달 */}
                    {selectedAladinBook && (
                        <AladinBookModal
                            book={selectedAladinBook}
                            onClose={() => setSelectedAladinBook(null)}
                            onAdd={async () => {
                                try {
                                    const response = await fetch('/api/add-interested-book', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            isbn: selectedAladinBook.isbn,
                                            childAgeMonths: effectiveAgeMonths
                                        })
                                    });
                                    
                                    const data = await response.json();
                                    
                                    if (data.success) {
                                        notify(data.isNew ? '새 책이 추가되었습니다!' : '이미 등록된 책입니다!');
                                        // 데이터 새로고침 (books 배열 업데이트) - 강제 새로고침
                                        setLoading(true);
                                        await loadData();
                                        setLoading(false);
                                        // 검색 결과도 새로고침을 위해 모달 닫기
                                        setSelectedAladinBook(null);
                                        // 검색어가 있으면 검색 결과도 업데이트
                                        if (searchTerm) {
                                            // 검색 결과 자동 업데이트를 위해 약간의 지연
                                            setTimeout(() => {
                                                console.log('📚 책 추가 후 검색 결과 업데이트');
                                            }, 500);
                                        }
                                    } else {
                                        notify('오류: ' + data.error);
                                    }
                                } catch (error) {
                                    console.error('책 추가 오류:', error);
                                    notify('책 추가 중 오류가 발생했습니다');
                                }
                            }}
                            onAddToInterested={async () => {
                                try {
                                    // Airtable에서 책 찾기
                                    const booksData = await fetchAirtable(CONFIG.BOOKS_TABLE);
                                    const existingBook = booksData.find(b => 
                                        (b.fields['ISBN'] && selectedAladinBook.isbn && b.fields['ISBN'] === selectedAladinBook.isbn) ||
                                        (b.fields['제목'] && selectedAladinBook.title && b.fields['제목'] === selectedAladinBook.title)
                                    );
                                    
                                    if (existingBook) {
                                        // 이미 있는 책이면 관심 필드만 업데이트
                                        const response = await fetch('/api/update-book-field', {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                recordId: existingBook.id,
                                                fields: {
                                                    '관심': true
                                                }
                                            })
                                        });
                                        
                                        const data = await response.json();
                                        if (data.success) {
                                            notify('관심책에 추가되었습니다!');
                                            await loadData();
                                            setSelectedAladinBook(null);
                                        } else {
                                            notify('오류: ' + (data.error || '저장 실패'));
                                        }
                                    } else {
                                        notify('먼저 "책 추가하기"를 눌러 책을 등록해주세요.');
                                    }
                                } catch (error) {
                                    console.error('관심책 추가 오류:', error);
                                    notify('관심책 추가 중 오류가 발생했습니다');
                                }
                            }}
                        />
                    )}

                    {/* 설정 페이지 */}
                    {currentView === 'settings' && (
                        <SettingsView
                            profile={childProfile}
                            onSave={saveChildProfile}
                            selectedInterests={selectedInterests}
                            onChangeInterests={setSelectedInterests}
                        />
                    )}
                    </div>
                </div>
            );
        }

        // 📖 알라딘 API로 책 정보 검색 (JSONP 방식)
        async function searchAladinBook(title) {
            return new Promise((resolve) => {
                try {
                    // JSONP 콜백 함수명
                    const callbackName = 'aladinCallback_' + Date.now();
                    
                    // 글로벌 콜백 등록
                    window[callbackName] = (data) => {
                        delete window[callbackName];
                        document.body.removeChild(script);
                        
                        if (data.item && data.item.length > 0) {
                            const book = data.item[0];
                            resolve({
                                found: true,
                                저자: book.author || '',
                                출판사: book.publisher || '',
                                발행년: book.pubDate ? parseInt(book.pubDate.substring(0, 4)) : null,
                                표지이미지: book.cover || '',
                                ISBN: book.isbn13 || book.isbn || '',
                                설명: book.description || ''
                            });
                        } else {
                            resolve({ found: false });
                        }
                    };
                    
                    // JSONP 스크립트 생성
                    const script = document.createElement('script');
                    script.src = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${CONFIG.ALADIN_API_KEY}&Query=${encodeURIComponent(title)}&QueryType=Title&MaxResults=3&start=1&SearchTarget=Book&output=js&Version=20131101&Cover=Big&callback=${callbackName}`;
                    
                    script.onerror = () => {
                        delete window[callbackName];
                        document.body.removeChild(script);
                        resolve({ found: false });
                    };
                    
                    document.body.appendChild(script);
                    
                    // 타임아웃
                    setTimeout(() => {
                        if (window[callbackName]) {
                            delete window[callbackName];
                            if (document.body.contains(script)) {
                                document.body.removeChild(script);
                            }
                            resolve({ found: false });
                        }
                    }, 10000);
                    
                } catch (error) {
                    console.error('알라딘 API 오류:', error);
                    resolve({ found: false });
                }
            });
        }

        // 📚 알라딘 API + AI로 책 정보 생성 및 Airtable 추가
        async function generateBookData(title, author = '', childAgeMonths = '') {
            try {
                console.log('📖 책 정보 생성 중...');
                
                const response = await fetch('/api/ai-generate-book', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ title, author, childAgeMonths })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || '책 추가 실패');
                }

                const result = await response.json();
                
                if (result.success) {
                    const successMsg = result.aladinData?.found 
                        ? '✅ 알라딘에서 정보를 찾아 책을 추가했어요!' 
                        : '✅ AI가 책 정보를 생성해 추가했어요!';
                    notify(successMsg);
                    return true;
                } else {
                    notify('❌ 추가 실패');
                    return false;
                }

            } catch (error) {
                console.error('책 추가 오류:', error);
                notify('❌ 오류 발생: ' + error.message);
                return false;
            }
        }

        function AddBookModal({ onClose, onAdd, childAgeMonths }) {
            const [title, setTitle] = useState('');
            const [searchResults, setSearchResults] = useState([]);
            const [selectedBook, setSelectedBook] = useState(null);
            const [loading, setLoading] = useState(false);
            const [searching, setSearching] = useState(false);
            const [scanning, setScanning] = useState(false);
            const [isDecoding, setIsDecoding] = useState(false);
            const [isCameraReady, setIsCameraReady] = useState(false);
            const [capturedImage, setCapturedImage] = useState(null);
            const [scanMessage, setScanMessage] = useState('');
            const videoRef = useRef(null);
            const canvasRef = useRef(null);
            const streamRef = useRef(null);

            const handleSearch = async () => {
                if (!title.trim()) {
                    notify('책 제목을 입력해주세요!');
                    return;
                }
                
                setSearching(true);
                try {
                    const response = await fetch(`/api/aladin-search?query=${encodeURIComponent(title.trim())}`);
                    const data = await response.json();
                    
                    if (data.success && data.books && data.books.length > 0) {
                        setSearchResults(data.books);
                    } else {
                        notify('검색 결과가 없습니다. 다른 제목으로 검색해보세요.');
                        setSearchResults([]);
                    }
                } catch (error) {
                    console.error('검색 오류:', error);
                    notify('검색 중 오류가 발생했습니다');
                } finally {
                    setSearching(false);
                }
            };

            const stopCamera = () => {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach((track) => track.stop());
                    streamRef.current = null;
                }
                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                }
                setIsCameraReady(false);
            };

            const startCamera = () => {
                setIsCameraReady(false);
                setIsDecoding(false);
                setCapturedImage(null);
                setScanMessage('');

                navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false
                }).then((stream) => {
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        videoRef.current.play();
                    }
                }).catch((error) => {
                    console.error('카메라 접근 오류:', error);
                    notify('카메라 접근 권한이 필요합니다. 브라우저 설정에서 카메라 권한을 허용해주세요.');
                    setScanning(false);
                });
            };

            // 바코드 사진 촬영 시작
            const handleStartScan = () => {
                if (!window.Quagga) {
                    notify('바코드 스캐너 라이브러리를 불러올 수 없습니다. 페이지를 새로고침해주세요.');
                    return;
                }

                setScanning(true);
                startCamera();
            };

            const handleCancelScan = () => {
                stopCamera();
                setScanning(false);
                setIsDecoding(false);
                setCapturedImage(null);
                setScanMessage('');
            };

            const handleCapturePhoto = () => {
                if (!videoRef.current || !canvasRef.current) {
                    return;
                }

                const video = videoRef.current;
                const canvas = canvasRef.current;
                if (!video.videoWidth || !video.videoHeight) {
                    notify('카메라 준비 중입니다. 잠시 후 다시 시도해주세요.');
                    return;
                }
                const width = video.videoWidth;
                const height = video.videoHeight;
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/png');
                setCapturedImage(dataUrl);
                setScanMessage('');
                stopCamera();
                setIsDecoding(true);

                const tryDecode = (size) => new Promise((resolve) => {
                    Quagga.decodeSingle({
                        src: dataUrl,
                        numOfWorkers: 0,
                        inputStream: { size, singleChannel: false },
                        locator: { patchSize: "medium", halfSample: true },
                        decoder: {
                            readers: [
                                "ean_reader",
                                "ean_8_reader",
                                "upc_reader",
                                "upc_e_reader",
                                "code_128_reader"
                            ]
                        },
                        locate: true
                    }, (result) => resolve(result));
                });

                const attempt = async () => {
                    const sizes = [2000, 1600, 1200, 800];
                    for (const size of sizes) {
                        const result = await tryDecode(size);
                        if (result && result.codeResult && result.codeResult.code) {
                            return result.codeResult.code;
                        }
                    }
                    return null;
                };

                attempt().then((code) => {
                    setIsDecoding(false);
                    if (code) {
                        const isbn = code.replace(/[^0-9X]/g, '');
                        if (isbn.length === 10 || isbn.length === 13) {
                            stopCamera();
                            setScanning(false);
                            handleBarcodeScanned(isbn);
                            return;
                        }
                        setScanMessage('올바른 ISBN 바코드를 인식하지 못했습니다. 다시 찍어주세요.');
                    } else {
                        setScanMessage('인식 실패: 더 가까이/밝은 곳에서 다시 찍어주세요.');
                    }
                });
            };

            // 바코드로 스캔한 ISBN으로 책 검색
            const handleBarcodeScanned = async (isbn) => {
                setScanning(false);
                
                setSearching(true);
                try {
                    // ISBN으로 직접 책 정보 가져오기
                    const response = await fetch(`/api/aladin-search?query=${encodeURIComponent(isbn)}&isbn=true`);
                    const data = await response.json();
                    
                    if (data.success && data.books && data.books.length > 0) {
                        // 첫 번째 결과를 자동으로 선택
                        setSelectedBook(data.books[0]);
                        setSearchResults(data.books);
                    } else {
                        notify('스캔한 ISBN으로 책을 찾을 수 없습니다. 수동으로 검색해주세요.');
                        setTitle(isbn);
                    }
                } catch (error) {
                    console.error('ISBN 검색 오류:', error);
                    notify('책 검색 중 오류가 발생했습니다.');
                } finally {
                    setSearching(false);
                }
            };

            // 컴포넌트 언마운트 시 카메라 정리
            useEffect(() => {
                return () => {
                    stopCamera();
                };
            }, []);

            // 모달 닫기 핸들러 (스캐너 정리 포함)
            const handleClose = async () => {
                handleCancelScan();
                onClose();
            };

            const handleConfirm = async () => {
                if (!selectedBook) return;
                
                setLoading(true);
                try {
                    // ISBN으로 책 추가
                    const response = await fetch('/api/add-interested-book', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ isbn: selectedBook.isbn, childAgeMonths })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        await onAdd(selectedBook.title, selectedBook.author);
                    } else {
                        notify('오류: ' + data.error);
                    }
                } catch (error) {
                    console.error('책 추가 오류:', error);
                    notify('책 추가 중 오류가 발생했습니다');
                } finally {
                    setLoading(false);
                }
            };

            return (
                <div className="clay-modal-overlay" onClick={onClose} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="clay-modal-panel clay-modal-panel-add" onClick={(e) => e.stopPropagation()} style={{
                        background: 'white',
                        borderRadius: '20px',
                        padding: '2rem',
                        maxWidth: '500px',
                        width: '100%',
                        position: 'relative'
                    }}>
                        {(isDecoding || searching) && (
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(255,255,255,0.85)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '20px',
                                zIndex: 1
                            }}>
                                <div style={{ textAlign: 'center', color: '#666', fontSize: '0.95rem' }}>
                                    {isDecoding ? '바코드 분석 중...' : '책 정보를 찾는 중...'}
                                </div>
                            </div>
                        )}
                        <h2 className="modal-title" style={{ fontSize: '1.8rem', color: '#FF69B4', marginBottom: '1rem' }}>
                            <span className="modal-title-mark"><AppIcon name="plus" size={20} /></span>
                            <span>새 책 추가</span>
                        </h2>
                        
                        {!selectedBook ? (
                            <>
                                <p style={{ color: '#666', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                                    책 제목을 입력하거나 바코드를 스캔하여 책을 추가하세요.
                                </p>

                                {!scanning ? (
                                    <button className="modal-secondary-button modal-accent-button"
                                        onClick={handleStartScan}
                                        disabled={searching || loading}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            background: searching || loading ? '#ccc' : '#98D8C8',
                                            border: 'none',
                                            borderRadius: '10px',
                                            color: 'white',
                                            fontSize: '1rem',
                                            fontWeight: 'bold',
                                            cursor: searching || loading ? 'not-allowed' : 'pointer',
                                            marginBottom: '1rem'
                                        }}
                                    >
                                        <AppIcon name="camera" size={17} />
                                        <span>바코드 사진 찍기</span>
                                    </button>
                                ) : (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <div style={{
                                            width: '100%',
                                            maxWidth: '400px',
                                            height: '240px',
                                            margin: '0 auto',
                                            borderRadius: '10px',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            background: '#000'
                                        }}>
                                            {capturedImage ? (
                                                <img
                                                    src={capturedImage}
                                                    alt="captured barcode"
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover'
                                                    }}
                                                />
                                            ) : (
                                                <video
                                                    ref={videoRef}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'cover'
                                                    }}
                                                    playsInline
                                                    muted
                                                    onLoadedMetadata={() => setIsCameraReady(true)}
                                                ></video>
                                            )}
                                            <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                                        </div>
                                        <p style={{ 
                                            textAlign: 'center', 
                                            color: '#666', 
                                            fontSize: '0.9rem',
                                            marginTop: '0.5rem',
                                            marginBottom: '0.5rem'
                                        }}>
                                            {isDecoding
                                                ? '사진을 분석 중입니다...'
                                                : (scanMessage
                                                    ? scanMessage
                                                    : (capturedImage
                                                        ? '사진이 찍혔습니다. 인식 실패 시 다시 찍어주세요.'
                                                        : (isCameraReady ? '바코드를 화면 중앙에 맞춘 뒤 사진을 찍어주세요' : '카메라 준비 중...')))}
                                        </p>
                                        {capturedImage ? (
                                            <button className="modal-secondary-button modal-accent-button"
                                                onClick={startCamera}
                                                disabled={isDecoding}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    background: isDecoding ? '#ccc' : '#98D8C8',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    color: 'white',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    cursor: isDecoding ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <AppIcon name="camera" size={17} />
                                                <span>다시 찍기</span>
                                            </button>
                                        ) : (
                                            <button className="modal-secondary-button modal-accent-button"
                                                onClick={handleCapturePhoto}
                                                disabled={isDecoding || !isCameraReady}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.75rem',
                                                    background: (isDecoding || !isCameraReady) ? '#ccc' : '#98D8C8',
                                                    border: 'none',
                                                    borderRadius: '10px',
                                                    color: 'white',
                                                    fontSize: '1rem',
                                                    fontWeight: 'bold',
                                                    cursor: (isDecoding || !isCameraReady) ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <AppIcon name="camera" size={17} />
                                                <span>사진 찍기</span>
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <input
                                        type="text"
                                        placeholder="책 제목 *"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && !searching && handleSearch()}
                                        disabled={searching || loading}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            border: '2px solid #FFB6C1',
                                            borderRadius: '10px',
                                            fontSize: '1rem',
                                            outline: 'none'
                                        }}
                                        autoFocus
                                    />
                                    <button className="modal-secondary-button"
                                        onClick={handleSearch}
                                        disabled={searching || !title.trim()}
                                        style={{
                                            padding: '0.75rem 1.5rem',
                                            background: searching || !title.trim() ? '#ccc' : '#FF69B4',
                                            border: 'none',
                                            borderRadius: '10px',
                                            color: 'white',
                                            fontSize: '1rem',
                                            fontWeight: 'bold',
                                            cursor: searching || !title.trim() ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        <AppIcon name="search" size={17} />
                                        <span>{searching ? '검색 중...' : '검색'}</span>
                                    </button>
                                </div>

                                {searchResults.length > 0 && (
                                    <div style={{ 
                                        maxHeight: '300px', 
                                        overflowY: 'auto',
                                        marginBottom: '1rem',
                                        border: '1px solid #eee',
                                        borderRadius: '10px',
                                        padding: '0.5rem'
                                    }}>
                                        {searchResults.map(book => (
                                            <div
                                                key={book.isbn}
                                                onClick={() => setSelectedBook(book)}
                                                style={{
                                                    display: 'flex',
                                                    gap: '1rem',
                                                    padding: '1rem',
                                                    border: selectedBook?.isbn === book.isbn ? '2px solid #FF69B4' : '1px solid #eee',
                                                    borderRadius: '8px',
                                                    marginBottom: '0.5rem',
                                                    cursor: 'pointer',
                                                    background: selectedBook?.isbn === book.isbn ? '#FFE4E1' : 'white'
                                                }}
                                            >
                                                {book.cover && (
                                                    <img 
                                                        src={book.cover} 
                                                        alt={book.title}
                                                        style={{
                                                            width: '60px',
                                                            height: '90px',
                                                            objectFit: 'cover',
                                                            borderRadius: '6px'
                                                        }}
                                                    />
                                                )}
                                                <div style={{ flex: 1 }}>
                                                    <h4 style={{ marginBottom: '0.25rem', fontSize: '0.95rem' }}>{book.title}</h4>
                                                    <p style={{ fontSize: '0.85rem', color: '#666' }}>
                                                        {book.author} | {book.publisher}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="modal-section-surface" style={{
                                padding: '1rem',
                                background: '#F8F9FA',
                                borderRadius: '10px',
                                marginBottom: '1.5rem'
                            }}>
                                <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>선택한 책:</p>
                                <p style={{ marginBottom: '0.25rem' }}>{selectedBook.title}</p>
                                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                                    {selectedBook.author} | {selectedBook.publisher}
                                </p>
                                <button
                                    onClick={() => setSelectedBook(null)}
                                    style={{
                                        marginTop: '0.5rem',
                                        padding: '0.25rem 0.75rem',
                                        background: 'white',
                                        border: '1px solid #ddd',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    다시 선택
                                </button>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="modal-primary-button"
                                onClick={handleConfirm}
                                disabled={loading || !selectedBook}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    background: loading || !selectedBook ? '#ccc' : '#FF69B4',
                                    border: 'none',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    cursor: loading || !selectedBook ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <AppIcon name="plus" size={17} />
                                <span>{loading ? '추가 중...' : '추가하기'}</span>
                            </button>
                            
                            <button className="modal-secondary-button"
                                onClick={handleClose}
                                disabled={loading}
                                style={{
                                    flex: 1,
                                    padding: '0.75rem',
                                    background: 'white',
                                    border: '2px solid #FFB6C1',
                                    borderRadius: '10px',
                                    color: '#FF69B4',
                                    fontSize: '1rem',
                                    cursor: loading ? 'not-allowed' : 'pointer'
                                }}
                            >
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        function Section({ title, subtitle, children }) {
            return (
                <div style={{
                    marginBottom: '2rem',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '20px',
                    padding: '1.5rem'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <h2 className="display-section-title" style={{ fontSize: '1.5rem', color: '#333', marginBottom: '0.25rem' }}>
                            {title}
                        </h2>
                        {subtitle && (
                            <p style={{ fontSize: '0.9rem', color: '#666' }}>{subtitle}</p>
                        )}
                    </div>
                    {children}
                </div>
            );
        }

        function StatCard({ icon, label, value, color }) {
            return (
                <div style={{
                    background: 'white',
                    borderRadius: '15px',
                    padding: '1.5rem',
                    textAlign: 'center',
                    border: `3px solid ${color}`,
                    transition: 'transform 0.3s',
                    cursor: label !== '전체' ? 'pointer' : 'default'
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-5px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{icon}</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333' }}>{value}</div>
                    <div style={{ fontSize: '0.9rem', color: '#666' }}>{label}</div>
                </div>
            );
        }

        function CollectionCard({ name, count, onClick }) {
            const [hover, setHover] = useState(false);
            
            return (
                <div
                    onClick={onClick}
                    onMouseEnter={() => setHover(true)}
                    onMouseLeave={() => setHover(false)}
                    style={{
                        background: 'white',
                        borderRadius: '15px',
                        padding: '1.5rem',
                        cursor: 'pointer',
                        border: '2px solid #FFB6C1',
                        transition: 'all 0.3s',
                        transform: hover ? 'translateY(-5px)' : 'translateY(0)',
                        boxShadow: hover ? '0 8px 16px rgba(0,0,0,0.1)' : '0 2px 8px rgba(0,0,0,0.05)'
                    }}
                >
                    <h3 style={{
                        fontSize: '1.1rem',
                        color: '#333',
                        marginBottom: '0.5rem'
                    }}>
                        {name}
                    </h3>
                    <p style={{ fontSize: '0.9rem', color: '#FF69B4', fontWeight: 'bold' }}>
                        {count}권
                    </p>
                </div>
            );
        }

        function ReadBooksPhotoModal({ onClose, onComplete, childAgeMonths }) {
            const [images, setImages] = useState([]);
            const [results, setResults] = useState([]);
            const [analyzing, setAnalyzing] = useState(false);
            const [registering, setRegistering] = useState(false);
            const [error, setError] = useState('');
            const [readDate, setReadDate] = useState(() => {
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000;
                return new Date(now.getTime() - offset).toISOString().slice(0, 10);
            });
            const [completedAll, setCompletedAll] = useState(true);
            const [commonReaction, setCommonReaction] = useState('');

            const resizeImage = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
                reader.onload = () => {
                    const image = new Image();
                    image.onerror = () => reject(new Error('지원하지 않는 이미지입니다.'));
                    image.onload = () => {
                        const maxSide = 1800;
                        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                        const canvas = document.createElement('canvas');
                        canvas.width = Math.round(image.width * scale);
                        canvas.height = Math.round(image.height * scale);
                        const context = canvas.getContext('2d');
                        context.drawImage(image, 0, 0, canvas.width, canvas.height);
                        let quality = 0.82;
                        let dataUrl = canvas.toDataURL('image/jpeg', quality);
                        while (dataUrl.length > 1100000 && quality > 0.52) {
                            quality -= 0.1;
                            dataUrl = canvas.toDataURL('image/jpeg', quality);
                        }
                        resolve(dataUrl);
                    };
                    image.src = reader.result;
                };
                reader.readAsDataURL(file);
            });

            const handleFiles = async (event) => {
                const files = Array.from(event.target.files || []).slice(0, 3);
                if (!files.length) return;

                setError('');
                setResults([]);
                try {
                    const resized = [];
                    for (const file of files) {
                        resized.push({ name: file.name, dataUrl: await resizeImage(file) });
                    }
                    setImages(resized);
                } catch (imageError) {
                    setError(imageError.message);
                }
            };

            const analyzePhotos = async () => {
                if (!images.length) return;
                setAnalyzing(true);
                setError('');
                setResults([]);

                try {
                    const response = await fetch('/api/aladin-search', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ images: images.map(image => image.dataUrl) })
                    });
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || '사진 분석에 실패했습니다.');
                    }

                    const recognized = (data.books || []).map((item, index) => ({
                        ...item,
                        id: `${index}-${item.detectedTitle || 'book'}`,
                        selectedCandidate: null,
                        excluded: false,
                        searchOpen: false,
                        manualQuery: item.detectedTitle || '',
                        searching: false
                    }));
                    setResults(recognized);
                    if (!recognized.length) {
                        setError('읽을 수 있는 책 제목을 찾지 못했습니다. 책등이 크게 보이도록 다시 찍어주세요.');
                    }
                } catch (analysisError) {
                    setError(analysisError.message);
                } finally {
                    setAnalyzing(false);
                }
            };

            const updateResult = (id, changes) => {
                setResults(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
            };

            const searchAlternative = async (item) => {
                if (!item.manualQuery.trim()) return;
                updateResult(item.id, { searching: true });
                setError('');
                try {
                    const response = await fetch(`/api/aladin-search?query=${encodeURIComponent(item.manualQuery.trim())}`);
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || '책 검색에 실패했습니다.');
                    }
                    updateResult(item.id, {
                        candidates: data.books || [],
                        selectedCandidate: null,
                        excluded: false,
                        searching: false
                    });
                } catch (searchError) {
                    updateResult(item.id, { searching: false });
                    setError(searchError.message);
                }
            };

            const registerBooks = async () => {
                const selectedBooks = results
                    .filter(item => !item.excluded && Number.isInteger(item.selectedCandidate) && item.candidates?.[item.selectedCandidate])
                    .map(item => item.candidates[item.selectedCandidate]);
                const uniqueBooks = Array.from(new Map(selectedBooks.map(book => [book.isbn, book])).values());

                if (!uniqueBooks.length) {
                    setError('등록할 책을 한 권 이상 선택해주세요.');
                    return;
                }

                setRegistering(true);
                setError('');
                try {
                    const response = await fetch('/api/reading-log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            books: uniqueBooks,
                            childAgeMonths,
                            logDefaults: {
                                completed: completedAll,
                                readDate,
                                childReaction: commonReaction
                            }
                        })
                    });
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        throw new Error(data.error || '읽은 책을 저장하지 못했습니다.');
                    }

                    const existingMessage = data.existingLogCount
                        ? ` 이미 기록된 ${data.existingLogCount}권은 기존 기록을 유지했습니다.`
                        : '';
                    notify(`${data.createdLogCount}권의 읽기 기록을 추가했습니다.${existingMessage}`);
                    await onComplete();
                } catch (registrationError) {
                    setError(registrationError.message);
                } finally {
                    setRegistering(false);
                }
            };

            const busy = analyzing || registering;
            const selectedCount = results.filter(item =>
                !item.excluded && Number.isInteger(item.selectedCandidate) && item.candidates?.[item.selectedCandidate]
            ).length;
            const allReviewed = results.length > 0 && results.every(item =>
                item.excluded || (Number.isInteger(item.selectedCandidate) && item.candidates?.[item.selectedCandidate])
            );

            return (
                <div
                    className="clay-modal-overlay"
                    onClick={() => !busy && onClose()}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1200, padding: '1rem'
                    }}
                >
                    <div
                        className="clay-modal-panel clay-modal-panel-photo"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            background: 'white', borderRadius: '20px', width: '100%', maxWidth: '720px',
                            maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                            <div>
                                <h2 className="modal-title" style={{ color: '#FF69B4', marginBottom: '0.35rem' }}>
                                    <span className="modal-title-mark"><AppIcon name="camera" size={20} /></span>
                                    <span>책등 사진으로 등록</span>
                                </h2>
                                <p style={{ color: '#666', lineHeight: 1.5, fontSize: '0.92rem' }}>
                                    책등이 크게 보이는 사진을 최대 3장까지 올려주세요. 인식 결과를 확인한 뒤 등록합니다.
                                </p>
                            </div>
                            <button className="modal-close-button"
                                onClick={onClose}
                                disabled={busy}
                                aria-label="닫기"
                                style={{ border: 'none', background: 'transparent', fontSize: '1.5rem', cursor: busy ? 'not-allowed' : 'pointer' }}
                            >×</button>
                        </div>

                        <label className="modal-section-surface modal-upload-zone" style={{
                            display: 'block', marginTop: '1.25rem', padding: '1.25rem', textAlign: 'center',
                            border: '2px dashed #98D8C8', borderRadius: '14px', background: '#F3FBF8',
                            color: '#438D7D', fontWeight: 'bold', cursor: busy ? 'not-allowed' : 'pointer'
                        }}>
                            <AppIcon name="camera" size={20} />
                            <span>{images.length ? '다른 사진 선택' : '사진 찍기 또는 앨범에서 선택'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                multiple
                                disabled={busy}
                                onChange={handleFiles}
                                style={{ display: 'none' }}
                            />
                        </label>

                        {images.length > 0 && (
                            <>
                                <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', marginTop: '1rem', paddingBottom: '0.25rem' }}>
                                    {images.map((image, index) => (
                                        <img
                                            key={`${image.name}-${index}`}
                                            src={image.dataUrl}
                                            alt={`책등 사진 ${index + 1}`}
                                            style={{ width: '150px', height: '110px', objectFit: 'cover', borderRadius: '10px', flex: '0 0 auto' }}
                                        />
                                    ))}
                                </div>
                                <button
                                    onClick={analyzePhotos}
                                    disabled={busy}
                                    style={{
                                        width: '100%', padding: '0.8rem', marginTop: '1rem', border: 'none', borderRadius: '10px',
                                        background: busy ? '#ccc' : '#98D8C8', color: 'white', fontWeight: 'bold',
                                        fontSize: '1rem', cursor: busy ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <AppIcon name="search" size={17} />
                                    <span>{analyzing ? '책등을 읽는 중...' : '사진에서 책 찾기'}</span>
                                </button>
                            </>
                        )}

                        {error && (
                            <div style={{ marginTop: '1rem', padding: '0.8rem', borderRadius: '10px', background: '#FFF0F0', color: '#B24A4A' }}>
                                {error}
                            </div>
                        )}

                        {results.length > 0 && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <h3 style={{ marginBottom: '0.35rem' }}>인식 결과 확인</h3>
                                <p style={{ color: '#777', fontSize: '0.88rem', marginBottom: '0.9rem' }}>
                                    사진 인식은 틀릴 수 있어요. 실제 책과 일치하는지 꼭 확인해주세요.
                                </p>
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {results.map(item => {
                                        const hasCandidates = item.candidates?.length > 0;
                                        const confidenceLabel = item.confidence === 'high' ? '확실' : item.confidence === 'medium' ? '확인 필요' : '불확실';
                                        const confidenceColor = item.confidence === 'high' ? '#438D7D' : item.confidence === 'medium' ? '#B26A3D' : '#B24A4A';
                                        return (
                                            <div key={item.id} style={{
                                                border: item.excluded ? '1px solid #DDD' : '2px solid #E5E5E5',
                                                borderRadius: '14px', padding: '1rem', opacity: item.excluded ? 0.68 : 1
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{item.detectedTitle || '제목 판독 실패'}</div>
                                                        <div style={{ color: '#777', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                                                            {item.detectedAuthor || '저자 판독 안 됨'}
                                                            <span style={{ color: confidenceColor, fontWeight: 'bold', marginLeft: '0.5rem' }}>· {confidenceLabel}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => updateResult(item.id, {
                                                            excluded: !item.excluded,
                                                            selectedCandidate: item.excluded ? null : item.selectedCandidate
                                                        })}
                                                        disabled={registering}
                                                        style={{
                                                            flex: '0 0 auto', padding: '0.35rem 0.65rem', border: '1px solid #CCC',
                                                            borderRadius: '8px', background: 'white', color: '#666', cursor: 'pointer'
                                                        }}
                                                    >
                                                        {item.excluded ? '다시 포함' : '이 항목 제외'}
                                                    </button>
                                                </div>

                                                {item.excluded ? (
                                                    <div style={{ marginTop: '0.75rem', color: '#777', fontSize: '0.88rem' }}>이 항목은 등록하지 않습니다.</div>
                                                ) : (
                                                    <>
                                                        {hasCandidates ? (
                                                            <div style={{ display: 'grid', gap: '0.6rem', marginTop: '0.85rem' }}>
                                                                {item.candidates.map((candidate, candidateIndex) => {
                                                                    const selected = item.selectedCandidate === candidateIndex;
                                                                    return (
                                                                        <label
                                                                            key={`${candidate.isbn}-${candidateIndex}`}
                                                                            style={{
                                                                                display: 'flex', gap: '0.75rem', padding: '0.75rem', borderRadius: '10px',
                                                                                border: selected ? '3px solid #FF69B4' : '1px solid #DDD',
                                                                                background: selected ? '#FFF4F8' : 'white', cursor: registering ? 'not-allowed' : 'pointer'
                                                                            }}
                                                                        >
                                                                            <input
                                                                                type="radio"
                                                                                name={`candidate-${item.id}`}
                                                                                checked={selected}
                                                                                disabled={registering}
                                                                                onChange={() => updateResult(item.id, { selectedCandidate: candidateIndex })}
                                                                                style={{ marginTop: '0.2rem' }}
                                                                            />
                                                                            {candidate.cover ? (
                                                                                <img
                                                                                    src={candidate.cover}
                                                                                    alt=""
                                                                                    style={{ width: '54px', height: '78px', objectFit: 'cover', borderRadius: '5px', flex: '0 0 auto' }}
                                                                                />
                                                                            ) : (
                                                                                <div style={{ width: '54px', height: '78px', background: '#EEE', borderRadius: '5px', flex: '0 0 auto' }}></div>
                                                                            )}
                                                                            <div style={{ minWidth: 0 }}>
                                                                                <div style={{ fontWeight: 'bold', lineHeight: 1.35 }}>{candidate.title}</div>
                                                                                <div style={{ color: '#666', fontSize: '0.84rem', marginTop: '0.25rem', lineHeight: 1.45 }}>
                                                                                    {candidate.author || '저자 미상'}<br />
                                                                                    {candidate.publisher || '출판사 미상'}{candidate.pubDate ? ` · ${candidate.pubDate}` : ''}<br />
                                                                                    ISBN {candidate.isbn}
                                                                                </div>
                                                                            </div>
                                                                        </label>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div style={{ color: '#B26A3D', fontSize: '0.88rem', marginTop: '0.75rem' }}>
                                                                일치하는 후보를 찾지 못했습니다. 제목을 직접 검색해주세요.
                                                            </div>
                                                        )}

                                                        <button
                                                            onClick={() => updateResult(item.id, { searchOpen: !item.searchOpen })}
                                                            disabled={registering}
                                                            style={{
                                                                marginTop: '0.75rem', padding: 0, border: 'none', background: 'transparent',
                                                                color: '#8B7EC8', fontWeight: 'bold', cursor: 'pointer'
                                                            }}
                                                        >
                                                            <AppIcon name="search" size={15} />
                                                            <span>{item.searchOpen ? '직접 검색 닫기' : '후보에 없어요 · 직접 검색'}</span>
                                                        </button>
                                                        {item.searchOpen && (
                                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem' }}>
                                                                <input
                                                                    value={item.manualQuery}
                                                                    disabled={item.searching || registering}
                                                                    onChange={(event) => updateResult(item.id, { manualQuery: event.target.value })}
                                                                    onKeyDown={(event) => event.key === 'Enter' && searchAlternative(item)}
                                                                    placeholder="정확한 책 제목"
                                                                    style={{ flex: 1, minWidth: 0, padding: '0.65rem', border: '1px solid #CCC', borderRadius: '8px' }}
                                                                />
                                                                <button
                                                                    onClick={() => searchAlternative(item)}
                                                                    disabled={item.searching || registering || !item.manualQuery.trim()}
                                                                    style={{
                                                                        padding: '0.65rem 0.9rem', border: 'none', borderRadius: '8px',
                                                                        background: item.searching ? '#CCC' : '#8B7EC8', color: 'white', fontWeight: 'bold'
                                                                    }}
                                                                >
                                                                    {item.searching ? '검색 중' : '검색'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="modal-section-surface" style={{ marginTop: '1rem', padding: '1rem', background: '#F8F9FA', borderRadius: '12px' }}>
                                    <h4 style={{ marginBottom: '0.75rem' }}>선택한 책에 적용할 읽기 기록</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                        <label style={{ fontSize: '0.88rem', color: '#555' }}>
                                            읽은 날짜
                                            <input
                                                type="date"
                                                value={readDate}
                                                disabled={registering}
                                                onChange={(event) => setReadDate(event.target.value)}
                                                style={{ display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.6rem', border: '1px solid #CCC', borderRadius: '8px' }}
                                            />
                                        </label>
                                        <label style={{ fontSize: '0.88rem', color: '#555' }}>
                                            공통 아이 반응 · 선택 사항
                                            <select
                                                value={commonReaction}
                                                disabled={registering}
                                                onChange={(event) => setCommonReaction(event.target.value)}
                                                style={{ display: 'block', width: '100%', marginTop: '0.35rem', padding: '0.6rem', border: '1px solid #CCC', borderRadius: '8px' }}
                                            >
                                                <option value="">나중에 입력</option>
                                                {['😍', '😊', '😐', '😢', '🥱'].map(reaction => <option key={reaction} value={reaction}>{reaction}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.8rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={completedAll}
                                            disabled={registering}
                                            onChange={(event) => setCompletedAll(event.target.checked)}
                                        />
                                        모두 끝까지 읽었어요
                                    </label>
                                </div>

                                {!allReviewed && (
                                    <div style={{ color: '#B26A3D', fontSize: '0.88rem', marginTop: '0.8rem' }}>
                                        모든 인식 항목에서 정확한 책을 선택하거나 ‘이 항목 제외’를 눌러주세요.
                                    </div>
                                )}

                                <button
                                    onClick={registerBooks}
                                    disabled={registering || selectedCount === 0 || !allReviewed || !readDate}
                                    style={{
                                        width: '100%', padding: '0.85rem', marginTop: '1rem', border: 'none', borderRadius: '10px',
                                        background: (registering || selectedCount === 0 || !allReviewed || !readDate) ? '#ccc' : '#FF69B4', color: 'white',
                                        fontWeight: 'bold', fontSize: '1rem', cursor: (registering || selectedCount === 0 || !allReviewed || !readDate) ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {registering ? '읽기 기록을 저장하는 중...' : `확인한 ${selectedCount}권을 읽은 책으로 등록`}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        function BookCard({ book, log, onClick, compact }) {
            const isRead = !!log;
            const reaction = log?.fields['아이반응'];
            const coverImage = book.fields['표지이미지'];
            
            return (
                <div
                    className={`library-book-card ${isRead ? 'is-read' : ''} ${compact ? 'is-compact' : ''}`}
                >
                    {isRead && (
                        <div className="library-book-status" title="읽은 책">
                            {reaction || '✅'}
                        </div>
                    )}
                    
                    <div className="library-book-body" onClick={onClick}>
                        {/* 표지 이미지 */}
                        <div className="library-book-cover">
                            {coverImage ? (
                                <img 
                                    src={coverImage} 
                                    alt={book.fields['제목']}
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.parentElement.classList.add('is-empty');
                                    }}
                                />
                            ) : <AppIcon name="brand" size={34} />}
                        </div>
                        
                        <h3 className="library-book-title">
                            {book.fields['제목']}
                        </h3>
                        
                        <p className="library-book-meta">
                            {book.fields['저자']}
                            {book.fields['출판사'] && ` · ${book.fields['출판사']}`}
                        </p>
                        
                        {book.fields['전집명'] && (
                            <p className="library-book-collection">
                                <AppIcon name="library" size={14} /> {book.fields['전집명']}
                            </p>
                        )}
                        
                        {book.fields['테마'] && !compact && (
                            <div className="library-book-tags">
                                {book.fields['테마'].split(',').slice(0, 3).map((tema, idx) => (
                                    <span key={idx}>
                                        {tema.trim()}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        function CollectionView({ collections, books, onBack, onSelectBook }) {
            const [selectedCol, setSelectedCol] = useState(collections[0]?.name);
            const filteredBooks = books.filter(b => b.fields['전집명'] === selectedCol);

            return (
                <div>

                    <h2 className="display-section-title" style={{ fontSize: '2rem', color: '#FF69B4', marginBottom: '1rem' }}>
                        📚 전집 둘러보기
                    </h2>

                    {/* 전집 탭 */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginBottom: '2rem'
                    }}>
                        {collections.map(col => (
                            <button
                                key={col.name}
                                onClick={() => setSelectedCol(col.name)}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: selectedCol === col.name ? '#FF69B4' : 'white',
                                    border: '2px solid #FFB6C1',
                                    borderRadius: '10px',
                                    color: selectedCol === col.name ? 'white' : '#FF69B4',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    fontWeight: selectedCol === col.name ? 'bold' : 'normal'
                                }}
                            >
                                {col.name} ({col.count})
                            </button>
                        ))}
                    </div>

                    {/* 책 그리드 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                        gap: '1.5rem'
                    }}>
                        {filteredBooks.map(book => (
                            <BookCard
                                key={book.id}
                                book={book}
                                onClick={() => onSelectBook(book)}
                            />
                        ))}
                    </div>
                </div>
            );
        }

        function ThemeView({ theme, books, onBack, onSelectBook }) {
            return (
                <div>

                    <h2 className="display-section-title" style={{ fontSize: '2rem', color: '#FF69B4', marginBottom: '1rem' }}>
                        🔍 #{theme} ({books.length}권)
                    </h2>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                        gap: '1.5rem'
                    }}>
                        {books.map(book => (
                            <BookCard
                                key={book.id}
                                book={book}
                                onClick={() => onSelectBook(book)}
                            />
                        ))}
                    </div>
                </div>
            );
        }

        function FilterView({ filterType, books, readingLogs, childAgeMonths, onBack, onSelectBook, setShowSearchModal, setShowReadPhotoModal, onDataUpdate }) {
            const filterInfo = {
                'read': { title: '✅ 읽은 책', icon: '✅', color: '#98D8C8' },
                'loved': { title: '😍 최애 책', icon: '😍', color: '#FFB347' },
                'interested': { title: '💡 관심 있는 책', icon: '💡', color: '#DDA0DD' }
            };
            
            const info = filterInfo[filterType];
            const [searchTerm, setSearchTerm] = useState('');
            const [sortBy, setSortBy] = useState('title');
            
            // 필터링
            let filteredBooks = [];
            if (filterType === 'read') {
                // 읽기 기록이 있는 책만 (관심 여부와 무관)
                filteredBooks = books.filter(book => {
                    // 읽기 기록이 있는지만 확인
                    const log = readingLogs.find(log => log.fields['책']?.[0] === book.id);
                    return !!log; // 읽기 기록이 있으면 표시
                });
            } else if (filterType === 'loved') {
                // 😍 반응이 있는 책만
                filteredBooks = books.filter(book => {
                    const log = readingLogs.find(log => log.fields['책']?.[0] === book.id);
                    return log && log.fields['아이반응'] === '😍';
                });
            } else if (filterType === 'interested') {
                // 관심 있는 책 (관심 필드가 true인 책만, 읽기 기록 여부와 무관)
                filteredBooks = books.filter(book => {
                    // 관심 필드가 true인 책만 표시
                    const isInterested = book.fields['관심'] === true || book.fields['관심'] === 'true';
                    return isInterested; // 관심 필드만 확인, 읽기 기록 여부 무시
                });
            }

            const visibleBooks = filteredBooks
                .filter(book =>
                    !searchTerm ||
                    book.fields['제목']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    book.fields['저자']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    book.fields['테마']?.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .sort((a, b) => {
                    if (sortBy === 'author') return (a.fields['저자'] || '').localeCompare(b.fields['저자'] || '');
                    return (a.fields['제목'] || '').localeCompare(b.fields['제목'] || '');
                });
            
            return (
                <div className="catalog-view">
                    <div className="view-heading">
                        <span className="view-eyebrow">MY BOOK JOURNEY</span>
                        <h2>{info.title.replace(/^\S+\s/, '')}</h2>
                        <p>{filteredBooks.length}권의 책이 이 책장에 담겨 있어요.</p>
                    </div>

                    <div className="catalog-toolbar">
                        <label className="catalog-search-wrap">
                            <AppIcon name="search" size={19} />
                            <input
                                className="catalog-search"
                                type="search"
                                placeholder="제목, 저자, 테마로 검색"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </label>
                        <select className="catalog-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="책 정렬">
                            <option value="title">제목순</option>
                            <option value="author">저자순</option>
                        </select>
                        {filterType === 'read' && (
                            <button className="clay-button clay-button-primary" onClick={() => setShowReadPhotoModal(true)}>
                                <AppIcon name="camera" size={19} />
                                <span>읽은 책 등록</span>
                            </button>
                        )}
                        {filterType === 'interested' && (
                            <button className="clay-button clay-button-primary" onClick={() => setShowSearchModal(true)}>
                                <AppIcon name="plus" size={19} />
                                <span>새 책 검색</span>
                            </button>
                        )}
                    </div>

                    {visibleBooks.length === 0 ? (
                        <div className="catalog-empty">
                            <div className="catalog-empty-icon"><AppIcon name="brand" size={30} /></div>
                            <h3>{searchTerm ? '검색 결과가 없어요' : '아직 담긴 책이 없어요'}</h3>
                            <p>{searchTerm ? '다른 제목이나 저자로 다시 찾아보세요.' : '새로운 책을 발견하면 이곳에 차곡차곡 모여요.'}</p>
                        </div>
                    ) : (
                        <div className="catalog-grid">
                            {visibleBooks.map(book => {
                                const log = readingLogs.find(l => l.fields['책']?.[0] === book.id);
                                const hasGuide = book.fields['부모_읽기_가이드'] && book.fields['부모_읽기_가이드'].trim();
                                
                                return (
                                    <div key={book.id} className="catalog-grid-item">
                                        <BookCard
                                            book={book}
                                            log={log}
                                            onClick={() => onSelectBook(book)}
                                        />
                                        {/* 관심책이고 가이드가 없으면 가이드 생성 버튼 */}
                                        {filterType === 'interested' && !hasGuide && (
                                            <button
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!await confirmAction('이 책의 부모 가이드를 생성하시겠습니까?\nAI 가이드 생성에 시간이 걸립니다.')) {
                                                        return;
                                                    }
                                                    
                                                    try {
                                                        const response = await fetch('/api/update-book-guide', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                bookId: book.id,
                                                                title: book.fields['제목'],
                                                                author: book.fields['저자'],
                                                                childAgeMonths
                                                            })
                                                        });
                                                        
                                                        const data = await response.json();
                                                        
                                                        if (data.success) {
                                                            notify('부모 가이드가 생성되었습니다!');
                                                            await onDataUpdate();
                                                        } else {
                                                            notify('가이드 생성에 실패했습니다: ' + (data.error || '알 수 없는 오류'));
                                                        }
                                                    } catch (error) {
                                                        console.error('가이드 생성 오류:', error);
                                                        notify('가이드 생성 중 오류가 발생했습니다');
                                                    }
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: '0.5rem',
                                                    right: '0.5rem',
                                                    padding: '0.5rem 1rem',
                                                    background: '#FF69B4',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    color: 'white',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer',
                                                    zIndex: 10,
                                                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                                }}
                                            >
                                                🤖 가이드 생성
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        }

        function AllBooksView({ books, readingLogs, onBack, onSelectBook, initialSearchTerm = '' }) {
            const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
            const [sortBy, setSortBy] = useState('title');
            const [currentPage, setCurrentPage] = useState(1);
            const BOOKS_PER_PAGE = 24;

            // initialSearchTerm이 있으면 검색어 필터링, 없으면 전체 책
            const filteredBooks = initialSearchTerm 
                ? books.filter(book =>
                    book.fields['제목']?.toLowerCase().includes(initialSearchTerm.toLowerCase()) ||
                    book.fields['저자']?.toLowerCase().includes(initialSearchTerm.toLowerCase()) ||
                    book.fields['테마']?.toLowerCase().includes(initialSearchTerm.toLowerCase())
                  )
                : books.filter(book =>
                    !searchTerm || 
                    book.fields['제목']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    book.fields['저자']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    book.fields['테마']?.toLowerCase().includes(searchTerm.toLowerCase())
                  );

            const sortedBooks = [...filteredBooks].sort((a, b) => {
                if (sortBy === 'title') return (a.fields['제목'] || '').localeCompare(b.fields['제목'] || '');
                if (sortBy === 'author') return (a.fields['저자'] || '').localeCompare(b.fields['저자'] || '');
                return 0;
            });

            const totalPages = Math.ceil(sortedBooks.length / BOOKS_PER_PAGE);
            const startIdx = (currentPage - 1) * BOOKS_PER_PAGE;
            const paginatedBooks = sortedBooks.slice(startIdx, startIdx + BOOKS_PER_PAGE);

            return (
                <div className="catalog-view">
                    <div className="view-heading">
                        <span className="view-eyebrow">DORANDORAN LIBRARY</span>
                        <h2>{initialSearchTerm ? `“${initialSearchTerm}” 검색 결과` : '전체 책'}</h2>
                        <p>{initialSearchTerm ? `${filteredBooks.length}권을 찾았어요.` : `${books.length}권의 이야기를 한눈에 살펴보세요.`}</p>
                    </div>

                    {/* 검색 & 정렬 */}
                    <div className="catalog-toolbar">
                        <label className="catalog-search-wrap">
                            <AppIcon name="search" size={19} />
                            <input
                                className="catalog-search"
                                type="search"
                                placeholder="제목, 저자, 테마로 검색"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </label>
                        <select
                            className="catalog-sort"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            aria-label="책 정렬"
                        >
                            <option value="title">제목순</option>
                            <option value="author">저자순</option>
                        </select>
                    </div>

                    {/* 책 그리드 */}
                    <div className="catalog-grid">
                        {paginatedBooks.map(book => {
                            const log = readingLogs.find(l => l.fields['책']?.[0] === book.id);
                            return (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    log={log}
                                    onClick={() => onSelectBook(book)}
                                />
                            );
                        })}
                    </div>

                    {/* 페이지네이션 */}
                    {totalPages > 1 && (
                        <div className="catalog-pagination">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentPage === 1 ? '#eee' : '#FF69B4',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: 'white',
                                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                                }}
                            >
                                ←
                            </button>
                            
                            {/* 페이지 번호 제한 (현재 페이지 기준 앞뒤 2페이지만 표시) */}
                            {(() => {
                                const pages = [];
                                const maxVisible = 5; // 최대 5개 페이지 번호 표시
                                let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                                let endPage = Math.min(totalPages, startPage + maxVisible - 1);
                                
                                // 끝에 가까우면 시작점 조정
                                if (endPage - startPage < maxVisible - 1) {
                                    startPage = Math.max(1, endPage - maxVisible + 1);
                                }
                                
                                // 첫 페이지가 1이 아니면 ... 표시
                                if (startPage > 1) {
                                    pages.push(
                                        <button
                                            key={1}
                                            onClick={() => setCurrentPage(1)}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: 'white',
                                                border: '2px solid #FFB6C1',
                                                borderRadius: '8px',
                                                color: '#FF69B4',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            1
                                        </button>
                                    );
                                    if (startPage > 2) {
                                        pages.push(<span key="ellipsis1" style={{ padding: '0.5rem' }}>...</span>);
                                    }
                                }
                                
                                // 페이지 번호들
                                for (let i = startPage; i <= endPage; i++) {
                                    pages.push(
                                        <button
                                            key={i}
                                            onClick={() => setCurrentPage(i)}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: currentPage === i ? '#FF69B4' : 'white',
                                                border: '2px solid #FFB6C1',
                                                borderRadius: '8px',
                                                color: currentPage === i ? 'white' : '#FF69B4',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {i}
                                        </button>
                                    );
                                }
                                
                                // 마지막 페이지가 표시 범위 밖이면 ... 표시
                                if (endPage < totalPages) {
                                    if (endPage < totalPages - 1) {
                                        pages.push(<span key="ellipsis2" style={{ padding: '0.5rem' }}>...</span>);
                                    }
                                    pages.push(
                                        <button
                                            key={totalPages}
                                            onClick={() => setCurrentPage(totalPages)}
                                            style={{
                                                padding: '0.5rem 1rem',
                                                background: 'white',
                                                border: '2px solid #FFB6C1',
                                                borderRadius: '8px',
                                                color: '#FF69B4',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {totalPages}
                                        </button>
                                    );
                                }
                                
                                return pages;
                            })()}
                            
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentPage === totalPages ? '#eee' : '#FF69B4',
                                    border: 'none',
                                    borderRadius: '8px',
                                    color: 'white',
                                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                                }}
                            >
                                →
                            </button>
                        </div>
                    )}
                </div>
            );
        }

        function BookDetailModal({ book, log, onClose, updateReadingLog, onDataUpdate }) {
            const [reaction, setReaction] = useState(log?.fields['아이반응'] || '');
            const [memo, setMemo] = useState(log?.fields['메모'] || '');
            const [isRead, setIsRead] = useState(!!log?.fields['완독여부']); // 끝까지 읽었는지 (체크하면 완독, 안하면 중간에 멈춤)
            const [questionLevel, setQuestionLevel] = useState(log?.fields['질문정도'] || ''); // '많음', '보통', '없음'
            const [focusLevel, setFocusLevel] = useState(log?.fields['집중정도'] || ''); // '높음', '보통', '낮음'
            const [saving, setSaving] = useState(false);
            const [justSaved, setJustSaved] = useState(false);
            const [libraryLoading, setLibraryLoading] = useState(false);
            const [libraryResults, setLibraryResults] = useState(null);
            const [libraryError, setLibraryError] = useState('');
            const [isLibraryOpen, setIsLibraryOpen] = useState(false);
            
            // 관심책 상태 확인 (Airtable에서)
            const isInterested = book.fields['관심'] === true || book.fields['관심'] === 'true';
            const [isInInterested, setIsInInterested] = useState(isInterested);

            const reactions = ['😍', '😊', '😐', '😢', '🥱'];
            
            const handleToggleInterested = async () => {
                try {
                    // Airtable에 관심 여부 저장
                    const response = await fetch('/api/update-book-field', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            recordId: book.id,
                            fields: {
                                '관심': !isInInterested
                            }
                        })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        setIsInInterested(!isInInterested);
                        notify(!isInInterested ? '관심책에 추가되었습니다!' : '관심책에서 제거되었습니다.');
                        // 데이터 새로고침
                        if (onDataUpdate) {
                            await onDataUpdate();
                        }
                    } else {
                        notify('오류: ' + (data.error || '저장 실패'));
                    }
                } catch (error) {
                    console.error('관심책 저장 오류:', error);
                    notify('관심책 저장 중 오류가 발생했습니다');
                }
            };

            const handleSave = async () => {
                setSaving(true);
                setJustSaved(false);
                
                const logData = {
                    '아이반응': reaction,
                    '메모': memo,
                    '완독여부': isRead, // 끝까지 읽었으면 true, 중간에 멈췄으면 false
                    '질문정도': questionLevel,
                    '집중정도': focusLevel
                    // 날짜 필드는 Airtable에 없을 수 있으므로 제거
                };

                const success = await updateReadingLog(book.id, logData);
                
                setSaving(false);
                
                if (success) {
                    setJustSaved(true);
                    // 3초 후 저장 완료 표시 제거
                    setTimeout(() => setJustSaved(false), 3000);
                } else {
                    notify('❌ 저장 실패했어요. 다시 시도해주세요!');
                }
            };

            useEffect(() => {
                setLibraryResults(null);
                setLibraryError('');
                setLibraryLoading(false);
                setIsLibraryOpen(false);
            }, [book?.id]);

            const handleCheckLibrary = async () => {
                const isbn = book.fields['ISBN'];
                if (!isbn) {
                    notify('ISBN 정보가 없어 조회할 수 없습니다.');
                    return;
                }
                setLibraryLoading(true);
                setLibraryError('');
                try {
                    const response = await fetch(`/api/check-book-library?isbn=${encodeURIComponent(isbn)}`);
                    const data = await response.json();
                    if (data.success) {
                        setLibraryResults(data.results || []);
                    } else {
                        setLibraryError(data.error || '조회에 실패했습니다');
                    }
                } catch (error) {
                    console.error('도서관 조회 오류:', error);
                    setLibraryError('도서관 조회 중 오류가 발생했습니다');
                } finally {
                    setLibraryLoading(false);
                }
            };

            const handleToggleLibrary = async () => {
                if (isLibraryOpen) {
                    setIsLibraryOpen(false);
                    return;
                }
                setIsLibraryOpen(true);
                if (!libraryResults && !libraryLoading) {
                    await handleCheckLibrary();
                }
            };

            return (
                <div className="clay-modal-overlay" onClick={onClose} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="clay-modal-panel clay-modal-panel-detail" onClick={(e) => e.stopPropagation()} style={{
                        background: 'white',
                        borderRadius: '20px',
                        padding: '2rem',
                        maxWidth: '600px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflow: 'auto'
                    }}>
                        {/* 표지 이미지 */}
                        {book.fields['표지이미지'] && (
                            <div className="modal-book-cover" style={{
                                width: '200px',
                                height: '280px',
                                margin: '0 auto 1.5rem',
                                borderRadius: '15px',
                                overflow: 'hidden',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                            }}>
                                <img 
                                    src={book.fields['표지이미지']} 
                                    alt={book.fields['제목']}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover'
                                    }}
                                    onError={(e) => {
                                        e.target.parentElement.style.display = 'none';
                                    }}
                                />
                            </div>
                        )}
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '1.8rem', color: '#FF69B4', margin: 0, flex: 1 }}>
                                {book.fields['제목']}
                            </h2>
                            <button className="modal-choice-button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleInterested();
                                }}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '2rem',
                                    cursor: 'pointer',
                                    padding: '0.5rem',
                                    marginLeft: '1rem',
                                    transition: 'transform 0.2s',
                                    lineHeight: 1
                                }}
                                onMouseEnter={(e) => e.target.style.transform = 'scale(1.1)'}
                                onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
                                title={isInInterested ? '관심책에서 제거' : '관심책에 추가'}
                            >
                                <AppIcon name="heart" size={22} />
                            </button>
                        </div>
                        
                        {/* 서지 정보 - 2열 구성 */}
                        <div className="modal-section-surface" style={{
                            background: '#F8F9FA', 
                            padding: '1rem', 
                            borderRadius: '10px', 
                            marginBottom: '1rem',
                            fontSize: '0.9rem',
                            color: '#666'
                        }}>
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '1fr 1fr', 
                                gap: '0.75rem'
                            }}>
                                <div>
                                    <p style={{ marginBottom: '0.5rem' }}>
                                        <strong>저자:</strong> {book.fields['저자']}
                                    </p>
                                    
                                    {book.fields['출판사'] && (
                                        <p style={{ marginBottom: '0.5rem' }}>
                                            🏢 <strong>출판사:</strong> {book.fields['출판사']}
                                        </p>
                                    )}
                                    
                                    {book.fields['발행년'] && (
                                        <p style={{ marginBottom: '0.5rem' }}>
                                            📅 <strong>발행년:</strong> {book.fields['발행년']}년
                                        </p>
                                    )}
                                </div>
                                
                                <div>
                                    {book.fields['연령'] && (
                                        <p style={{ marginBottom: '0.5rem' }}>
                                            👶 <strong>추천 연령:</strong> {book.fields['연령']}
                                        </p>
                                    )}
                                    
                                    {book.fields['ISBN'] && (
                                        <p style={{ marginBottom: '0' }}>
                                            <strong>ISBN:</strong> {book.fields['ISBN']}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 부천시 도서관 보유 여부 */}
                        {book.fields['ISBN'] && (
                            <div style={{ marginBottom: '1rem' }}>
                                <button
                                    onClick={handleToggleLibrary}
                                    disabled={libraryLoading && !isLibraryOpen}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        background: libraryLoading ? '#ccc' : '#8B7EC8',
                                        border: 'none',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontSize: '0.95rem',
                                        fontWeight: 'bold',
                                        cursor: libraryLoading ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {libraryLoading
                                        ? '도서관 조회 중...'
                                        : (isLibraryOpen ? '도서관 조회 결과 닫기' : '부천시 도서관 보유 여부 조회')}
                                </button>

                                {libraryError && (
                                    <div style={{ marginTop: '0.5rem', color: '#ff6b6b', fontSize: '0.85rem' }}>
                                        {libraryError}
                                    </div>
                                )}

                                {isLibraryOpen && (
                                    <div className="modal-section-surface" style={{
                                        marginTop: '0.75rem',
                                        background: '#F8F9FA',
                                        borderRadius: '10px',
                                        padding: '0.75rem',
                                        fontSize: '0.85rem',
                                        color: '#555'
                                    }}>
                                        <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: '#8B7EC8' }}>
                                            보유 도서관
                                        </div>
                                        {libraryLoading && (
                                            <div>조회 중...</div>
                                        )}
                                        {!libraryLoading && libraryResults && (
                                            libraryResults.filter(r => r.hasBook).length === 0 ? (
                                                <div>보유 도서관이 없습니다.</div>
                                            ) : (
                                                <div style={{ display: 'grid', gap: '0.35rem' }}>
                                                    {libraryResults.filter(r => r.hasBook).map(lib => (
                                                        <div key={lib.libCode} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>{lib.libName}</span>
                                                            <span style={{ color: lib.loanAvailable ? '#2ecc71' : '#999' }}>
                                                                {lib.loanAvailable ? '대출 가능' : '대출 불가'}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {book.fields['테마'] && (
                            <div style={{ marginBottom: '1rem' }}>
                                <strong>테마:</strong>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                                    {book.fields['테마'].split(',').map((tema, idx) => (
                                        <span key={idx} style={{
                                            background: '#FFE4E1',
                                            color: '#FF69B4',
                                            padding: '0.25rem 0.75rem',
                                            borderRadius: '20px',
                                            fontSize: '0.85rem'
                                        }}>
                                            {tema.trim()}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {book.fields['설명'] && (
                            <div className="modal-section-surface" style={{
                                marginBottom: '1.5rem',
                                padding: '1rem',
                                background: '#F8F9FA',
                                borderRadius: '10px',
                                lineHeight: '1.6',
                                fontSize: '0.9rem',
                                color: '#333'
                            }}>
                                <strong className="recommendation-label" style={{ display: 'flex', marginBottom: '0.5rem', color: '#FF69B4' }}>
                                    <AppIcon name="brand" size={16} />
                                    <span>책 소개</span>
                                </strong>
                                <div style={{ whiteSpace: 'pre-wrap' }}>
                                    {book.fields['설명']}
                                </div>
                            </div>
                        )}

                        {book.fields['부모_읽기_가이드'] && (
                            <div style={{
                                background: '#FFF5E1',
                                padding: '1rem',
                                borderRadius: '10px',
                                marginBottom: '1rem'
                            }}>
                                <strong className="recommendation-label" style={{ color: '#FF69B4' }}>
                                    <AppIcon name="sparkle" size={16} />
                                    <span>부모 가이드</span>
                                </strong>
                                <p style={{ marginTop: '0.5rem', lineHeight: '1.6' }}>
                                    {book.fields['부모_읽기_가이드']}
                                </p>
                            </div>
                        )}

                        {book.fields['연계놀이'] && (
                            <div style={{
                                background: '#E6F7FF',
                                padding: '1rem',
                                borderRadius: '10px',
                                marginBottom: '1rem'
                            }}>
                                <strong style={{ color: '#FF69B4' }}>🎨 연계놀이</strong>
                                <p style={{ marginTop: '0.5rem', lineHeight: '1.6' }}>
                                    {book.fields['연계놀이']}
                                </p>
                            </div>
                        )}

                        {/* 읽기 기록 섹션 */}
                        <div className="modal-section-surface" style={{
                            background: '#F8F9FA',
                            padding: '1.5rem',
                            borderRadius: '15px',
                            marginBottom: '1rem',
                            border: '2px solid #E9ECEF'
                        }}>
                            <h3 className="recommendation-label" style={{ fontSize: '1.2rem', color: '#FF69B4', marginBottom: '1rem' }}>
                                <AppIcon name="check" size={18} />
                                <span>읽기 기록</span>
                            </h3>

                            {/* 완독 여부 (끝까지 읽었는지) */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={isRead}
                                        onChange={(e) => setIsRead(e.target.checked)}
                                        style={{ 
                                            width: '20px', 
                                            height: '20px', 
                                            marginRight: '0.5rem',
                                            cursor: 'pointer'
                                        }}
                                    />
                                    <span style={{ fontSize: '1rem' }}>
                                        {isRead ? '끝까지 읽었어요' : '중간에 멈췄어요'}
                                    </span>
                                </label>
                            </div>

                            {/* 질문 정도 */}
                            <div style={{ marginBottom: '1rem' }}>
                                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>질문이 많았나요?</strong>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {['많음', '보통', '없음'].map(level => (
                                        <button className={`modal-choice-button ${questionLevel === level ? 'is-selected' : ''}`}
                                            key={level}
                                            onClick={() => setQuestionLevel(level)}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                border: '1px solid #ddd',
                                                borderRadius: '10px',
                                                background: 'white',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            {level === '많음' ? '많이' : level === '보통' ? '보통' : '없음'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 집중 정도 */}
                            <div style={{ marginBottom: '1rem' }}>
                                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>집중해서 봤나요?</strong>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    {['높음', '보통', '낮음'].map(level => (
                                        <button className={`modal-choice-button ${focusLevel === level ? 'is-selected' : ''}`}
                                            key={level}
                                            onClick={() => setFocusLevel(level)}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                border: '1px solid #ddd',
                                                borderRadius: '10px',
                                                background: 'white',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem'
                                            }}
                                        >
                                            {level === '높음' ? '높음' : level === '보통' ? '보통' : '낮음'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 아이 반응 */}
                            <div style={{ marginBottom: '1rem' }}>
                                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>아이 반응:</strong>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {reactions.map(r => (
                                        <button className={`modal-choice-button ${reaction === r ? 'is-selected' : ''}`}
                                            key={r}
                                            onClick={() => setReaction(r)}
                                            style={{
                                                fontSize: '2rem',
                                                padding: '0.5rem',
                                                border: '1px solid #ddd',
                                                borderRadius: '10px',
                                                background: 'white',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 메모 */}
                            <div>
                                <strong style={{ display: 'block', marginBottom: '0.5rem' }}>메모:</strong>
                                <textarea
                                    value={memo}
                                    onChange={(e) => setMemo(e.target.value)}
                                    placeholder="책을 읽으면서 느낀 점이나 우람이 반응을 적어보세요..."
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '2px solid #ddd',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem',
                                        minHeight: '100px',
                                        resize: 'vertical',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            {/* 저장 버튼 */}
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    marginTop: '1rem',
                                    background: saving ? '#ccc' : (justSaved ? '#98D8C8' : '#FF69B4'),
                                    border: 'none',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    cursor: saving ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s'
                                }}
                            >
                                <AppIcon name="check" size={17} />
                                <span>{saving ? '저장 중...' : (justSaved ? '저장 완료!' : '저장하기')}</span>
                            </button>
                            {justSaved && (
                                <p style={{ 
                                    textAlign: 'center', 
                                    marginTop: '0.5rem', 
                                    fontSize: '0.9rem', 
                                    color: '#98D8C8',
                                    fontWeight: 'bold'
                                }}>
                                    저장되었어요! 계속 수정하거나 닫기를 눌러주세요.
                                </p>
                            )}
                        </div>

                        <button className="modal-secondary-button"
                            onClick={onClose}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: 'white',
                                border: '2px solid #FFB6C1',
                                borderRadius: '10px',
                                color: '#FF69B4',
                                fontSize: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            닫기
                        </button>
                    </div>
                </div>
            );
        }

        function SettingsView({ profile, onSave, selectedInterests, onChangeInterests }) {
            const [birthDate, setBirthDate] = useState(profile.birthDate || '');
            const [gender, setGender] = useState(profile.gender === '남아' ? 'male' : profile.gender === '여아' ? 'female' : (profile.gender || ''));
            const [booksPerDay, setBooksPerDay] = useState(profile.booksPerDay || 2);
            const [emotionSensitivity, setEmotionSensitivity] = useState(
                ({ '높음': 'high', '보통': 'normal', '낮음': 'low' })[profile.emotionSensitivity] || profile.emotionSensitivity || 'normal'
            );
            const [saving, setSaving] = useState(false);
            const computedAgeMonths = computeAgeMonthsFromBirthdate(birthDate);
            const hasComputedAgeMonths = Number.isFinite(computedAgeMonths);
            const [interestCandidates, setInterestCandidates] = useState([]);
            const [autoTopInterests, setAutoTopInterests] = useState([]);
            const [interestLoading, setInterestLoading] = useState(false);
            const [interestGroups, setInterestGroups] = useState([]);
            const [manualInterest, setManualInterest] = useState('');
            const [interestError, setInterestError] = useState('');
            const [classificationItems, setClassificationItems] = useState([]);
            const [classificationGroups, setClassificationGroups] = useState([]);
            const [classificationSelections, setClassificationSelections] = useState({});
            const [classificationLoading, setClassificationLoading] = useState(true);
            const [classificationBusy, setClassificationBusy] = useState('');
            const [classificationError, setClassificationError] = useState('');
            const [classificationTotal, setClassificationTotal] = useState(0);
            const [classificationPage, setClassificationPage] = useState(1);
            const classificationPageSize = 20;
            const directInterests = selectedInterests.filter(
                item => !autoTopInterests.some(auto => auto.toLowerCase() === String(item).toLowerCase())
            );
            const openClassifications = classificationItems.filter(
                item => item.status === 'pending' || item.status === 'deferred'
            );

            useEffect(() => {
                let cancelled = false;
                const loadCandidates = async () => {
                    setInterestLoading(true);
                    try {
                        const selectedQuery = encodeURIComponent(selectedInterests.join(','));
                        const response = await fetch(`/api/interest-candidates?selected=${selectedQuery}`, { cache: 'no-store' });
                        if (!response.ok) throw new Error('관심사 후보 로드 실패');
                        const data = await response.json();
                        if (!cancelled) {
                            setInterestCandidates(data.candidates || []);
                            setAutoTopInterests(data.autoTop || []);
                            setInterestGroups(data.groups || []);
                            const normalizedSelected = (data.normalizedSelected || []).filter(
                                item => !(data.autoTop || []).includes(item)
                            );
                            if (JSON.stringify(normalizedSelected) !== JSON.stringify(selectedInterests)) {
                                onChangeInterests(normalizedSelected);
                            }
                            loadClassifications(1);
                        }
                    } catch (e) {
                        if (!cancelled) {
                            setInterestCandidates([]);
                            setAutoTopInterests([]);
                        }
                    } finally {
                        if (!cancelled) setInterestLoading(false);
                    }
                };
                loadCandidates();
                return () => { cancelled = true; };
            }, []);

            const classificationTotalPages = Math.max(1, Math.ceil(classificationTotal / classificationPageSize));

            const loadClassifications = async (requestedPage = 1) => {
                setClassificationLoading(true);
                setClassificationError('');
                try {
                    const response = await fetch(`/api/interest-candidates?mode=classifications&page=${requestedPage}&pageSize=${classificationPageSize}`, { cache: 'no-store' });
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('application/json')) throw new Error('분류 관리 기능을 준비하는 중입니다.');
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || '미분류 표현을 불러오지 못했어요.');
                    setClassificationItems(data.items || []);
                    setClassificationGroups(data.groups || []);
                    setClassificationTotal(data.total || 0);
                    setClassificationPage(data.page || requestedPage);
                    setClassificationSelections(current => {
                        const next = { ...current };
                        (data.items || []).forEach(item => {
                            if (!next[item.normalized_expression] && item.mapped_theme) {
                                next[item.normalized_expression] = item.mapped_theme;
                            }
                        });
                        return next;
                    });
                } catch (error) {
                    setClassificationError(error.message || '미분류 표현을 불러오지 못했어요.');
                } finally {
                    setClassificationLoading(false);
                }
            };

            useEffect(() => {
                loadClassifications(1);
            }, []);

            const handleClassification = async (item, action) => {
                const mappedTheme = classificationSelections[item.normalized_expression] || '';
                if (action === 'mapped' && !mappedTheme) {
                    setClassificationError('연결할 표준 테마를 먼저 선택해주세요.');
                    return;
                }

                setClassificationBusy(item.normalized_expression);
                setClassificationError('');
                try {
                    const response = await fetch('/api/interest-candidates?mode=classifications', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            normalizedExpression: item.normalized_expression,
                            action,
                            mappedTheme
                        })
                    });
                    const contentType = response.headers.get('content-type') || '';
                    if (!contentType.includes('application/json')) throw new Error('분류 관리 기능을 준비하는 중입니다.');
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || '분류 결과를 저장하지 못했어요.');
                    const nextPage = classificationItems.length === 1 && classificationPage > 1
                        ? classificationPage - 1
                        : classificationPage;
                    await loadClassifications(nextPage);
                } catch (error) {
                    setClassificationError(error.message || '분류 결과를 저장하지 못했어요.');
                } finally {
                    setClassificationBusy('');
                }
            };

            const toggleInterest = (label) => {
                const normalized = String(label || '').trim();
                if (!normalized) return;
                const isSelected = selectedInterests.some(
                    (item) => item.toLowerCase() === normalized.toLowerCase()
                );
                let next = [];
                if (isSelected) {
                    next = selectedInterests.filter(
                        (item) => item.toLowerCase() !== normalized.toLowerCase()
                    );
                } else {
                    if (selectedInterests.length >= 8) return;
                    next = [...selectedInterests, normalized];
                }
                onChangeInterests(next);
            };

            const addManualInterest = async () => {
                const input = manualInterest.trim();
                if (!input || selectedInterests.length >= 8) return;
                setInterestError('');
                try {
                    const response = await fetch(`/api/interest-candidates?q=${encodeURIComponent(input)}`, { cache: 'no-store' });
                    if (!response.ok) throw new Error('테마 확인 실패');
                    const data = await response.json();
                    const canonical = data.normalizedInput;
                    if (!canonical) {
                        setInterestError('추천에 쓸 수 있는 테마로 찾지 못했어요. 아래 목록에서 가장 가까운 항목을 골라주세요.');
                        return;
                    }
                    if (autoTopInterests.some(item => item === canonical)) {
                        setInterestError(`‘${canonical}’은 이미 자동 관심사에 반영되어 있어요.`);
                        setManualInterest('');
                        return;
                    }
                    if (!selectedInterests.some(item => item === canonical)) {
                        onChangeInterests([...selectedInterests, canonical]);
                    }
                    setManualInterest('');
                } catch (error) {
                    setInterestError('테마를 확인하지 못했어요. 잠시 후 다시 시도해주세요.');
                }
            };

            const handleSave = async () => {
                setSaving(true);
                try {
                    await onSave({
                        birthDate,
                        ageMonths: hasComputedAgeMonths ? computedAgeMonths : '',
                        gender,
                        booksPerDay: parseInt(booksPerDay) || 2,
                        emotionSensitivity
                    }, selectedInterests);
                    notify('설정이 안전하게 저장되었습니다.');
                } catch (error) {
                    notify(error.message || '설정 저장에 실패했습니다.', { tone: 'error' });
                } finally {
                    setSaving(false);
                }
            };

            return (
                <div className="settings-view">
                    <div className="settings-header">
                        <h2 className="display-section-title settings-heading">
                            <span className="settings-heading-mark"><AppIcon name="user" size={21} /></span>
                            <span>아이 프로필 설정</span>
                        </h2>
                        <p>읽기 습관과 관심사를 설정하면 우람이에게 더 잘 맞는 책을 추천할 수 있어요.</p>
                    </div>

                    <div className="settings-form">

                        {/* 생년월일 */}
                        <div className="settings-field">
                            <label>
                                생년월일
                            </label>
                            <input
                                className="settings-input"
                                type="date"
                                value={birthDate}
                                onChange={(e) => setBirthDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    border: '2px solid #ddd',
                                    borderRadius: '10px',
                                    fontSize: '1rem',
                                    outline: 'none'
                                }}
                            />
                            <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                                {hasComputedAgeMonths
                                    ? `현재 월령: ${computedAgeMonths}개월`
                                    : '생년월일을 입력하면 월령이 자동 계산돼요.'}
                            </div>
                        </div>

                        {/* 요즘 관심사 */}
                        <div className="settings-field settings-field-wide">
                            <label>
                                요즘 관심사
                            </label>
                            <div style={{ fontSize: '0.85rem', color: '#777', marginBottom: '0.5rem' }}>
                                자동으로 잡힌 관심사
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                {interestLoading && (
                                    <span style={{ fontSize: '0.85rem', color: '#999' }}>불러오는 중...</span>
                                )}
                                {!interestLoading && autoTopInterests.length === 0 && (
                                    <span style={{ fontSize: '0.85rem', color: '#999' }}>데이터가 부족해요</span>
                                )}
                                {!interestLoading && autoTopInterests.map((tag, idx) => (
                                    <span className="settings-auto-tag" key={idx} style={{
                                        background: '#F0F0F0',
                                        color: '#666',
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '20px',
                                        fontSize: '0.85rem'
                                    }}>
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <div style={{ fontSize: '0.85rem', color: '#777', marginBottom: '0.5rem' }}>
                                직접 선택
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <input
                                    className="settings-input"
                                    type="text"
                                    value={manualInterest}
                                    onChange={(e) => setManualInterest(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualInterest(); } }}
                                    placeholder="예: 고양이, 용기, 계절"
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        padding: '0.65rem 0.75rem',
                                        border: '1px solid #ddd',
                                        borderRadius: '10px',
                                        fontSize: '0.9rem'
                                    }}
                                />
                                <button className="clay-button clay-button-primary settings-inline-action"
                                    type="button"
                                    onClick={addManualInterest}
                                    disabled={!manualInterest.trim() || directInterests.length >= 8}
                                    style={{
                                        border: 'none',
                                        background: '#8B7EC8',
                                        color: 'white',
                                        borderRadius: '10px',
                                        padding: '0 1rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    추가
                                </button>
                            </div>
                            {interestError && (
                                <div style={{ color: '#C45C5C', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                                    {interestError}
                                </div>
                            )}
                            <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.75rem' }}>
                                책의 형식이나 등장인물이 아니라, 아이가 반복해서 찾는 관심과 이야기 경험을 기준으로 골라요. 자동 관심사와 같은 값은 한 번만 반영됩니다.
                            </div>
                            <div>
                                {!interestLoading && interestCandidates.length === 0 && (
                                    <span style={{ fontSize: '0.85rem', color: '#999' }}>후보가 없습니다</span>
                                )}
                                {interestGroups.map(group => (
                                    <div key={group.id} style={{ marginBottom: '0.8rem' }}>
                                        <div style={{ color: '#777', fontSize: '0.78rem', marginBottom: '0.35rem' }}>{group.label}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            {group.themes.filter(label => !autoTopInterests.includes(label)).map(label => {
                                                const isSelected = directInterests.includes(label);
                                                return (
                                                    <button className={`settings-tag ${isSelected ? 'is-selected' : ''}`}
                                                        key={label}
                                                        type="button"
                                                        onClick={() => toggleInterest(label)}
                                                        style={{
                                                            border: isSelected ? '2px solid #8B7EC8' : '1px solid #ddd',
                                                            background: isSelected ? '#F0EDFF' : 'white',
                                                            color: '#333',
                                                            padding: '0.35rem 0.75rem',
                                                            borderRadius: '20px',
                                                            fontSize: '0.85rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {directInterests.length > 0 && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
                                    직접 반영: {directInterests.join(', ')}
                                </div>
                            )}
                        </div>

                        <div className="settings-field classification-manager">
                            <div className="classification-heading-row">
                                <div>
                                    <h3>표현 분류 관리</h3>
                                    <p className="classification-description">
                                        사전에 없는 표현을 기존 테마에 연결하거나 추천 분류에서 제외할 수 있어요.
                                    </p>
                                </div>
                                <span className="classification-count">미분류 {classificationTotal.toLocaleString('ko-KR')}개</span>
                            </div>

                            {classificationLoading && (
                                <p className="classification-empty">미분류 표현을 불러오는 중...</p>
                            )}
                            {!classificationLoading && classificationError && (
                                <p className="classification-error">{classificationError}</p>
                            )}
                            {!classificationLoading && !classificationError && openClassifications.length === 0 && (
                                <p className="classification-empty">지금 검토할 표현이 없어요.</p>
                            )}

                            <div className="classification-list">
                                {openClassifications.map(item => {
                                    const busy = classificationBusy === item.normalized_expression;
                                    return (
                                        <div className="classification-item" key={item.normalized_expression}>
                                            <div>
                                                <div className="classification-expression">
                                                    {item.raw_expression}
                                                    {item.status === 'deferred' && <span className="classification-status">보류됨</span>}
                                                </div>
                                                <div className="classification-meta">
                                                    {(item.record_ids || []).length > 0
                                                        ? `관련 책 ${(item.record_ids || []).length}권`
                                                        : `${item.occurrence_count || 1}회 발견`} · 최근 {new Date(item.last_seen_at).toLocaleDateString('ko-KR')}
                                                    {(item.sources || []).length > 0 && <><br />출처: {(item.sources || []).join(', ')}</>}
                                                    {(item.record_ids || []).length > 0 && <><br />관련 책 ID: {(item.record_ids || []).slice(0, 3).join(', ')}</>}
                                                </div>
                                            </div>
                                            <div className="classification-controls">
                                                <select
                                                    value={classificationSelections[item.normalized_expression] || ''}
                                                    onChange={(event) => setClassificationSelections(current => ({
                                                        ...current,
                                                        [item.normalized_expression]: event.target.value
                                                    }))}
                                                    disabled={busy}
                                                    aria-label={`${item.raw_expression} 연결 테마`}
                                                >
                                                    <option value="">연결할 표준 테마</option>
                                                    {classificationGroups.map(group => (
                                                        <optgroup label={group.label} key={group.id}>
                                                            {group.themes.map(theme => <option value={theme} key={theme}>{theme}</option>)}
                                                        </optgroup>
                                                    ))}
                                                </select>
                                                <button
                                                    className="clay-button clay-button-primary"
                                                    type="button"
                                                    disabled={busy || !classificationSelections[item.normalized_expression]}
                                                    onClick={() => handleClassification(item, 'mapped')}
                                                >
                                                    연결
                                                </button>
                                                <div className="classification-secondary-actions">
                                                    <button
                                                        className="clay-button"
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => handleClassification(item, item.status === 'deferred' ? 'pending' : 'deferred')}
                                                    >
                                                        {item.status === 'deferred' ? '다시 검토' : '보류'}
                                                    </button>
                                                    <button
                                                        className="clay-button classification-exclude-button"
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => handleClassification(item, 'excluded')}
                                                    >
                                                        제외
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {!classificationLoading && !classificationError && classificationTotal > classificationPageSize && (
                                <div className="classification-pagination">
                                    <span>
                                        {classificationTotal.toLocaleString('ko-KR')}개 중 {(classificationPage - 1) * classificationPageSize + 1}–{Math.min(classificationPage * classificationPageSize, classificationTotal)}개
                                    </span>
                                    <div className="classification-pagination-actions">
                                        <button
                                            className="clay-button"
                                            type="button"
                                            disabled={classificationPage <= 1 || Boolean(classificationBusy)}
                                            onClick={() => loadClassifications(classificationPage - 1)}
                                        >
                                            이전
                                        </button>
                                        <span>{classificationPage} / {classificationTotalPages}</span>
                                        <button
                                            className="clay-button"
                                            type="button"
                                            disabled={classificationPage >= classificationTotalPages || Boolean(classificationBusy)}
                                            onClick={() => loadClassifications(classificationPage + 1)}
                                        >
                                            다음
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 성별 */}
                        <div className="settings-field">
                            <label>
                                성별 (선택)
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {[{ value: 'male', label: '남아' }, { value: 'female', label: '여아' }].map(option => (
                                    <button className={`settings-choice ${gender === option.value ? 'is-selected' : ''}`}
                                        key={option.value}
                                        onClick={() => setGender(option.value)}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            border: '1px solid #ddd',
                                            borderRadius: '10px',
                                            background: 'white',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 하루에 읽는 책 권수 */}
                        <div className="settings-field">
                            <label>
                                하루에 읽는 책 권수
                            </label>
                            <input
                                className="settings-input"
                                type="number"
                                value={booksPerDay}
                                onChange={(e) => setBooksPerDay(e.target.value)}
                                placeholder="예: 2"
                                min="1"
                                max="10"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    border: '2px solid #ddd',
                                    borderRadius: '10px',
                                    fontSize: '1rem',
                                    outline: 'none'
                                }}
                            />
                            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                                하루에 평균적으로 몇 권의 책을 읽는지 입력해주세요
                            </div>
                        </div>

                        {/* 감정 예민도 */}
                        <div className="settings-field settings-field-wide">
                            <label>
                                감정 예민도
                            </label>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {[{ value: 'high', label: '높음' }, { value: 'normal', label: '보통' }, { value: 'low', label: '낮음' }].map(option => (
                                    <button className={`settings-choice ${emotionSensitivity === option.value ? 'is-selected' : ''}`}
                                        key={option.value}
                                        onClick={() => setEmotionSensitivity(option.value)}
                                        style={{
                                            flex: 1,
                                            padding: '0.75rem',
                                            border: '1px solid #ddd',
                                            borderRadius: '10px',
                                            background: 'white',
                                            cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>
                                갈등이나 무서운 장면에 민감한 정도 (높음: 갈등 장면을 피해야 함, 낮음: 다양한 내용을 잘 받아들임)
                            </div>
                        </div>

                    {/* 저장 버튼 */}
                    <button className="clay-button clay-button-primary settings-save-button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '0.75rem 2rem',
                            background: saving ? '#ccc' : '#315B55',
                            border: 'none',
                            borderRadius: '10px',
                            color: 'white',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            marginTop: '1rem'
                        }}
                    >
                        <AppIcon name="check" size={17} />
                        {saving ? '저장 중...' : '저장하기'}
                    </button>
                    </div>
                </div>
            );
        }

        function AladinBookModal({ book, onClose, onAdd, onAddToInterested }) {
            const [adding, setAdding] = useState(false);
            const [addingToInterested, setAddingToInterested] = useState(false);

            const handleAdd = async () => {
                setAdding(true);
                await onAdd();
                setAdding(false);
            };

            const handleAddToInterested = async () => {
                setAddingToInterested(true);
                await onAddToInterested();
                setAddingToInterested(false);
            };

            return (
                <div className="clay-modal-overlay" onClick={onClose} style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="clay-modal-panel clay-modal-panel-new" onClick={(e) => e.stopPropagation()} style={{
                        background: 'white',
                        borderRadius: '20px',
                        padding: '2rem',
                        maxWidth: '600px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflow: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                            <h2 className="modal-title" style={{ fontSize: '1.8rem', color: '#FF69B4', margin: 0 }}>
                                <span className="modal-title-mark"><AppIcon name="brand" size={20} /></span>
                                <span>신간 도서</span>
                            </h2>
                            <button className="modal-close-button"
                                onClick={onClose}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    color: '#999',
                                    padding: '0.5rem'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                            {book.cover && (
                                <img className="modal-book-cover"
                                    src={book.cover} 
                                    alt={book.title}
                                    style={{
                                        width: '200px',
                                        height: '280px',
                                        objectFit: 'cover',
                                        borderRadius: '10px',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                    }}
                                />
                            )}
                            <div style={{ flex: 1, minWidth: '250px' }}>
                                <h3 style={{ fontSize: '1.5rem', color: '#333', marginBottom: '0.5rem' }}>
                                    {book.title}
                                </h3>
                                <p style={{ fontSize: '1rem', color: '#666', marginBottom: '0.25rem' }}>
                                    {book.author}
                                </p>
                                <p style={{ fontSize: '0.9rem', color: '#999', marginBottom: '1rem' }}>
                                    {book.publisher} · {book.pubDate ? book.pubDate.substring(0, 4) : ''}년
                                </p>
                                {book.rating > 0 && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <span className="modal-rating-badge" style={{
                                            background: '#FFE4E1', 
                                            color: '#FF69B4', 
                                            padding: '0.25rem 0.75rem', 
                                            borderRadius: '20px',
                                            fontSize: '0.85rem',
                                            fontWeight: 'bold'
                                        }}>
                                            <AppIcon name="sparkle" size={14} />
                                            <span>{book.rating}/10</span>
                                        </span>
                                    </div>
                                )}
                                {book.recommendationReason && (
                                    <div className="modal-section-surface" style={{
                                        marginTop: '1rem',
                                        padding: '1rem',
                                        background: 'linear-gradient(135deg, #FFF5E6 0%, #FFE4E1 100%)',
                                        borderRadius: '10px',
                                        border: '1px solid #FFB6C1',
                                        fontSize: '0.9rem',
                                        lineHeight: '1.6'
                                    }}>
                                        <div className="recommendation-label" style={{
                                            fontSize: '0.75rem',
                                            color: '#FF69B4',
                                            fontWeight: 'bold',
                                            marginBottom: '0.5rem'
                                        }}>
                                            <AppIcon name="sparkle" size={15} />
                                            <span>우리아이에게 추천하는 이유</span>
                                        </div>
                                        <div>{book.recommendationReason}</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {book.description && (
                            <div className="modal-section-surface" style={{
                                marginBottom: '1.5rem',
                                padding: '1rem',
                                background: '#F8F9FA',
                                borderRadius: '10px',
                                lineHeight: '1.6',
                                fontSize: '0.9rem',
                                color: '#333'
                            }}>
                                <strong className="recommendation-label" style={{ display: 'flex', marginBottom: '0.5rem', color: '#FF69B4' }}>
                                    <AppIcon name="brand" size={16} />
                                    <span>책 소개</span>
                                </strong>
                                <div style={{ whiteSpace: 'pre-wrap' }}>
                                    {book.description}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={handleAdd}
                                    disabled={adding}
                                    style={{
                                        flex: 1,
                                        padding: '0.75rem',
                                        background: adding ? '#ccc' : '#98D8C8',
                                        border: 'none',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontSize: '1rem',
                                        fontWeight: 'bold',
                                        cursor: adding ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    <AppIcon name="plus" size={17} />
                                    <span>{adding ? '추가 중...' : '책 추가하기'}</span>
                                </button>
                            </div>
                            <button
                                onClick={handleAddToInterested}
                                disabled={addingToInterested}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    background: addingToInterested ? '#ccc' : '#DDA0DD',
                                    border: 'none',
                                    borderRadius: '10px',
                                    color: 'white',
                                    fontSize: '1rem',
                                    fontWeight: 'bold',
                                    cursor: addingToInterested ? 'not-allowed' : 'pointer'
                                }}
                            >
                                <AppIcon name="heart" size={17} />
                                <span>{addingToInterested ? '추가 중...' : '관심책으로 추가하기'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        ReactDOM.render(<><App /><NotificationCenter /></>, document.getElementById('root'));
