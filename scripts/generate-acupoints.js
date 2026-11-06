import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mergeCalibration, parseCalibration } from '../src/lib/calibration.js';
import { withNeedleData } from '../src/lib/needle-data.js';
import { withClinicalIndex } from '../src/lib/clinical-index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataDir = path.join(root, 'src/data');
const docsDir = path.join(root, 'docs');
const meridians = {
  LU:'手太陰肺經', LI:'手陽明大腸經', ST:'足陽明胃經', SP:'足太陰脾經', HT:'手少陰心經', SI:'手太陽小腸經',
  BL:'足太陽膀胱經', KI:'足少陰腎經', PC:'手厥陰心包經', TE:'手少陽三焦經', GB:'足少陽膽經', LR:'足厥陰肝經',
  CV:'任脈', GV:'督脈', EX:'經外奇穴', EAR:'耳穴', OTHER:'教材舉例穴位',
};
// Representative points on the right side of a symmetric teaching mannequin.
// These are authored schematic display coordinates, never measured anatomical data.
const seeds = [
 ['LU1','中府',.34,.83,.205],['LU2','雲門',.35,.94,.18],['LU5','尺澤',.69,.29,.09],['LU7','列缺',.83,-.23,.095],['LU10','魚際',.86,-.48,.105],['LU11','少商',.786,-.56,.084],
 ['LI1','商陽',.875,-.692,.06],['LI2','二間',.872,-.57,.06],['LI4','合谷',.91,-.48,.02],['LI5','陽溪',.84,-.34,.03],['LI10','手三里',.75,.16,.04],['LI11','曲池',.71,.30,.03],['LI15','肩髃',.49,.91,.05],['LI20','迎香',.055,1.40,.235],
 ['ST1','承泣',.07,1.48,.22],['ST6','頰車',.14,1.34,.14],['ST8','頭維',.13,1.62,.12],['ST12','缺盆',.22,.99,.13],['ST21','梁門',.13,.37,.21],['ST25','天樞',.14,.03,.23],['ST27','大巨',.14,-.10,.22],['ST28','水道',.14,-.19,.20],['ST29','歸來',.14,-.29,.18],['ST34','梁丘',.29,-.74,.14],['ST35','犢鼻',.29,-.94,.13],['ST36','足三里',.29,-1.09,.13],['ST37','上巨虛',.29,-1.23,.12],['ST40','豐隆',.32,-1.30,.095],['ST41','解溪',.244,-1.61,.10],['ST42','衝陽',.244,-1.68,.17],['ST44','內庭',.22,-1.71,.21],['ST45','厲兌',.22,-1.73,.27],
 ['SP1','隱白',.19,-1.72,.25],['SP3','太白',.17,-1.69,.13],['SP4','公孫',.15,-1.68,.06],['SP6','三陰交',.18,-1.43,.02],['SP8','地機',.18,-1.17,.05],['SP9','陰陵泉',.18,-1.02,.07],['SP10','血海',.18,-.77,.14],['SP15','大橫',.27,.03,.20],['SP21','大包',.38,.55,.01],
 ['HT1','極泉',.45,.77,.03],['HT6','陰郄',.84,-.24,.075],['HT7','神門',.85,-.32,.08],['HT9','少衝',.968,-.686,.06],
 ['SI1','少澤',.977,-.695,.06],['SI3','後溪',.955,-.50,.056],['SI6','養老',.86,-.29,-.025],['SI9','肩貞',.48,.77,-.11],['SI11','天宗',.30,.75,-.20],['SI19','聽宮',.16,1.44,.05],
 ['BL1','睛明',.035,1.49,.22],['BL2','攢竹',.045,1.54,.22],['BL10','天柱',.09,1.17,-.14],['BL11','大杼',.10,.98,-.16],['BL12','風門',.10,.91,-.18],['BL13','肺俞',.10,.85,-.20],['BL15','心俞',.10,.70,-.21],['BL17','膈俞',.10,.55,-.20],['BL18','肝俞',.10,.39,-.19],['BL19','膽俞',.10,.31,-.18],['BL20','脾俞',.10,.24,-.18],['BL21','胃俞',.10,.16,-.18],['BL23','腎俞',.10,-.02,-.18],['BL25','大腸俞',.10,-.19,-.19],['BL32','次髎',.09,-.31,-.20],['BL36','承扶',.25,-.43,-.16],['BL40','委中',.24,-.96,-.11],['BL54','秩邊',.29,-.27,-.21],['BL57','承山',.24,-1.30,-.12],['BL60','崑崙',.31,-1.62,-.03],['BL62','申脈',.32,-1.66,.02],['BL67','至陰',.32,-1.72,.24],
 ['KI1','涌泉',.23,-1.76,.12],['KI3','太溪',.17,-1.62,-.02],['KI6','照海',.16,-1.66,.035],
 ['PC1','天池',.25,.69,.21],['PC3','曲澤',.69,.29,.10],['PC6','內關',.82,-.18,.10],['PC8','勞宮',.94,-.48,.10],['PC9','中衝',.909,-.74,.06],
 ['TE1','關衝',.943,-.715,.06],['TE4','陽池',.85,-.34,.02],['TE3','中渚',.93,-.53,.02],['TE5','外關',.82,-.18,-.04],['TE6','支溝',.81,-.12,-.04],['TE14','肩髎',.48,.90,-.06],['TE21','耳門',.17,1.49,.04],['TE23','絲竹空',.12,1.54,.19],
 ['GB1','瞳子髎',.12,1.48,.18],['GB2','聽會',.15,1.40,.04],['GB8','率谷',.17,1.62,.01],['GB14','陽白',.07,1.62,.19],['GB20','風池',.095,1.22,-.14],['GB21','肩井',.36,1.01,-.03],['GB24','日月',.26,.46,.19],['GB30','環跳',.34,-.29,-.08],['GB33','膝陽關',.32,-.88,-.01],['GB34','陽陵泉',.32,-1.02,.04],['GB40','丘墟',.32,-1.61,.08],['GB41','足臨泣',.30,-1.69,.15],['GB44','足竅陰',.29,-1.73,.26],
 ['LR1','大敦',.19,-1.72,.24],['LR2','行間',.18,-1.70,.21],['LR3','太衝',.19,-1.69,.15],['LR4','中封',.215,-1.60,.10],['LR13','章門',.30,.35,.13],['LR14','期門',.24,.53,.21],
 ['CV1','會陰',0,-.43,0],['CV3','中極',0,-.28,.19],['CV4','關元',0,-.20,.21],['CV6','氣海',0,-.10,.23],['CV8','神闕',0,.03,.235],['CV10','下脘',0,.21,.23],['CV12','中脘',0,.37,.225],['CV15','鳩尾',0,.57,.21],['CV17','膻中',0,.77,.215],['CV22','天突',0,1.04,.105],['CV24','承漿',0,1.30,.21],
 ['GV1','長強',0,-.38,-.16],['GV4','命門',0,-.02,-.19],['GV14','大椎',0,1.04,-.13],['GV15','啞門',0,1.165,-.14],['GV16','風府',0,1.21,-.16],['GV20','百會',0,1.79,0],['GV25','素髎',0,1.42,.25],['GV26','水溝',0,1.37,.24],['GV28','齦交',0,1.365,.21],
 ['EX-HN1','四神聰',.07,1.76,.02],['EX-HN3','印堂',0,1.55,.235],['EX-HN5','太陽',.17,1.51,.12],['EX-HN22','安眠',.12,1.30,-.08],['EX-B1','定喘',.045,1.04,-.14],['EX-B2','華佗夾脊',.04,.60,-.21],['EX-UE2','二白',.81,-.15,.09],['EX-UE7','腰痛點',.93,-.46,-.025],['EX-UE9','八邪',.95,-.56,.015],['EX-UE10','四縫',.95,-.61,.06],['EX-UE11','十宣',.95,-.70,.06],['EX-LE4','內膝眼',.19,-.94,.14],['EX-LE5','膝眼',.24,-.94,.14],['EX-LE6','膽囊穴',.32,-1.09,.04],['EX-LE7','闌尾穴',.29,-1.20,.13],['EX-LE10','八風',.24,-1.71,.22],['EX-CA1','子宮',.20,-.28,.185],
 ['REG-頸夾脊','頸夾脊',.04,1.13,-.13],['REG-頭痛穴','頭痛穴',.13,1.56,.17],['REG-腰痛穴','腰痛穴',.93,-.46,-.025],['REG-牙痛穴','牙痛穴',.14,1.34,.14],['REG-阿是穴','阿是穴',.31,.50,.16],
];
const aliases = {'水溝':['人中'], '太衝':['太冲'], '外關':['外关'], '支溝':['支沟'], '崑崙':['昆侖','昆仑'], '膽囊穴':['膽囊'], '闌尾穴':['闌尾'], '華佗夾脊':['夾脊'], '犢鼻':['外膝眼'], '陽池':['阳池']};
const clean = value => value.replace(/<[^>]*>/g,'').replace(/[*`]/g,'').trim();
const codeOf = id => id.startsWith('EX-') ? 'EX' : id.startsWith('REG-') ? 'OTHER' : id.match(/^[A-Z]+/)[0];
// Project authored landmark regions onto this project's GLB, so a schematic point
// sits on its mesh instead of floating in front of it or intersecting a limb.
// This is a visual surface fit only; it does not validate anatomical locations.
const modelBuffer=await readFile(path.join(root,'public/models/acupuncture_body.glb'));
if(modelBuffer.readUInt32LE(0)!==0x46546c67) throw new Error('Expected generated GLB mannequin');
const jsonLength=modelBuffer.readUInt32LE(12);
const model=JSON.parse(modelBuffer.subarray(20,20+jsonLength).toString('utf8'));
const bin=modelBuffer.subarray(20+jsonLength+8);
function accessor(index) {
 const a=model.accessors[index],v=model.bufferViews[a.bufferView];
 const components=a.type==='VEC3'?3:1;
 const size=a.componentType===5126||a.componentType===5125?4:2;
 const values=[];
 for(let i=0;i<a.count*components;i++) {
  const offset=(v.byteOffset||0)+(a.byteOffset||0)+i*size;
  values.push(a.componentType===5126?bin.readFloatLE(offset):size===4?bin.readUInt32LE(offset):bin.readUInt16LE(offset));
 }
 return values;
}
const surfaces=model.meshes.map(mesh=>({name:mesh.name,positions:accessor(mesh.primitives[0].attributes.POSITION),indices:accessor(mesh.primitives[0].indices)}));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
function triangleIntersection(origin,direction,a,b,c) {
 const edge1=sub(b,a),edge2=sub(c,a),h=cross(direction,edge2),det=dot(edge1,h);
 if(Math.abs(det)<1e-9) return null;
 const inv=1/det,s=sub(origin,a),u=inv*dot(s,h);if(u<0||u>1)return null;
 const q=cross(s,edge1),v=inv*dot(direction,q);if(v<0||u+v>1)return null;
 const distance=inv*dot(edge2,q);return distance>=0?distance:null;
}
const explicitNormals={
 LI1:[-1,0,0], LI2:[0,0,-1],LI4:[0,0,-1],LI5:[0,0,-1],LI10:[0,0,-1],LI11:[0,0,-1],
 LU7:[-1,0,0],LU11:[-1,0,0],
 SI1:[1,0,0],SI3:[1,0,0],SI6:[0,0,-1], HT9:[1,0,0],PC9:[0,-1,0],
 TE1:[0,0,-1],TE4:[0,0,-1],TE3:[0,0,-1],TE5:[0,0,-1],TE6:[0,0,-1],TE14:[0,0,-1],
 SP1:[-1,0,0],SP3:[-1,0,0],SP4:[-1,0,0],SP21:[1,0,0],SP6:[-1,0,0],SP8:[-1,0,0],SP9:[-1,0,0],
 KI3:[-1,0,0],KI6:[-1,0,0],GB34:[1,0,0],GB40:[1,0,0],BL60:[1,0,0],BL62:[1,0,0],
 ST41:[0,0,1],ST42:[0,1,0],ST44:[0,1,0],ST45:[0,1,0],
 LR1:[0,1,0],LR2:[0,1,0],LR3:[0,1,0],GB41:[0,1,0],GB44:[0,1,0],
 KI1:[0,-1,0],CV1:[0,-1,0],GV20:[0,1,0],
};
function displayNormal(point) {
 if(point.meridianCode==='EAR')return [1,0,0];
 return explicitNormals[point.id] || (point.position[2]<-.05?[0,0,-1]:[0,0,1]);
}
function fitSurface(point,normal) {
 const p=point.position,origin=p.map((v,k)=>v+normal[k]*1.2),direction=normal.map(v=>-v);
 // Prevent a foot point from ray-hitting the other leg, or a hand point from
 // snapping onto the torso. Anatomical correspondence is still schematic.
 const candidates=surfaces.filter(mesh=>{
  if(point.meridianCode==='EAR')return mesh.name==='Ear 1';
  if(p[1]>1.23)return /Head|Nose|Chin/.test(mesh.name);
  if(p[1]<-1.58)return mesh.name==='Foot 1'||mesh.name==='Leg 1';
  if(p[1]<-.57&&p[0]>.55)return /Finger 1|Thumb 1/.test(mesh.name);
  if(p[0]>.65&&p[1]<-.34)return /Palm 1|Finger 1|Thumb 1/.test(mesh.name);
  if(p[0]>.42&&p[1]>-.4)return mesh.name==='Arm 1';
  if(p[1]<-.57)return mesh.name==='Leg 1';
  return mesh.name==='Continuous torso and neck';
 });
 let best=Infinity,surface=null;
 for(const mesh of candidates) for(let i=0;i<mesh.indices.length;i+=3) {
  const vs=mesh.indices.slice(i,i+3).map(index=>mesh.positions.slice(index*3,index*3+3));
  const distance=triangleIntersection(origin,direction,...vs);
  if(distance!==null&&distance<best){best=distance;surface=mesh.name;}
 }
 if(!surface)return {position:p,surfaceProjection:null};
 return {position:origin.map((v,k)=>Number((v+direction[k]*(best-.008)).toFixed(6))),surfaceProjection:surface};
}
const registry = new Map(seeds.map(([id,name,x,y,z]) => [name,{
 id,name,aliases:aliases[name]||[],meridianCode:codeOf(id),position:[x,y,z],
 coordinatePrecision:id.startsWith('REG-')?'regional':'schematic',sources:[],
}]));
const catalog=[]; const excluded=[];
async function walk(dir) {
 const result=[];
 for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
  const absolute=path.join(dir,entry.name);
  if(entry.isDirectory()) result.push(...await walk(absolute));
  else if(entry.name.toLowerCase().endsWith('.md')) result.push(absolute);
 }
 return result;
}
const header = /穴位名[稱称]|穴名/;
for(const absolute of await walk(docsDir)) {
 const content=await readFile(absolute,'utf8');
 const docPath=path.relative(root,absolute).split(path.sep).join('/');
 const title=content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(absolute,'.md');
 const rowPoints=new Set(); let inPointTable=false;
 for(const [index,line] of content.split(/\r?\n/).entries()) {
  if(!line.trim().startsWith('|')) { inPointTable=false; continue; }
  const cells=line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(clean);
  if(header.test(cells[0])) { inPointTable=true; continue; }
  if(!inPointTable || cells.length<5 || /^\s*:?-+/.test(cells[0])) continue;
  const cell=cells[0];
  if(/未提及|不適用|示範部位|穴位類別|選擇原則|循經選穴|配穴（|鼻咽管/.test(cell)) { excluded.push({path:docPath,line:index+1,label:cell,reason:'Not an individually identified point'}); continue; }
  let matched=[];
  for(const [name,point] of registry) {
   if(point.meridianCode==='EAR' && point.name!=='耳穴・耳尖') continue;
   if([name,...point.aliases].some(alias=>cell.includes(alias))) matched.push(point);
  }
  matched=matched.filter(point=>!matched.some(other=>other!==point && [other.name,...other.aliases].some(longName=>cell.includes(longName)&&[point.name,...point.aliases].some(shortName=>longName!==shortName&&longName.includes(shortName)&&cell.includes(shortName)))));
  if(cell==='內/外膝眼') matched=[registry.get('內膝眼'),registry.get('犢鼻')];
  // Ear Shenmen must not merge with HT7 Shenmen on the wrist.
  if(/耳穴疗法/.test(docPath)) {
   const earName=cell.replace(/\s*[（(].*$/,'');
   if(earName && !/未提及/.test(earName)) {
    const key='耳穴・'+earName;
    if(!registry.has(key)) registry.set(key,{id:'EAR-'+earName,name:key,aliases:[earName],meridianCode:'EAR',position:[.19,1.48,.015],coordinatePrecision:'regional',sources:[]});
    matched=[registry.get(key)];
   }
  }
  if(!matched.length) { excluded.push({path:docPath,line:index+1,label:cell,reason:'Group or non-individual category; see original document'}); continue; }
  // A row containing several points keeps its group label so shared instructions are never portrayed as point-specific.
  const group=matched.length>1;
  for(const point of matched) {
   point.sources.push({path:docPath,line:index+1,label:cell,group,location:cells[2]||'',indications:cells[3]||'',method:cells[4]||'',safety:cells[5]||''});
   rowPoints.add(point.id);
  }
 }
 // Some chapters deliberately replace the core-point table with a bullet list.
 // Keep those named excerpts as prose evidence, without borrowing a technique
 // from general instructions or another point on the same line.
 let inCore=false;
 for(const [index,line] of content.split(/\r?\n/).entries()) {
  if(/^##\s/.test(line)){inCore=/^##\s+三[、.]/.test(line);continue;}
  if(!inCore||!/^\s*-\s+\*\*/.test(line))continue;
  const match=line.match(/^\s*-\s+\*\*(.+?)\*\*[：:]\s*(.*)$/);
  if(!match)continue;
  const label=clean(match[1]),excerpt=clean(match[2]);
  let searchLabel=label;
  if(['起點','止點'].includes(label))searchLabel=excerpt.match(/^([^，,：:]+)/)?.[1]||label;
  const matched=[...registry.values()].filter(point=>point.meridianCode!=='EAR'&&[point.name,...point.aliases].some(name=>searchLabel.includes(name)));
  for(const point of matched) {
   const describesLocation=/位於|位于|鎖骨|第一、二掌骨|食指橈側|對側鼻旁|左右經脈/.test(excerpt);
   point.sources.push({path:docPath,line:index+1,label,group:matched.length>1,kind:'prose',excerpt,location:describesLocation?excerpt:'',indications:'',method:'',safety:''});
   rowPoints.add(point.id);
  }
 }
 // Preserve named risk notes outside core-point tables as explicit source evidence.
 // They cannot supply a point-specific method or depth, only the original caution.
 for(const [index,line] of content.split(/\r?\n/).entries()) {
  if(line.trim().startsWith('|'))continue;
  if(!/嚴禁|严禁|禁深刺|以防|防傷|防伤|防氣胸|氣胸|延髓|延腦|頸動脈|脊髓/.test(line))continue;
  const evidence=clean(line.replace(/^\s*-\s*/,''));
  const heading=clean(line.match(/\*\*(.+?)\*\*/)?.[1]||'');
  const namedHeading=[...registry.values()].some(point=>point.meridianCode!=='EAR'&&[point.name,...point.aliases].some(name=>heading.includes(name)));
  // A chapter synopsis naming four points and singling one out as dangerous is
  // not evidence that all four share that danger. Prefer the named warning label.
  if(!namedHeading&&!/解剖危險區|解剖危险区|危險解剖區|延髓中樞|項部|项部/.test(heading))continue;
  const scope=namedHeading?heading:evidence;
  const matched=[...registry.values()].filter(point=>point.meridianCode!=='EAR'&&[point.name,...point.aliases].some(name=>scope.includes(name)));
  for(const point of matched) {
   point.sources.push({path:docPath,line:index+1,label:point.name,group:matched.length>1,kind:'warning',excerpt:evidence,location:'',indications:'',method:'',safety:evidence});
   rowPoints.add(point.id);
  }
 }
 // Include prose-only mentions without extracting their unstructured text as clinical instructions.
 const referenced=new Set(rowPoints);
 for(const point of registry.values()) {
  if(/耳穴疗法/.test(docPath) !== (point.meridianCode==='EAR') && point.name!=='耳穴・耳尖') continue;
  if([point.name,...point.aliases].some(name=>content.includes(name))) referenced.add(point.id);
 }
 catalog.push({path:docPath,title,acupointIds:[...referenced].sort(),bytes:Buffer.byteLength(content)});
}
const featuredNames=new Set(['合谷','中府','足三里','內關','三陰交','百會','風池','曲池','神門','太衝','關元','膻中']);
const quality=s=> (s.group?-50:0) + (/^docs\/4\.(15|16|17|18|19)/.test(s.path)?30:0) + (s.location&&!/未提及|未詳|未展開/.test(s.location)?6:0) + (s.method&&!/^[^；;]*(未提及|未詳)/.test(s.method)?12:0) + (s.safety&&!/未提及/.test(s.safety)?3:0);
const points=[...registry.values()].filter(point=>point.sources.length>0 || catalog.some(doc=>doc.acupointIds.includes(point.id))).map(point=>{
 const sources=[...point.sources].sort((a,b)=>quality(b)-quality(a)||a.path.localeCompare(b.path,'en')||a.line-b.line);
 const best=sources.find(s=>!s.group)||sources[0];
 const numeric=best?.method.match(/(\d+(?:\.\d+)?)\s*[°度]/);
 const normal=displayNormal(point);
 const fitted=fitSurface(point,normal);
 const docs=[...new Set(sources.map(s=>s.path))];
 for(const doc of catalog) if(doc.acupointIds.includes(point.id)&&!docs.includes(doc.path)) docs.push(doc.path);
 return {...point,...fitted,meridian:meridians[point.meridianCode]||'教材舉例穴位',normal,angleDegrees:numeric?Number(numeric[1]):null,
  angleSource:numeric?{path:best.path,line:best.line,text:best.method}:null,
  docs,technique:{location:best?.location||'教材未提供個別定位。',method:best?.method||'教材未提供個別刺灸手法。',depth:best?.method||'教材未提供深度。',safety:best?.safety||'教材未提供個別禁忌。',source:best?.path||docs[0],group:best?.group||false},
  sources,featured:featuredNames.has(point.name),reviewStatus:'unreviewed-source-material'};
}).sort((a,b)=>Number(b.featured)-Number(a.featured)||a.meridianCode.localeCompare(b.meridianCode,'en')||a.id.localeCompare(b.id,'en',{numeric:true}));
// The acupoint list includes only points discovered in the current documents.
const ids=new Set(points.map(p=>p.id));
for(const doc of catalog) doc.acupointIds=doc.acupointIds.filter(id=>ids.has(id));
let overrides=[];
try { overrides=parseCalibration(await readFile(path.join(dataDir,'calibration-overrides.json'),'utf8'),points); }
catch(error) { if(error.code!=='ENOENT')throw error; }
const calibratedPoints=mergeCalibration(points.map(withNeedleData).map(withClinicalIndex),overrides);
await mkdir(dataDir,{recursive:true});
await writeFile(path.join(dataDir,'acupoints.json'),JSON.stringify(calibratedPoints,null,2)+'\n');
await writeFile(path.join(dataDir,'docs-catalog.json'),JSON.stringify(catalog,null,2)+'\n');
await writeFile(path.join(dataDir,'coverage.json'),JSON.stringify({markdownFiles:catalog.length,acupoints:points.length,tableSourceRows:points.reduce((n,p)=>n+p.sources.filter(s=>!s.kind).length,0),proseSourceRows:points.reduce((n,p)=>n+p.sources.filter(s=>s.kind==='prose').length,0),warningSourceRows:points.reduce((n,p)=>n+p.sources.filter(s=>s.kind==='warning').length,0),excludedRows:excluded,coordinates:'schematic-unvalidated-surface-fitted',manualOverrides:overrides.length,surfaceProjectionUnresolved:points.filter(p=>!p.surfaceProjection).map(p=>p.id),clinicalContent:'verbatim-unreviewed-source-material'},null,2)+'\n');
console.log(`Indexed ${catalog.length} Markdown documents and ${points.length} schematic points; ${excluded.length} non-individual table rows retained in coverage report.`);
