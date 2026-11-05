import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=async name=>JSON.parse(await readFile(path.join(root,'src/data',name),'utf8'));
const points=await read('acupoints.json');
const catalog=await read('docs-catalog.json');
const coverage=await read('coverage.json');
const lookup=name=>points.find(p=>p.name===name);

test('every Markdown source is cataloged without broken acupoint references',async()=>{
 async function walk(dir) {const files=[];for(const e of await readdir(dir,{withFileTypes:true})) {const p=path.join(dir,e.name);if(e.isDirectory())files.push(...await walk(p));else if(e.name.endsWith('.md'))files.push(path.relative(root,p));}return files;}
 assert.deepEqual(catalog.map(d=>d.path).sort(),(await walk(path.join(root,'docs'))).sort());
 const ids=new Set(points.map(p=>p.id));
 assert.equal(ids.size,points.length);
 for(const doc of catalog) for(const id of doc.acupointIds) assert.ok(ids.has(id),`${doc.path}: ${id}`);
 assert.equal(coverage.markdownFiles,catalog.length);
});

test('every indexed point has bounded schematic coordinates, a normal, and an existing source',async()=>{
 const paths=new Set(catalog.map(d=>d.path));
 for(const p of points) {
  assert.equal(p.position.length,3,p.id);
  assert.ok(p.position.every(Number.isFinite),p.id);
  assert.ok(Math.abs(p.position[0])<=1.1&&Math.abs(p.position[1])<=1.82&&Math.abs(p.position[2])<=.35,p.id);
  assert.ok(['schematic','regional'].includes(p.coordinatePrecision),p.id);
  assert.ok(Math.abs(Math.hypot(...p.normal)-1)<1e-9,p.id);
  assert.ok(p.docs.length&&p.docs.every(d=>paths.has(d)),p.id);
  assert.equal(p.reviewStatus,'unreviewed-source-material');
 }
});

test('clinical excerpts remain traceable to exact source rows',async()=>{
 const contents=new Map(await Promise.all(catalog.map(async d=>[d.path,(await readFile(path.join(root,d.path),'utf8')).split(/\r?\n/)])));
 for(const p of points) for(const s of p.sources) {
  const line=contents.get(s.path)[s.line-1];
  assert.ok(s.kind==='prose' ? /^\s*-\s/.test(line) : line?.startsWith('|'),`${p.id}: ${s.path}:${s.line}`);
  const plain=line.replace(/<[^>]*>/g,'').replace(/[*`]/g,'');
  for(const key of ['label','location','method','safety',...(s.kind==='prose'?['excerpt']:[])]) assert.ok(plain.includes(s[key]),`${p.id}: ${key}`);
 }
});

test('individual point summaries use detailed point chapters and preserve safety text',()=>{
 assert.equal(lookup('合谷').id,'LI4');
 assert.equal(lookup('中府').id,'LU1');
 assert.match(lookup('合谷').technique.source,/4\.18\.2/);
 assert.match(lookup('中府').technique.safety,/氣胸/);
 assert.match(lookup('三陰交').technique.safety,/孕婦/);
 assert.equal(lookup('太衝').aliases.includes('太冲'),true);
});

test('ear Shenmen never inherits wrist technique and wrist never inherits ear source rows',()=>{
 const wrist=lookup('神門');const ear=lookup('耳穴・神門');
 assert.equal(wrist.id,'HT7');assert.ok(ear.id.startsWith('EAR-'));
 assert.ok(wrist.sources.every(s=>!s.path.includes('耳穴疗法')));
 assert.ok(ear.sources.every(s=>s.path.includes('耳穴疗法')));
 assert.ok(wrist.sources.filter(s=>s.label==='神門').every(s=>!s.group));
});

test('degree values require literal numeric evidence, while a straight technique does not invent 90 degrees',()=>{
 assert.equal(lookup('合谷').angleDegrees,null);
 for(const p of points) if(p.angleDegrees!==null) {
  assert.ok(Number.isFinite(p.angleDegrees));
  assert.ok(p.angleSource);
  assert.match(p.angleSource.text,new RegExp(`${p.angleDegrees}\\s*[°度]`));
 }
});

test('all individually identified table rows have indexed points',()=>{
 assert.ok(points.length>100);
 assert.ok(lookup('陽白'));
 assert.ok(coverage.excludedRows.every(r=>/未提及|不適用|示範部位|鼻咽管|臍周八針/.test(r.label)),JSON.stringify(coverage.excludedRows));
});


test('prose-only core point descriptions are indexed without borrowing neighboring techniques',()=>{
 const shangyang=lookup('商陽');const guanchong=lookup('關衝');
 assert.equal(guanchong.id,'TE1');
 assert.ok(guanchong.sources.some(s=>s.kind==='prose'&&s.excerpt.includes('無名指')));
 assert.match(shangyang.technique.location,/食指橈側末端/);
 assert.match(guanchong.technique.method,/未提供/);
 assert.equal(guanchong.angleDegrees,null);
 for(const name of ['雲門','陽溪','陽池','解溪','衝陽','二間'])assert.ok(lookup(name),name);
 assert.ok(lookup('合谷').sources.some(s=>s.kind==='prose'&&s.path.includes('4.2手')));
});

test('schematic positions are fitted to mannequin surfaces and preserve posterior and medial orientations',()=>{
 for(const p of points)assert.ok(p.surfaceProjection,`${p.id} could not project to the selected mannequin surface`);
 assert.equal(lookup('合谷').surfaceProjection,'Palm 1');
 assert.deepEqual(lookup('合谷').normal,[0,0,-1]);
 assert.deepEqual(lookup('外關').normal,[0,0,-1]);
 assert.deepEqual(lookup('三陰交').normal,[-1,0,0]);
 assert.deepEqual(lookup('太溪').normal,[-1,0,0]);
 for(const name of ['大椎','腎俞','肺俞','委中']) {
  assert.ok(lookup(name).position[2]<0,name);
  assert.deepEqual(lookup(name).normal,[0,0,-1]);
 }
 assert.equal(lookup('中府').surfaceProjection,'Continuous torso and neck');
 assert.deepEqual(lookup('中府').normal,[0,0,1]);
});
