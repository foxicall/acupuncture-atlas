/** Search vocabulary only: every assignment retains the original teaching row. */
export const SYMPTOMS = [
  { label: '頭痛', categories: ['頭面五官', '神經疼痛'], pattern: /頭痛|头痛/ },
  { label: '偏頭痛', categories: ['頭面五官', '神經疼痛'], pattern: /偏頭痛|偏头痛/ },
  { label: '牙痛', categories: ['頭面五官', '神經疼痛'], pattern: /牙痛|齒痛|齿痛/ },
  { label: '失眠', categories: ['神經疼痛'], pattern: /失眠|不寐/ },
  { label: '胃痛', categories: ['胸腹消化'], pattern: /胃痛|胃脘痛/ },
  { label: '腰痛', categories: ['神經疼痛'], pattern: /腰[^。；;，,]{0,6}[痛痹痺]|腰肌勞損|腰肌劳损/ },
  { label: '肩頸僵硬', categories: ['神經疼痛'], pattern: /[肩頸颈項项][^。；;，,]{0,8}[痛痹痺僵強强]|落枕/ },
  { label: '面癱', categories: ['頭面五官', '神經疼痛'], pattern: /面癱|面瘫|口眼[歪喎]斜|口歪/ },
  { label: '感冒發熱', categories: ['頭面五官'], pattern: /感冒|外感|發熱|发热|高熱|高热/ },
  { label: '消化不良', categories: ['胸腹消化'], pattern: /消化不良|消化異常|消化异常|食積|食积|疳積|疳积/ },
  { label: '便秘', categories: ['胸腹消化'], pattern: /便秘|便祕/ },
  { label: '腹痛', categories: ['胸腹消化'], pattern: /腹痛/ },
  { label: '腹瀉', categories: ['胸腹消化'], pattern: /腹瀉|腹泻|泄瀉|泄泻|久泄|久瀉/ },
  { label: '噁心嘔吐', categories: ['胸腹消化'], pattern: /嘔吐|呕吐|噁心|恶心/ },
  { label: '咳嗽氣喘', categories: ['胸腹消化'], pattern: /咳嗽|氣喘|气喘|哮喘/ },
  { label: '痛經', categories: ['婦兒雜病'], pattern: /痛經|痛经/ },
  { label: '月經不調', categories: ['婦兒雜病'], pattern: /月經不調|月经不调/ },
  { label: '耳鳴', categories: ['頭面五官'], pattern: /耳鳴|耳鸣/ },
];
export const SYMPTOM_CATEGORIES = ['頭面五官', '胸腹消化', '神經疼痛', '婦兒雜病'];
export const TECHNIQUES = ['直刺', '斜刺', '平刺/橫刺', '瀉法', '強刺激瀉法', '補法', '平補平瀉', '點刺放血', '透刺'];
const ROUTES = ['直刺', '斜刺', '平刺/橫刺'];
const techniquePatterns = [
  ['直刺', /直刺/], ['斜刺', /斜刺/], ['平刺/橫刺', /平刺|橫刺|横刺/],
  ['平補平瀉', /平[補补]平[瀉泻]/], ['點刺放血', /[點点]刺(?:放血|出血)|刺[絡络][^。；;]*放血/],
  ['透刺', /透刺/], ['瀉法', /[瀉泻]法/], ['補法', /[補补]法/],
  ['強刺激瀉法', /強刺激[^。；;]*[瀉泻]|强刺激[^。；;]*[瀉泻]|[瀉泻]法[^。；;]*[強强]刺激/],
];
const chapterSymptoms = new Map([
  ['7.1', '胃痛'], ['7.2', '便秘'], ['7.3', '失眠'], ['7.6', '偏頭痛'], ['7.7', '痛經'], ['7.9', '感冒發熱'],
]);
const unique = values => [...new Set(values)];
const strip = value => String(value || '').replace(/<[^>]*>/g, '').replace(/[*`]/g, '').trim();
export function techniqueSummaryLabel(evidence) {
  if (!['補法', '瀉法'].includes(evidence.label)) return evidence.label;
  const action = evidence.label === '補法' ? '[補补]' : '[瀉泻]';
  const specifics = [...affirmativeClauses(evidence.text).matchAll(new RegExp(`(?:提插|[捻撚][轉转])${action}法`, 'g'))].map(match => match[0].replace(/[撚]/g, '捻').replace(/转/g, '轉').replace(/补/g, '補').replace(/泻/g, '瀉'));
  return unique(specifics).join(' / ') || evidence.label;
}
// Never turn a prohibition or a missing-information sentence into a supported method.
function affirmativeClauses(value) {
  return strip(value).split(/[。；;，,（）()]/).filter(clause => !/禁|不可|不宜|不應|不应|避免|不作|不做|不採|不采|勿|切勿|未提及|未載明|未载明|未詳|未详|未提供|未記載|未记载|應為|应为/.test(clause)).join('；');
}
export function withClinicalIndex(point) {
  const indicationEvidence = [];
  const techniqueEvidence = [];
  for (const source of point.sources || []) {
    if (source.kind) continue;
    const chapter = source.path.match(/\/([0-9]+\.[0-9]+)[^0-9]/)?.[1];
    const context = chapterSymptoms.get(chapter);
    const indicationText = affirmativeClauses(source.indications);
    const tags = SYMPTOMS.filter(s => s.pattern.test(indicationText)).map(s => s.label);
    if (context) tags.push(context);
    if (tags.includes('偏頭痛')) tags.push('頭痛');
    for (const label of unique(tags)) indicationEvidence.push({ label, path: source.path, line: source.line, group: source.group, context: context || null, text: source.indications });
    const method = affirmativeClauses(source.method);
    for (const [label, pattern] of techniquePatterns) {
      // A shared row can describe different routes for different points; do not
      // flatten it into a point-specific insertion direction or through-needling.
      if (source.group && [...ROUTES, '透刺'].includes(label)) continue;
      if (pattern.test(method)) techniqueEvidence.push({ label, path: source.path, line: source.line, group: source.group, context: source.indications, text: source.method });
    }
  }
  const indications = SYMPTOMS.map(s => s.label).filter(label => indicationEvidence.some(e => e.label === label));
  const techniqueType = TECHNIQUES.filter(label => techniqueEvidence.some(e => e.label === label));
  const selectedMethod = affirmativeClauses(point.technique?.method);
  const routes = techniquePatterns.filter(([label, pattern]) => ROUTES.includes(label) && pattern.test(selectedMethod)).map(([label]) => label);
  const manipulation = techniqueType.filter(label => ![...ROUTES, '透刺', '點刺放血'].includes(label));
  return {
    ...point, indications,
    symptomCategories: SYMPTOM_CATEGORIES.filter(category => SYMPTOMS.some(s => indications.includes(s.label) && s.categories.includes(category))),
    techniqueType, indicationEvidence, techniqueEvidence,
    technique: { ...point.technique, type: point.technique?.group ? null : routes.join(' / ') || null, manipulation },
  };
}

const searchPairs = [['头','頭'],['颈','頸'],['齿','齒'],['痛经','痛經'],['面瘫','面癱'],['气','氣'],['泻','瀉'],['补','補'],['针','針'],['横','橫'],['发','發']];
export function normalizeClinical(value) {
  let normalized = String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  for (const [from, to] of searchPairs) normalized = normalized.replaceAll(from, to);
  return normalized.replace(/齒痛/g, '牙痛').replace(/不寐/g, '失眠');
}
export function matchesClinical(point, filter = {}) {
  if (filter.category && !point.symptomCategories?.includes(filter.category)) return false;
  if (!filter.value) return true;
  return (filter.mode === 'technique' ? point.techniqueType : point.indications)?.includes(filter.value) || false;
}
export function matchesPointQuery(point, query) {
  const needle = normalizeClinical(query);
  return !needle || normalizeClinical([point.id, point.name, point.pinyin, point.meridian, ...(point.aliases || []), ...(point.indications || []), ...(point.symptomCategories || []), ...(point.techniqueType || []), point.technique?.location].join(' ')).includes(needle);
}
export function symptomSuggestions(points, query) {
  const needle = normalizeClinical(query);
  if (!needle) return [];
  return SYMPTOMS.filter(s => normalizeClinical(s.label).includes(needle)).map(s => ({ label: s.label, points: points.filter(p => p.indications?.includes(s.label)) })).filter(group => group.points.length);
}
