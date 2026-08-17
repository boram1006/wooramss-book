# 부모 가이드·연계 놀이 생성 기준

`lib/book-guide.js`가 모든 책 등록 및 가이드 재생성 경로의 공통 프롬프트와 출력 스키마를 관리한다.

## 설계 원칙

- 아이가 이야기하고 부모는 듣고 질문하는 대화식 독서 구조를 사용한다.
- 예/아니요나 선택지로 끝나지 않는 짧은 열린 질문을 정확히 2개 사용한다.
- 모든 책에 같은 `기다리기·말 확장` 문구를 붙이지 않는다. 책 정보로 상호작용 전략을 먼저 결정하고 모델은 그 전략을 실행한다.
- 상호작용 전략은 그림 단서, 예측·확인, 순서 다시 말하기, 감정·관점, 낱말·개념, 소리·말놀이, 경험 연결, 인물 역할 대화의 8종이다.
- 책마다 제목·소개에서 실제 고유어를 뽑고, 부모 반응에 `『고유어』`를 포함해 어느 책에나 붙일 수 없는 행동으로 만든다.
- 연계 놀이는 책의 읽기 초점과 직접 연결하고, 역할놀이·소도구·움직임 등으로 배운 내용을 다시 사용하게 한다.
- 놀이의 목표와 방향은 부모가 마련하되 아이가 선택하고 이야기를 이끌도록 한다.
- 책 소개가 부족할 때 줄거리나 인물을 지어내지 않는다.
- 생성 결과는 저장 전에 형식, 길이, 선택지·복합 질문, 공통 반응, 지시형 표현, 중복 종결, 고유어 근거와 한국어 조사를 검사한다. 탈락한 책만 사유를 붙여 자동 재작성한다.

## 근거 자료

- U.S. Department of Education, What Works Clearinghouse, *Preparing Young Children for School – Recommendation 7*: 함께 읽기에서 다단어 답변과 이유를 끌어내는 대화, 아이의 경험 연결, 책의 초점과 정렬된 역할놀이·소도구 활동을 권고한다.  
  https://ies.ed.gov/ncee/wwc/Docs/ReferenceResources/TO4_summary_rec_7.pdf
- U.S. Department of Education, What Works Clearinghouse, *Dialogic Reading*: 성인은 능동적으로 듣고 질문하며 아이가 이야기하는 사람이 되도록 돕는 상호작용식 읽기를 설명한다.  
  https://ies.ed.gov/ncee/wwc/Docs/InterventionReports/wwc_dialogic_reading_042710.pdf
- Harvard Center on the Developing Child, *5 Steps for Brain-Building Serve and Return*: 아이의 관심을 따라 반응하고, 차례를 주고받으며 답할 시간을 기다리는 상호작용을 강조한다.  
  https://developingchild.harvard.edu/resources/briefs/5-steps-for-brain-building-serve-and-return/
- NAEYC, *Serious Fun: How Guided Play Extends Children's Learning*: 학습 목표가 있는 환경 안에서 아이 주도 놀이와 성인 안내의 균형, 성찰을 돕는 질문을 제안한다.  
  https://www.naeyc.org/resources/pubs/books/serious-fun
- OpenAI, *Structured model outputs*: JSON Schema와 `strict: true`를 사용해 출력 형식을 강제한다.  
  https://developers.openai.com/api/docs/guides/structured-outputs

## 출력 계약

- `ageRange`: 책 자체의 권장 연령
- `interactionStrategy`: 코드가 책 정보로 먼저 결정한 상호작용 전략. 추천 테마와는 별개이며 DB에는 저장하지 않는다.
- `bookAnchor`: 제목·소개에 실제로 있는 책 고유 표현. 반응 문장의 근거 확인에만 사용하고 DB에는 저장하지 않는다.
- `parentGuide`: `함께 볼 점 → 열린 질문 2개 → 책별 반응` 순서. 260자 이하이며 부모 감정을 맞히거나 잘잘못을 판단시키는 질문은 제외한다.
- `activities`: 150~230자, 놀이 1개·준비물 최대 3개·방법 2~3단계·아이 주도 설명이나 이야기 만들기. `준비물: ... 방법: ① ...` 형식을 유지한다.

여러 권을 사진으로 등록할 때는 한 번의 모델 호출로 일괄 생성한다. 생성이 실패하면 책과 읽기 기록을 우선 저장하고 가이드만 비워 둔다.

2026-08-18 기준 기존 보유 도서 2,048권의 부모 가이드와 연계 놀이를 이 생성기 기준으로 재생성했다.
