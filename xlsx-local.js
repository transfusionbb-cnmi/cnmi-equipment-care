'use strict';
/* XLSX reader used for preview only, not authoritative workbook modification.
 * Uses vendored JSZip and built-in DOMParser. No web services.
 */
window.CNMI_XLSX=(function(){
 const safeXml=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw new Error('XML ใน Excel เสียหรือไม่รองรับ');return d;};
 const children=(node,name)=>Array.from(node?.children||[]).filter(x=>x.localName===name);
 const direct=(node,name)=>children(node,name)[0]||null;
 const attr=(node,name)=>node?.getAttribute(name)||'';
 const idx=s=>{let n=0;for(const c of s.toUpperCase())n=n*26+c.charCodeAt(0)-64;return n-1;};
 const val=node=>node?.textContent||'';
 async function load(file){
  if(!file||!(/\.xlsx$/i.test(file.name)))throw new Error('รองรับไฟล์ Excel .xlsx เท่านั้น');
  if(file.size>12*1024*1024)throw new Error('ไฟล์ Excel ต้องไม่เกิน 12 MB');
  if(!window.JSZip)throw new Error('ไม่มีตัวอ่าน XLSX ในเว็บ');
  const zip=await window.JSZip.loadAsync(file),get=async path=>zip.file(path)?await zip.file(path).async('string'):null;
  const workbook=await get('xl/workbook.xml');if(!workbook)throw new Error('ไม่พบโครงสร้างสมุดงาน Excel');
  const rels=await get('xl/_rels/workbook.xml.rels');if(!rels)throw new Error('ไม่พบข้อมูลที่อยู่ของชีต');
  const wr=safeXml(workbook),rd=safeXml(rels);
  const refs={};for(const r of Array.from(rd.getElementsByTagName('*')).filter(n=>n.localName==='Relationship'))refs[attr(r,'Id')]=attr(r,'Target');
  const sheets=[];for(const n of Array.from(wr.getElementsByTagName('*')).filter(x=>x.localName==='sheet')){
   const id=n.getAttribute('r:id')||Array.from(n.attributes).find(a=>a.localName==='id')?.value;
   let path=refs[id];if(!path)continue;
   path=path[0]==='/'?path.slice(1):path.startsWith('xl/')?path:'xl/'+path.replace(/^\.\.\//,'');
   if(path.includes('..'))throw new Error('ที่อยู่ชีตผิดปกติ');
   sheets.push({name:attr(n,'name'),path});
  }
  if(!sheets.length)throw new Error('ไม่พบชีต Excel');
  const strings=[];const shared=await get('xl/sharedStrings.xml');if(shared){const sd=safeXml(shared);for(const si of Array.from(sd.getElementsByTagName('*')).filter(x=>x.localName==='si'))strings.push(Array.from(si.getElementsByTagName('*')).filter(n=>n.localName==='t').map(val).join(''));}
  const out=[];
  for(const s of sheets){const raw=await get(s.path);if(!raw)continue;
   const doc=safeXml(raw),rows=[];
   for(const row of Array.from(doc.getElementsByTagName('*')).filter(n=>n.localName==='row').slice(0,3001)){
    let vals=[];
    for(const cell of children(row,'c')){
     const col=idx((attr(cell,'r').match(/^[A-Z]+/i)||[''])[0]);if(col<0||col>=100)continue;
     const type=attr(cell,'t'),v=val(direct(cell,'v'));
     vals[col]=type==='s'?strings[Number(v)]||'':type==='inlineStr'?val(direct(cell,'is')):type==='b'?(v==='1'?'TRUE':'FALSE'):v;
    }
    rows.push({row:Number(attr(row,'r'))||rows.length+1,values:vals});
   }
   out.push({name:s.name,rows});
  }
  if(!out.length)throw new Error('ไม่มีชีตที่อ่านได้');
  return out;
 }
 return {load};
})();
