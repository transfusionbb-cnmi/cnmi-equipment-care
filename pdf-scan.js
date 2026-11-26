'use strict';
/* Experimental offline scanner: reads QR pixels from JPEG streams embedded in scanned PDFs.
   No PDF viewer/native scan APIs. Unsupported PDF encodings fall back to manual mapping.
   All parsing happens locally; no network and no document upload. */
window.CNMI_SCAN = (function(){
 const MAX_BYTES=30*1024*1024,MAX_IMAGES=24,MAX_PIXELS=12e6;
 function isPDF(bytes){return bytes.length>=5&&String.fromCharCode(...bytes.slice(0,5))==='%PDF-';}
 function looksJPEG(bytes){return bytes.length>100&&bytes[0]===255&&bytes[1]===216;}
 function decodeLatin(bytes){let out='';for(let n=0;n<bytes.length;n+=65536)out+=String.fromCharCode.apply(null,bytes.subarray(n,Math.min(n+65536,bytes.length)));return out;}
 function findJPEGImages(bytes){
  const txt=decodeLatin(bytes);let found=[],p=0, scanned=0;
  // A scanner commonly embeds one JPEG per page in an image XObject.
  while(scanned++<MAX_IMAGES*8){
   const start=txt.indexOf('/Subtype',p);if(start<0)break;p=start+8;
   if(!/^\s*\/Image\b/.test(txt.slice(p,p+28)))continue;
   const s=txt.indexOf('stream',p),endDict=txt.indexOf('endobj',p);
   if(s<0 || (endDict>=0 && s>endDict)||s-p>4000)continue;
   const dict=txt.slice(Math.max(0,start-700),s);
   if(!/\/DCTDecode\b/.test(dict))continue;
   let pos=s+6;if(bytes[pos]===13)pos++;if(bytes[pos]===10)pos++;
   const end=txt.indexOf('endstream',pos);if(end<0||end-pos>MAX_BYTES)continue;
   let raw=bytes.slice(pos,end);while(raw.length&&[10,13,32].includes(raw[raw.length-1]))raw=raw.slice(0,-1);
   if(looksJPEG(raw))found.push(raw);
   if(found.length>=MAX_IMAGES)break;
   p=end+9;
  }
  return found;
 }
 function drawAndRead(img){
  if(typeof window.jsQR!=='function')throw new Error('ไม่พบตัวอ่าน QR ในเครื่อง');
  const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
  if(!w||!h)throw new Error('ไฟล์ภาพอ่านไม่ได้');
  const scale=Math.min(1,Math.sqrt(MAX_PIXELS/(w*h)),2800/Math.max(w,h));
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);
  const id=ctx.getImageData(0,0,c.width,c.height);
  return window.jsQR(id.data,c.width,c.height,{inversionAttempts:'attemptBoth'})?.data||null;
 }
 async function jpegQR(bytes){
  const blob=new Blob([bytes],{type:'image/jpeg'}),url=URL.createObjectURL(blob);
  try {const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('เปิดภาพ JPEG ไม่สำเร็จ'));img.src=url;});return drawAndRead(img);}
  finally{URL.revokeObjectURL(url);}
 }
 async function scan(file){
  if(!file||file.size>MAX_BYTES)throw new Error('เลือกไฟล์ PDF/JPG/PNG ไม่เกิน 30 MB');
  let match=null,formats=[],sources=0;
  if(/\.(jpe?g|png)$/i.test(file.name)||/^image\/(jpeg|png)$/.test(file.type)){
   const url=URL.createObjectURL(file);try{const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=()=>rej(new Error('ไฟล์ภาพเสีย'));img.src=url;});match=drawAndRead(img);sources=1;formats.push('image');}finally{URL.revokeObjectURL(url);}
  }else{
   const bytes=new Uint8Array(await file.arrayBuffer());if(!isPDF(bytes))throw new Error('ไฟล์ที่เลือกไม่ใช่ PDF ที่ถูกต้อง');
   const images=findJPEGImages(bytes);sources=images.length;formats.push('JPEG-XObject');
   const found=new Set();
   for(let i=0;i<images.length;i++)try{const item=await jpegQR(images[i]);if(item)found.add(item);if(found.size>1)break;}catch(e){console.warn('QR scan image',i,e.message);}
   const values=[...found];
   if(values.length>1)return {value:'',detected:false,conflict:true,values,sources,formats,reason:'พบ QR ต่างกันหลายรหัสใน PDF เดียว กรุณาแยกสแกนเป็นไฟล์ต่อเครื่องมือและแบบฟอร์ม ไม่จัดเก็บอัตโนมัติ'};
   match=values[0]||null;
  }
  return {value:match||'',detected:!!match,conflict:false,sources,formats,reason:match?'พบ QR ในภาพสแกน':'ไม่พบ QR ที่อ่านได้จากไฟล์นี้; อาจเป็น PDF แบบอื่น/QR เล็กหรือภาพไม่ชัด กรุณาเลือกข้อมูลด้วยตนเอง'};
 }
 function parsePayload(raw){
  const x=String(raw||'').trim();if(!x)return {mode:'manual',message:'ไม่พบ QR'};
  // Permanent form+asset label: re-use every month; period is selected during upload.
  if(x.startsWith('ECF1|')){
   const seg=x.split('|');if(seg.length!==4)return {mode:'invalid',message:'QR ถาวรไม่ถูกต้อง'};
   const [,formId,type,target]=seg;
   if(!['E','L'].includes(type)||!target||!window.FORM_CATALOG.some(f=>f.id===formId))return {mode:'invalid',message:'ไม่พบฟอร์มหรือเครื่องมือใน QR'};
   if(type==='E'&&!window.EQUIPMENT_REGISTRY.some(e=>e.asset_new===target))return {mode:'invalid',message:'รหัสเครื่องใน QR ไม่พบในทะเบียน'};
   return {mode:'permanent',formId,type:type==='E'?'equipment':'location',target,message:'อ่าน QR ถาวรสำเร็จ เลือกเดือนเอกสารก่อนบันทึก'};
  }
  if(x.startsWith('ECM1|')){
   const seg=x.split('|');if(seg.length!==5)return {mode:'invalid',message:'โครงสร้าง QR ประจำเดือนไม่ถูกต้อง'};
   const [,formId,type,target,period]=seg;
   if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(period)||!['E','L'].includes(type)||!target||!window.FORM_CATALOG.some(f=>f.id===formId))return {mode:'invalid',message:'QR ไม่มีแบบฟอร์มหรือเดือนที่รู้จัก'};
   if(type==='E'&&!window.EQUIPMENT_REGISTRY.some(e=>e.asset_new===target))return {mode:'invalid',message:'รหัสเครื่องใน QR ไม่พบในทะเบียน'};
   return {mode:'monthly',formId,type:type==='E'?'equipment':'location',target,period};
  }
  try{
   const u=new URL(x);const f=u.searchParams.get('f'),a=u.searchParams.get('a');
   if(f&&window.FORM_CATALOG.some(x=>x.id===f))return {mode:'form',formId:f,message:'QR ฟอร์มถาวร: ต้องเลือกเครื่องหรือพื้นที่และเดือนก่อน'};
   if(a&&window.EQUIPMENT_REGISTRY.some(x=>x.asset_new===a))return {mode:'equipment',type:'equipment',target:a,message:'QR เครื่องมือ: ต้องเลือกแบบฟอร์มและเดือนก่อน'};
  }catch{}
  return {mode:'unknown',message:'QR ที่พบไม่ใช่ QR ของ CNMI Equipment Care: โปรดตรวจเอกสารก่อน'};
 }
 return {scan,parsePayload,findJPEGImages};
})();
