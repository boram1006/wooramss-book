const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const valueOf = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const inputDir = valueOf('--input-dir', path.resolve('reports/taxonomy-audit'));
const outputDir = valueOf('--output-dir', path.resolve('reports/taxonomy-audit'));
const docsDir = valueOf('--docs-dir', path.resolve('docs'));

const axes = ['subject', 'interest', 'form', 'context', 'metadata'];
const emptyAxes = () => Object.fromEntries(axes.map((axis) => [axis, []]));
const cloneAxes = (value = {}) => Object.fromEntries(
  axes.map((axis) => [axis, [...(value[axis] || [])]])
);
const hasDeferredAddition = (item) => axes.some(
  (axis) => (item.recommendation?.deferredAdditions?.[axis] || []).length > 0
);
const keyOf = (title, axis, target) => `${title}\u0000${axis}\u0000${target}`;

// Only additions whose meaning is stated directly in the title/description are
// accepted here. Everything else is rejected or, when description is absent,
// left as a small residual for source enrichment.
const acceptedAdditionKeys = new Set([
  ['내 꿈은 말이야!', 'context', '사회적 민감 맥락'],
  ['전쟁 속에도 우리는', 'context', '사회적 민감 맥락'],
  ['신기료 장수 아이들의 멋진 크리스마스', 'context', '사회적 민감 맥락'],
  ['우리를 기다려 주세요', 'context', '사회적 민감 맥락'],
  ['키는 작아도 별은 볼 수 있어요!', 'context', '사회적 민감 맥락'],
  ['케이블카 메이벨', 'context', '사회적 민감 맥락'],
  ['소금 행진과 간디', 'context', '사회적 민감 맥락'],
  ['내 탓이 아니야', 'context', '사회적 민감 맥락'],
  ['에덴 호텔에서는 두 발로 걸어 주세요', 'context', '사회적 민감 맥락'],
  ['내 어깨 위 두 친구', 'context', '사회적 민감 맥락'],
  ['프레드가 옷을 입어요', 'context', '사회적 민감 맥락'],
  ['우리 아이 감성 쑥쑥 동시 성경', 'context', '사회적 민감 맥락'],
  ['콩닥콩닥 마음이 어때요?', 'context', '사회적 민감 맥락'],
  ['아직도 궁금해?', 'context', '사회적 민감 맥락'],
  ['우리에겐 권리가 있어!', 'context', '사회적 민감 맥락'],
  ['위대한 아파투라일리아', 'context', '사회적 민감 맥락'],
  ['시금치가 울고 있어요', 'context', '사회적 민감 맥락'],
  ['토마토라고 놀리지 마!', 'context', '사회적 민감 맥락'],
  ['종이 소년', 'context', '사회적 민감 맥락'],
  ['이 뼈를 모두 누가 찾았게?', 'interest', '사회·경제·직업'],
  ['우리들의 특별한 축제', 'subject', '상상·판타지'],
  ['우리들의 특별한 축제', 'subject', '문제해결'],
  ['꿀꿀 돼지', 'subject', '책임·자기조절'],
  ['이상한 나뭇잎', 'subject', '책임·자기조절'],
  ['우리 동네 한 바퀴', 'interest', '탈것·도시'],
  ['몹시 큰 초대장', 'subject', '의사소통'],
  ['나는 커서 어떤 일을 할까?', 'interest', '사회·경제·직업'],
].map(([title, axis, target]) => keyOf(title, axis, target)));

// Descriptions that only contain marketing/award copy do not provide enough
// evidence to confirm a sensitive-content flag.
const forcedResidualAdditionKeys = new Set([
  keyOf('숨을 참는 아이', 'context', '사회적 민감 맥락'),
]);

// Used only to explain that an expression is already represented by an
// existing category. It never creates a new taxonomy link.
const coverageRules = [
  { re: /감사|따뜻함|관계의온기|선물/, axis: 'subject', targets: ['배려·나눔', '공감·위로'] },
  { re: /겁쟁이|고난|도망|처음|힘/, axis: 'subject', targets: ['용기·도전', '성장·자립'] },
  { re: /고민|기대|실망|긴장|눈물|설렘|아픔|감성|안정감|행복/, axis: 'subject', targets: ['감정 이해', '공감·위로'] },
  { re: /기다림|선택|실수|약속|행동|집중|욕심|경쟁|겨루기|내기/, axis: 'subject', targets: ['책임·자기조절'] },
  { re: /교감|교신|목소리|대답|진심|진정성|침묵|언어/, axis: 'subject', targets: ['의사소통'] },
  { re: /긍정|자기감각|소중함|삶의 가치|삶의 의미/, axis: 'subject', targets: ['자존감·나다움'] },
  { re: /수용|닮음|이방인|관점|시선/, axis: 'subject', targets: ['다양성·존중'] },
  { re: /관계|만남|연결|함께|응원|신뢰|믿음/, axis: 'subject', targets: ['친구·우정', '이웃·공동체', '공감·위로'] },
  { re: /창조|기발|재치|표현/, axis: 'subject', targets: ['예술·창작', '문제해결', '유머·말놀이'] },
  { re: /질문|탐색|지식|발견/, axis: 'interest', targets: ['과학·탐구'] },
  { re: /선생님|학생|공사|직업/, axis: 'interest', targets: ['사회·경제·직업'] },
  { re: /집|공간|방|동네|거리|공원/, axis: 'interest', targets: ['탈것·도시'] },
  { re: /나무|숲|하늘|바람|땅|계절|단풍/, axis: 'interest', targets: ['자연·계절'] },
  { re: /동물|사냥|먹이|뼈|알/, axis: 'interest', targets: ['동물·생명'] },
  { re: /말놀이|소리|반복|연상/, axis: 'form', targets: ['말놀이·소리', '반복·패턴'] },
  { re: /가출|이사|새집|돌아옴|처음/, axis: 'context', targets: ['생활 전환·적응'] },
  { re: /평화|전쟁|권리|왕따|따돌림|장애|트라우마/, axis: 'context', targets: ['사회적 민감 맥락', '전쟁·재난'] },
];

const batches = [];
for (let index = 1; index <= 14; index += 1) {
  const name = `taxonomy-approval-batch-${String(index).padStart(2, '0')}-reviewed-v2.json`;
  const file = path.join(inputDir, name);
  batches.push({ name, data: JSON.parse(fs.readFileSync(file, 'utf8')) });
}

const candidates = batches.flatMap(({ name, data }) => data.items
  .filter((item) => (item.recommendation?.deferredExpressions || []).length || hasDeferredAddition(item))
  .map((item) => ({ sourceBatch: name, item }))
);

const results = candidates.map(({ sourceBatch, item }) => {
  const recommendation = item.recommendation;
  const after = cloneAxes(recommendation.recommendedAfter);
  const acceptedAdditions = emptyAxes();
  const rejectedAdditions = emptyAxes();
  const residualAdditions = emptyAxes();
  const missingDescription = !String(item.description || '').trim();

  for (const axis of axes) {
    for (const target of recommendation.deferredAdditions?.[axis] || []) {
      const key = keyOf(item.title, axis, target);
      if (missingDescription || forcedResidualAdditionKeys.has(key)) {
        residualAdditions[axis].push(target);
      } else if (acceptedAdditionKeys.has(key)) {
        acceptedAdditions[axis].push(target);
        if (!after[axis].includes(target)) after[axis].push(target);
      } else {
        rejectedAdditions[axis].push(target);
      }
    }
  }

  const coveredExpressions = [];
  const excludedExpressions = [];
  const residualExpressions = [];
  for (const expression of recommendation.deferredExpressions || []) {
    if (missingDescription) {
      residualExpressions.push(expression);
      continue;
    }
    const rule = coverageRules.find((candidate) => candidate.re.test(expression));
    const coveredBy = rule
      ? rule.targets.filter((target) => after[rule.axis].includes(target))
      : [];
    if (coveredBy.length) {
      coveredExpressions.push({ expression, axis: rule.axis, coveredBy });
    } else {
      excludedExpressions.push({
        expression,
        reason: '세부 소재·사물명·수식어·일반어 또는 표준 분류축과 직접 대응하지 않는 표현',
      });
    }
  }

  const residualCount = residualExpressions.length
    + axes.reduce((sum, axis) => sum + residualAdditions[axis].length, 0);
  const acceptedCount = axes.reduce((sum, axis) => sum + acceptedAdditions[axis].length, 0);

  return {
    id: item.id,
    isbn: item.isbn,
    title: item.title,
    description: item.description,
    sourceBatch,
    secondPass: {
      status: residualCount ? 'needs-source-enrichment' : 'codex-reviewed',
      decision: residualCount ? 'defer-residual' : 'approve-second-pass',
      acceptedAdditions,
      rejectedAdditions,
      coveredExpressions,
      excludedExpressions,
      residualExpressions,
      residualAdditions,
      recommendedAfter: after,
      rationale: residualCount
        ? '소개글이 없거나 분류 근거가 부족해 최소 잔여 항목으로 보류했다.'
        : acceptedCount
          ? '제목·소개글에 직접 드러난 의미만 추가 승인하고 나머지 표현은 기존 분류로 해소하거나 분류 비대상으로 제외했다.'
          : '기존 분류가 책의 핵심 의미를 이미 포괄한다. 남은 표현은 별도 분류 링크가 필요 없는 세부 소재·일반어로 판정했다.',
      reviewedBy: 'Codex title-description second-pass semantic review',
    },
  };
});

const sumAxisValues = (field) => Object.fromEntries(axes.map((axis) => [
  axis,
  results.reduce((sum, result) => sum + result.secondPass[field][axis].length, 0),
]));
const residual = results.filter((result) => result.secondPass.status === 'needs-source-enrichment');
const acceptedByAxis = sumAxisValues('acceptedAdditions');
const rejectedByAxis = sumAxisValues('rejectedAdditions');
const residualAdditionsByAxis = sumAxisValues('residualAdditions');
const summary = {
  reviewedBooks: results.length,
  completedBooks: results.length - residual.length,
  residualBooks: residual.length,
  deferredExpressionOccurrencesBefore: results.reduce((sum, result) => sum
    + result.secondPass.coveredExpressions.length
    + result.secondPass.excludedExpressions.length
    + result.secondPass.residualExpressions.length, 0),
  expressionsCoveredByExistingTaxonomy: results.reduce((sum, result) => sum + result.secondPass.coveredExpressions.length, 0),
  expressionsExcludedAsNonTaxonomyTerms: results.reduce((sum, result) => sum + result.secondPass.excludedExpressions.length, 0),
  residualExpressionOccurrences: results.reduce((sum, result) => sum + result.secondPass.residualExpressions.length, 0),
  acceptedAdditionsByAxis: acceptedByAxis,
  acceptedAdditionsTotal: Object.values(acceptedByAxis).reduce((sum, value) => sum + value, 0),
  rejectedAdditionsByAxis: rejectedByAxis,
  rejectedAdditionsTotal: Object.values(rejectedByAxis).reduce((sum, value) => sum + value, 0),
  residualAdditionsByAxis: residualAdditionsByAxis,
  residualAdditionsTotal: Object.values(residualAdditionsByAxis).reduce((sum, value) => sum + value, 0),
};

const output = {
  generatedAt: new Date().toISOString(),
  purpose: '1차 승인 배치에서 보류된 책·표현 전체의 제목·소개글 기반 2차 의미 검수',
  taxonomyVersion: '2.0-draft.3',
  policy: {
    additiveOnly: true,
    preserveExistingCategories: true,
    acceptanceRule: '제목·소개글에 핵심 주제 또는 맥락이 직접 명시된 경우만 추가',
    exclusionRule: '세부 소재·사물명·수식어·일반어·오탈자는 표준 분류 링크를 만들지 않음',
    residualRule: '소개글 없음 또는 민감 맥락 판단 근거 부족',
  },
  summary,
  residualBookIds: residual.map((result) => result.id),
  items: results,
};

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });
const jsonPath = path.join(outputDir, 'taxonomy-deferred-second-pass-v2.json');
fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`);

const acceptedRows = results.flatMap((result) => axes.flatMap((axis) =>
  result.secondPass.acceptedAdditions[axis].map((target) => `| ${result.title} | ${axis} | ${target} |`)
));
const residualRows = residual.map((result) => {
  const expressions = result.secondPass.residualExpressions.join(', ') || '-';
  const additions = axes.flatMap((axis) => result.secondPass.residualAdditions[axis]
    .map((target) => `${axis}:${target}`)).join(', ') || '-';
  return `| ${result.title} | ${expressions} | ${additions} |`;
});
const markdown = `# 미분류 표현 2차 전수 검수 결과\n\n`
  + `- 검수 책: ${summary.reviewedBooks}권\n`
  + `- 자동 확정 가능한 책: ${summary.completedBooks}권\n`
  + `- 자료 보강이 필요한 최종 잔여: ${summary.residualBooks}권\n`
  + `- 기존 분류로 의미가 이미 포괄된 표현: ${summary.expressionsCoveredByExistingTaxonomy}건\n`
  + `- 분류 비대상으로 제외한 표현: ${summary.expressionsExcludedAsNonTaxonomyTerms}건\n`
  + `- 잔여 표현: ${summary.residualExpressionOccurrences}건\n`
  + `- 새로 승인한 분류 링크: ${summary.acceptedAdditionsTotal}건\n`
  + `- 근거 부족·오탐으로 거절한 분류 링크: ${summary.rejectedAdditionsTotal}건\n\n`
  + `## 새 승인 링크\n\n| 책 | 축 | 분류 |\n|---|---|---|\n${acceptedRows.join('\n')}\n\n`
  + `## 최종 잔여\n\n| 책 | 잔여 표현 | 잔여 추가 분류 |\n|---|---|---|\n${residualRows.join('\n')}\n\n`
  + `## 판정 원칙\n\n기존 26개 분류와 이미 승인된 신규 분류는 변경하거나 삭제하지 않았다. 제목과 소개글에 직접 드러난 핵심 의미만 추가 승인했으며, 사물명·장식어·일반어·오탈자는 독립된 분류로 만들지 않았다. 소개글이 없는 책과 소개글만으로 민감 맥락을 확정할 수 없는 책만 잔여로 남겼다.\n`;
const markdownPath = path.join(docsDir, 'theme-taxonomy-deferred-second-pass.md');
fs.writeFileSync(markdownPath, markdown);

console.log(JSON.stringify({ jsonPath, markdownPath, summary, residual: residual.map((item) => item.title) }, null, 2));
