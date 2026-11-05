/** Source-linked teaching metadata. Vectors describe the schematic model only. */
const PINYIN = Object.freeze({
  LU1: 'Zhongfu', LI4: 'Hegu', ST36: 'Zusanli', PC6: 'Neiguan', SP6: 'Sanyinjiao', GV20: 'Baihui',
  GB20: 'Fengchi', LI11: 'Quchi', HT7: 'Shenmen', LR3: 'Taichong', CV4: 'Guanyuan', CV17: 'Danzhong',
});
const finiteVector = vector => Array.isArray(vector) && vector.length === 3 && vector.every(Number.isFinite);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalize = vector => {
  if (!finiteVector(vector)) return null;
  const size = Math.hypot(...vector);
  return size > 1e-9 ? vector.map(value => value / size) : null;
};
const strip = value => String(value || '').replace(/<[^>]*>/g, '').replace(/[*`]/g, '').trim();
const HIGH_RISK = /氣胸|气胸|延髓|延腦|延脑|椎動脈|椎动脉|頸動脈|颈动脉|脊髓|肺臟|肺脏|肺尖|胸肺區|胸肺区|胸膜|椎管|不可深刺|禁深刺|不宜深刺|嚴禁[^。；;]*深刺|严禁[^。；;]*深刺/;
const WARNING = /嚴禁|严禁|禁[用針针灸止忌]|慎用|不宜|不可|避[免開开]|防止|以防|防[傷伤氣气]|注意|危險|危险|過深|过深|誤刺|误刺|孕婦|孕妇|妊娠/;
const ANATOMY = /氣胸|气胸|延髓|延腦|延脑|椎管|肺|胸膜|腹膜|臟器|脏器|內臟|内脏|脊髓|眼球|眼眶|眶緣|眶缘|血管|動脈|动脉|靜脈|静脉|神經|神经|膀胱/;
const DEPTH = /深刺|過深|过深|深度|淺刺|浅刺/;
const CONTRAINDICATION = /孕婦|孕妇|妊娠|禁[用針针灸]|慎用|不宜[^。；;]*[針针灸]/;

export function inferNeedleAngle(method) {
  // Several supported routes cannot be represented by a single enum or vector.
  const text = strip(method);
  const routes = [...new Set([...text.matchAll(/直刺|斜刺|平刺/g)]
    .filter(match => !/(?:嚴禁|严禁|禁止|不可|不宜|忌)[^。；;，,]{0,8}$/.test(text.slice(0, match.index)))
    .map(match => match[0]))];
  return routes.length === 1 ? routes[0] : null;
}

/** An inward unit vector, never a clinical insertion instruction. */
export function deriveNeedleVector(point) {
  const normal = normalize(point.normal);
  if (!normal) return null;
  const method = strip(point.technique?.method);
  const angle = inferNeedleAngle(method);
  if (angle === '直刺') return normal.map(value => value === 0 ? 0 : -value);
  if (angle !== '斜刺' || !/向正中|向脊柱方向/.test(method)) return null;
  const degrees = point.angleDegrees;
  // Numeric evidence must be literal in this point's method, not inferred from a
  // general teaching chapter or a viewer's default oblique angle.
  if (!Number.isFinite(degrees) || degrees <= 0 || degrees >= 90 || !method.match(new RegExp(`${degrees}\\s*[°度]`))) return null;
  if (!finiteVector(point.position) || Math.abs(point.position[0]) < 1e-8) return null;
  const midline = [-Math.sign(point.position[0]), 0, 0];
  const perpendicular = dot(midline, normal);
  const tangent = normalize(midline.map((value, index) => value - normal[index] * perpendicular));
  if (!tangent) return null;
  const radians = degrees * Math.PI / 180;
  return normalize(normal.map((value, index) => -value * Math.sin(radians) + tangent[index] * Math.cos(radians)));
}

function selectedSource(point) {
  const method = strip(point.technique?.method);
  return point.sources?.find(source => source.path === point.technique?.source && strip(source.method) === method)
    || point.sources?.find(source => source.path === point.technique?.source)
    || null;
}

export function sourceDepthValues(point) {
  const method = strip(point.technique?.method);
  const source = selectedSource(point);
  const matches = [...method.matchAll(/(?:\d+(?:\.\d+)?|\.\d+)\s*(?:[~～〜\-—至到]\s*(?:\d+(?:\.\d+)?|\.\d+))?\s*(?:寸|mm\b|毫米|公厘)/gi)];
  return [...new Set(matches.map(match => match[0]))].map(raw => ({
    raw,
    unit: /寸$/.test(raw) ? '寸' : 'mm',
    source: source ? { path: source.path, line: source.line } : null,
  }));
}

function missingInformationOnly(sentence) {
  const missing = sentence.match(/未(?:提及|載明|载明|提供|詳述|详述|記載|记载)/);
  if (!missing) return false;
  // Ignore the subject of the missing-information clause (which can itself say
  // “危險解剖區” or “禁忌”). Only a following clause can add an actual caution.
  const tail = sentence.slice(missing.index + missing[0].length);
  const boundary = tail.search(/[，,（(。；;]|但/);
  if (boundary < 0) return true;
  const following = tail.slice(boundary);
  const concreteCaution = HIGH_RISK.test(following) || ANATOMY.test(following)
    || CONTRAINDICATION.test(following) || /不宜[^。；;]{0,6}深|消毒|痛覺|痛觉|末梢/.test(following);
  return !concreteCaution;
}

export function deriveDanger(point) {
  const warnings = [];
  const seen = new Set();
  for (const source of point.sources || []) {
    for (const field of ['safety', 'method']) {
      const value = strip(source[field]);
      if (!value) continue;
      for (const sentence of value.split(/(?<=[。；;])/).map(text => text.trim()).filter(Boolean)) {
        if (!WARNING.test(sentence) && !HIGH_RISK.test(sentence)) continue;
        // “未提及特殊禁忌” is missing information, never affirmative evidence.
        if (missingInformationOnly(sentence)) continue;
        const kinds = [];
        if (DEPTH.test(sentence)) kinds.push('depth');
        if (ANATOMY.test(sentence)) kinds.push('anatomy');
        if (CONTRAINDICATION.test(sentence)) kinds.push('contraindication');
        if (!kinds.length) kinds.push('anatomy');
        for (const kind of kinds) {
          const key = `${kind}:${source.path}:${source.line}:${sentence}`;
          if (!seen.has(key)) {
            warnings.push({ kind, text: sentence, source: { path: source.path, line: source.line } });
            seen.add(key);
          }
        }
      }
    }
  }
  return {
    dangerWarnings: warnings,
    dangerLevel: warnings.some(warning => HIGH_RISK.test(warning.text)) ? 'high' : warnings.length ? 'caution' : 'unreviewed',
  };
}

/** Recompute derived fields after a manual normal or position change. */
export function withNeedleData(point) {
  const angle = inferNeedleAngle(point.technique?.method);
  const depthValues = sourceDepthValues(point);
  const danger = deriveDanger(point);
  const vector = deriveNeedleVector(point);
  return {
    ...point,
    pinyin: PINYIN[point.id] || null,
    needle_angle: angle,
    depth: depthValues.length ? depthValues.map(value => value.raw).join('；') : null,
    depthValues,
    needleVector: vector,
    vector: vector ? [...vector] : null,
    needleVectorPrecision: vector ? 'schematic' : null,
    docPath: point.technique?.source || point.docs?.[0] || null,
    technique: { ...point.technique, angle, dangerLevel: danger.dangerLevel },
    dangerWarnings: danger.dangerWarnings,
  };
}
