'use strict';
/* Optional, experimental Windows WIA bridge. Nothing auto-starts on page load.
 * No data is transmitted to Supabase or Google Drive by this module. */
window.CNMI_LOCAL_SCAN=(function(){
  const BASE='http://127.0.0.1:27121';
  async function call(path,token,method='GET'){
    if(!/^[A-F0-9]{32}$/i.test(String(token||'').trim()))throw Error('ใส่รหัสจับคู่ 32 ตัวจากหน้าต่างตัวช่วยก่อน');
    const ctrl=new AbortController(),id=setTimeout(()=>ctrl.abort(),95000);
    try{
      const r=await fetch(BASE+path,{method,headers:{'X-CNMI-Scan-Token':token.trim()},cache:'no-store',signal:ctrl.signal});
      const j=await r.json();if(!r.ok||!j.ok)throw Error(j.message||`เชื่อมสแกนเนอร์ไม่ได้ (${r.status})`);return j;
    }catch(e){if(e.name==='AbortError')throw Error('การสแกนเกินเวลา กรุณาลองใหม่');throw e;}
    finally{clearTimeout(id);}
  }
  function b64bytes(b64){const binary=atob(b64);const b=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)b[i]=binary.charCodeAt(i);return b;}
  async function sizeOfJpeg(src){const img=new Image();await new Promise((ok,fail)=>{img.onload=ok;img.onerror=()=>fail(Error('เปิดภาพสแกนไม่ได้'));img.src=src;});return [img.naturalWidth,img.naturalHeight];}
  async function createPdf(images){
    if(!images.length)throw Error('ยังไม่มีหน้าสแกน');if(images.length>12)throw Error('สูงสุด 12 หน้าต่อไฟล์');
    const enc=new TextEncoder(),chunks=[],pos={length:0},offs=[0],obj=(n,v)=>{offs[n]=pos.length;add(`${n} 0 obj\n${v}\nendobj\n`);};
    function add(v){const u=typeof v==='string'?enc.encode(v):v;chunks.push(u);pos.length+=u.length;}
    add('%PDF-1.4\n%CNMI\n');const count=2+images.length*3;
    obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
    obj(2,`<< /Type /Pages /Kids [${images.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] /Count ${images.length} >>`);
    for(let i=0;i<images.length;i++){
      const [w,h]=images[i].dims,data=images[i].bytes;
      if(w<1||h<1||data.length<100||data.length>12e6)throw Error('ภาพสแกนไม่ถูกต้องหรือใหญ่เกินไป');
      const page=3+i*3,img=page+1,content=page+2,ptW=Math.min(595,w*72/300),ptH=Math.min(842,h*72/300);
      obj(page,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ptW.toFixed(2)} ${ptH.toFixed(2)}] /Resources << /XObject << /Im${i} ${img} 0 R >> >> /Contents ${content} 0 R >>`);
      offs[img]=pos.length;add(`${img} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`);add(data);add('\nendstream\nendobj\n');
      const cmd=`q\n${ptW.toFixed(2)} 0 0 ${ptH.toFixed(2)} 0 0 cm\n/Im${i} Do\nQ\n`;
      obj(content,`<< /Length ${enc.encode(cmd).length} >>\nstream\n${cmd}endstream`);
    }
    const start=pos.length;add(`xref\n0 ${count+1}\n0000000000 65535 f \n`);
    for(let n=1;n<=count;n++)add(`${String(offs[n]).padStart(10,'0')} 00000 n \n`);
    add(`trailer\n<< /Size ${count+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
    return new Blob(chunks,{type:'application/pdf'});
  }
  return {
    devices:token=>call('/devices',token),
    async scanPage(token,id){const j=await call('/scan?device='+encodeURIComponent(id),token,'POST');if(!/^data:image\/jpeg;base64,/.test(j.imageData||''))throw Error('Scanner ไม่ส่งภาพ JPEG');const bytes=b64bytes(j.imageData.slice(j.imageData.indexOf(',')+1));const dims=await sizeOfJpeg(j.imageData);return {bytes,dims,scanner:j.scanner};},
    createPdf
  };
})();
