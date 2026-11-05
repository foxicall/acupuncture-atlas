/** Original, reproducible schematic mannequin. No external model or texture assets. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const meshes = [];
function surface(name, rings, segments = 64, deform = (x, y, z) => [x, y, z]) {
  const positions = [], indices = [];
  for (const ring of rings) {
    const [y, rx, rz, cx = 0, cz = 0] = ring;
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      positions.push(...deform(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz, a));
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * (segments + 1) + i, b = a + segments + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  // Close both ends with a small fan, keeping the limb surfaces watertight.
  for (const [r, reverse] of [[0, false], [rings.length - 1, true]]) {
    const [y, , , cx = 0, cz = 0] = rings[r];
    const c = positions.length / 3; positions.push(cx, y, cz);
    for (let i = 0; i < segments; i++) {
      const a = r * (segments + 1) + i;
      indices.push(...(reverse ? [c, a, a + 1] : [c, a + 1, a]));
    }
  }
  meshes.push({ name, positions, indices });
}
function subdivide(rings, count = 5) {
  // Smooth Hermite interpolation through anatomical cross-section landmarks.
  const result = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const prev = rings[Math.max(0, i - 1)], a = rings[i], b = rings[i + 1], next = rings[Math.min(rings.length - 1, i + 2)];
    for (let j = 0; j < count; j++) {
      const t = j / count, t2 = t * t, t3 = t2 * t;
      result.push(a.map((v, k) => {
        if (k === 0) return v + (b[k] - v) * t;
        const m1 = (b[k] - prev[k]) * .5, m2 = (next[k] - v) * .5;
        return (2*t3-3*t2+1)*v+(t3-2*t2+t)*m1+(-2*t3+3*t2)*b[k]+(t3-t2)*m2;
      }));
    }
  }
  result.push(rings.at(-1)); return result;
}
function ellipsoid(name, center, scale, segments = 40, rows = 24) {
  const rings=[];
  for(let j=0;j<=rows;j++) {
    const t = Math.PI * j / rows;
    rings.push([center[1]+Math.cos(t)*scale[1], Math.max(.0001,Math.sin(t)*scale[0]), Math.max(.0001,Math.sin(t)*scale[2]), center[0], center[2]]);
  }
  surface(name,rings,segments);
}

surface('Continuous torso and neck', subdivide([
  [1.27,.116,.107,0,-.014], [1.16,.115,.111,0,-.015],
  [1.08,.275,.145,0,-.008], [.98,.442,.185,0,0], [.85,.432,.216,0,0],
  [.68,.387,.211,0,.003], [.43,.319,.185,0,.008], [.20,.282,.172,0,.008],
  [-.01,.301,.184,0,.004], [-.23,.357,.204,0,-.008], [-.39,.337,.190,0,-.006],
  [-.53,.238,.128,0,.012], [-.57,.075,.05,0,.015]
], 5), 72, (x,y,z,a) => {
  const front = Math.max(0, Math.sin(a));
  // Very shallow body landmarks: paired pectorals, midline and the umbilicus.
  const chest = .016 * Math.exp(-(((y-.70)/.19)**2)) * Math.exp(-(((Math.abs(x)-.20)/.15)**2));
  const sternum = .008 * Math.exp(-((x/.055)**2)) * Math.exp(-(((y-.70)/.25)**2));
  const navel = .012 * Math.exp(-((x/.028)**2)-((y-.03)/.025)**2);
  return [x,y,z + front * (chest - sternum - navel)];
});

surface('Head', subdivide([
  [1.80,.018,.023,0,-.008],[1.77,.118,.112,0,-.015],[1.69,.184,.160,0,-.018],
  [1.57,.200,.173,0,-.018],[1.45,.186,.169,0,-.014],[1.34,.151,.145,0,.001],
  [1.26,.104,.111,0,.013],[1.24,.050,.060,0,.015]
],5),64,(x,y,z,a)=> {
  const front=Math.max(0,Math.sin(a));
  // A flatter face and a mild brow ridge distinguish front from back.
  const brow=.014*Math.exp(-(((y-1.56)/.028)**2))*Math.exp(-((x/.16)**4));
  return [x,y,z+front*brow];
});
ellipsoid('Nose bridge',[0,1.505,.165],[.030,.068,.041]);
ellipsoid('Nose tip',[0,1.465,.191],[.035,.024,.032]);
ellipsoid('Chin',[0,1.306,.112],[.068,.035,.035]);
for (const side of [-1,1]) {
  const s=side;
  ellipsoid(`Ear ${s}`,[s*.197,1.485,-.005],[.032,.073,.035],32,20);
  surface(`Arm ${s}`,subdivide([
    [1.005,.104,.120,s*.432,0],[.92,.141,.147,s*.482,0],
    [.76,.137,.137,s*.540,0],[.52,.111,.116,s*.613,.004],
    [.31,.087,.090,s*.690,.012],[.21,.090,.086,s*.716,.017],
    [.04,.084,.083,s*.762,.026],[-.17,.065,.066,s*.808,.038],
    [-.34,.046,.048,s*.850,.046],[-.395,.044,.045,s*.860,.048]
  ],5),48);
  surface(`Palm ${s}`,subdivide([
    [-.345,.046,.048,s*.852,.048],[-.41,.066,.047,s*.871,.053],
    [-.50,.075,.043,s*.890,.056],[-.56,.070,.033,s*.908,.057],
    [-.59,.052,.023,s*.914,.057]
  ],4),40);
  // Four separated fingers hang naturally. Their tiny radii remain readable on phones.
  for(let finger=0;finger<4;finger++) {
    const offset=(finger-1.5)*.034;
    const startX=s*(.91+offset), length=[.15,.195,.18,.145][finger];
    surface(`Finger ${s} ${finger+1}`,subdivide([
      [-.545,.018,.025,startX,.058],[-.60,.017,.022,startX+s*.008,.059],
      [-.545-length,.013,.016,startX+s*.016,.060],[-.558-length,.002,.003,startX+s*.016,.060]
    ],4),20);
  }
  surface(`Thumb ${s}`,subdivide([
    [-.43,.033,.033,s*.827,.061],[-.49,.028,.030,s*.802,.076],
    [-.545,.020,.023,s*.785,.082],[-.575,.002,.003,s*.783,.084]
  ],4),24);
  surface(`Leg ${s}`,subdivide([
    [-.30,.182,.179,s*.204,-.006],[-.43,.181,.174,s*.225,-.008],
    [-.61,.156,.156,s*.237,-.012],[-.81,.121,.122,s*.243,-.009],
    [-.95,.101,.106,s*.244,.004],[-1.035,.100,.103,s*.245,.005],
    [-1.20,.118,.127,s*.246,-.026],[-1.37,.090,.100,s*.245,-.025],
    [-1.55,.056,.063,s*.244,-.005],[-1.66,.053,.058,s*.244,.010],
    [-1.71,.042,.050,s*.244,.027]
  ],5),48);
  surface(`Foot ${s}`,subdivide([
    [-1.59,.050,.066,s*.244,.014],[-1.65,.066,.119,s*.244,.048],
    [-1.70,.078,.180,s*.244,.089],[-1.755,.080,.198,s*.244,.105],
    [-1.79,.064,.185,s*.244,.107],[-1.80,.014,.055,s*.244,.094]
  ],4),48);
}

function normalsOf(positions, indices) {
  const normals = new Float32Array(positions.length);
  for(let i=0;i<indices.length;i+=3) {
    const ia=indices[i]*3,ib=indices[i+1]*3,ic=indices[i+2]*3;
    const ab=[positions[ib]-positions[ia],positions[ib+1]-positions[ia+1],positions[ib+2]-positions[ia+2]];
    const ac=[positions[ic]-positions[ia],positions[ic+1]-positions[ia+1],positions[ic+2]-positions[ia+2]];
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    for(const v of [ia,ib,ic]) for(let k=0;k<3;k++) normals[v+k]+=n[k];
  }
  for(let i=0;i<normals.length;i+=3) {
    const len=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;
    for(let k=0;k<3;k++) normals[i+k]/=len;
  }
  return normals;
}
const gltf={asset:{version:'2.0',generator:'acupuncture-atlas original schematic mannequin generator',copyright:'Original project asset; MIT license. Educational schematic, not clinical anatomy.'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[{name:'Porcelain mannequin',pbrMetallicRoughness:{baseColorFactor:[.76,.79,.77,1],metallicFactor:0,roughnessFactor:.65},doubleSided:true}],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
const chunks=[]; let binaryLength=0;
function addAccessor(values,type,componentType,min,max) {
  const buffer=Buffer.from(values.buffer,values.byteOffset,values.byteLength);
  const view=gltf.bufferViews.push({buffer:0,byteOffset:binaryLength,byteLength:buffer.length})-1;
  chunks.push(buffer); binaryLength+=buffer.length;
  if(binaryLength%4){ const padding=Buffer.alloc(4-binaryLength%4); chunks.push(padding); binaryLength+=padding.length; }
  const count=values.length/(type==='VEC3'?3:1);
  const accessor={bufferView:view,componentType,count,type};
  if(min) accessor.min=min;if(max)accessor.max=max;
  return gltf.accessors.push(accessor)-1;
}
for(const mesh of meshes) {
  const position=new Float32Array(mesh.positions), index=new Uint32Array(mesh.indices), normal=normalsOf(position,index);
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<position.length;i++) {min[i%3]=Math.min(min[i%3],position[i]);max[i%3]=Math.max(max[i%3],position[i]);}
  const p=addAccessor(position,'VEC3',5126,min,max),n=addAccessor(normal,'VEC3',5126),ix=addAccessor(index,'SCALAR',5125);
  const m=gltf.meshes.push({name:mesh.name,primitives:[{attributes:{POSITION:p,NORMAL:n},indices:ix,material:0}]})-1;
  gltf.scenes[0].nodes.push(gltf.nodes.push({name:mesh.name,mesh:m})-1);
}
gltf.buffers[0].byteLength=binaryLength;
let json=Buffer.from(JSON.stringify(gltf));if(json.length%4)json=Buffer.concat([json,Buffer.alloc(4-json.length%4,0x20)]);
const binary=Buffer.concat(chunks),length=12+8+json.length+8+binary.length;
const header=Buffer.alloc(12); header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(length,8);
const jsonHeader=Buffer.alloc(8);jsonHeader.writeUInt32LE(json.length,0);jsonHeader.writeUInt32LE(0x4e4f534a,4);
const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
const output=resolve(dirname(fileURLToPath(import.meta.url)),'../public/models/acupuncture_body.glb');
mkdirSync(dirname(output),{recursive:true});writeFileSync(output,Buffer.concat([header,jsonHeader,json,binHeader,binary]));
console.log(`Generated ${meshes.length} schematic anatomy meshes, ${(length/1024).toFixed(0)} KiB: ${output}`);
