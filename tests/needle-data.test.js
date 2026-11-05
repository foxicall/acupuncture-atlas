import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { withNeedleData, deriveNeedleVector, inferNeedleAngle, sourceDepthValues, deriveDanger } from '../src/lib/needle-data.js';
import { mergeCalibration } from '../src/lib/calibration.js';

const points=JSON.parse(await readFile(new URL('../src/data/acupoints.json',import.meta.url),'utf8'));
const byId=id=>points.find(point=>point.id===id);

test('new metadata is present across the complete catalog without inventing pinyin or numeric angles',()=>{
 assert.equal(byId('LI4').pinyin,'Hegu');
 assert.equal(byId('LU1').pinyin,'Zhongfu');
 assert.equal(points.filter(point=>point.pinyin!==null).length,12);
 assert.equal(byId('ST12').pinyin,null);
 for(const point of points){
  assert.ok(['直刺','斜刺','平刺',null].includes(point.needle_angle));
  assert.equal(point.technique.angle,point.needle_angle);
  assert.ok(['high','caution','unreviewed'].includes(point.technique.dangerLevel));
  assert.ok(point.depth===null||typeof point.depth==='string');
  assert.equal(point.docPath,point.technique.source||point.docs[0]);
  assert.equal(point.angleDegrees===null||Number.isFinite(point.angleDegrees),true);
 }
 assert.equal(byId('LI4').angleDegrees,null);
 assert.equal(byId('LI4').needle_angle,'直刺');
});

test('straight insertion is inward; unspecified oblique routes and mixed routes remain unvisualized',()=>{
 assert.deepEqual(byId('LI4').needleVector,[0,0,1]);
 assert.deepEqual(byId('LI4').vector,byId('LI4').needleVector);
 assert.equal(byId('LI4').needleVectorPrecision,'schematic');
 assert.equal(byId('GB20').needleVector,null);
 assert.equal(byId('LU1').needle_angle,null);
 assert.equal(byId('LU1').needleVector,null);
 assert.equal(inferNeedleAngle('直刺或斜刺0.5寸'),null);
 assert.equal(inferNeedleAngle('嚴禁向上直刺'),null);
 assert.equal(inferNeedleAngle('不可直刺，應斜刺'), '斜刺');
 assert.equal(deriveNeedleVector({normal:[0,0,1],position:[.2,.3,0],angleDegrees:45,technique:{method:'向上斜刺45°'}}),null);
 assert.equal(deriveNeedleVector({normal:[0,0,0],technique:{method:'直刺'}}),null);
 for(const point of points)if(point.needleVector){
  assert.ok(Math.abs(Math.hypot(...point.needleVector)-1)<1e-9,point.id);
  const inwardDot=point.needleVector.reduce((n,v,k)=>n+v*point.normal[k],0);
  assert.ok(inwardDot<0,point.id);
 }
});

test('literal midline oblique data yields only a schematic inward and medial vector',()=>{
 const point=byId('EX-B2');
 assert.equal(point.angleDegrees,45);
 assert.equal(point.needle_angle,'斜刺');
 assert.ok(point.needleVector[0]<0);
 assert.ok(point.needleVector[2]>0);
 assert.equal(point.needleVectorPrecision,'schematic');
 assert.equal(deriveNeedleVector({...point,angleDegrees:null}),null);
 assert.equal(deriveNeedleVector({...point,position:[0,...point.position.slice(1)]}),null);
});

test('raw depth units and source references survive without unit conversion or condition removal',()=>{
 assert.equal(byId('LI4').depth,'0.5~1.0 寸');
 assert.equal(byId('LI4').technique.depth,byId('LI4').technique.method);
 assert.match(byId('LI4').technique.depth,/透刺後溪/);
 assert.equal(byId('ST12').depth,null);
 const synthetic=withNeedleData({id:'test',normal:[0,0,1],position:[0,0,0],docs:['source.md'],technique:{method:'直刺 2~3 mm，或淺刺1毫米。',source:'source.md'},sources:[{path:'source.md',line:9,method:'直刺 2~3 mm，或淺刺1毫米。',safety:''}]});
 assert.deepEqual(sourceDepthValues(synthetic),[
  {raw:'2~3 mm',unit:'mm',source:{path:'source.md',line:9}},
  {raw:'1毫米',unit:'mm',source:{path:'source.md',line:9}},
 ]);
});

test('requested high-risk points have warning evidence in actual Markdown sources',async()=>{
 for(const id of ['ST12','GB20','GV15','GB21']){
  const point=byId(id);assert.ok(point,id);
  assert.equal(point.technique.dangerLevel,'high',id);
  assert.ok(point.dangerWarnings.length,id);
  for(const warning of point.dangerWarnings){
   assert.ok(['depth','anatomy','contraindication'].includes(warning.kind));
   const raw=(await readFile(fileURLToPath(new URL('../'+warning.source.path,import.meta.url)),'utf8')).split(/\r?\n/)[warning.source.line-1];
   const plain=raw.replace(/<[^>]*>/g,'').replace(/[*`]/g,'');
   assert.ok(plain.includes(warning.text),`${id}: ${warning.source.path}:${warning.source.line}`);
  }
 }
 assert.ok(byId('LI4').dangerWarnings.some(warning=>warning.kind==='contraindication'&&warning.text.includes('孕婦')));
 assert.equal(byId('LU2').technique.dangerLevel,'unreviewed');
});

test('manual calibration updates vectors after normal change and preserves all warning and source data',()=>{
 const original=byId('LI4');
 const result=mergeCalibration(points,[{id:'LI4',position:[.9,-.5,.02],normal:[0,1,0]}]);
 const edited=result.find(point=>point.id==='LI4');
 assert.equal(edited.coordinatePrecision,'manual');
 assert.deepEqual(edited.needleVector,[0,-1,0]);
 assert.deepEqual(edited.vector,[0,-1,0]);
 assert.deepEqual(edited.technique,original.technique);
 assert.deepEqual(edited.sources,original.sources);
 assert.deepEqual(edited.docs,original.docs);
 assert.deepEqual(edited.dangerWarnings,original.dangerWarnings);
 assert.equal('surfaceProjection'in edited,false);
});


test('missing-information headings are not cautions, while actual cautions in following clauses remain',()=>{
 const classify=text=>deriveDanger({sources:[{path:'source.md',line:7,method:'',safety:text}]});
 for(const text of [
  '解剖危險區與刺灸深度禁忌：影片未提及。',
  '安全注意：教材未載明。',
  '影片未提及特殊危險解剖區。',
  '（影片未提及具体解剖，临床规范需注意）',
  '（影片未提及特殊禁忌，常规针刺即可）',
 ]) {
  assert.deepEqual(classify(text),{dangerWarnings:[],dangerLevel:'unreviewed'},text);
 }
 for(const [text,level] of [
  ['影片未提及（臨床常規需防氣胸）','high'],
  ['影片未提及特殊禁忌，但臨床操作亦不宜過深。','caution'],
  ['安全注意：教材未載明，孕婦慎用。','caution'],
  ['孕婦不宜針（因研究發現針刺合谷會促進子宮收縮）。','caution'],
 ]) {
  const result=classify(text);
  assert.equal(result.dangerLevel,level,text);
  assert.ok(result.dangerWarnings.some(warning=>warning.text===text),text);
 }
});
