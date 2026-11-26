'use strict';
/* USB / Bluetooth HID scanners type into a focused input like a keyboard.
 * Scan matching is strictly local; it never writes to Supabase by itself.
 * Asset matching uses the registry's exact ASSET, not a partial guess. */
(function(root){
  const norm=s=>String(s??'').trim().toUpperCase().replace(/[\u200B-\u200D\uFEFF]/g,'');
  const monthOk=m=>/^20\d\d-(0[1-9]|1[0-2])$/.test(m);
  function parse(raw,equipment=[],forms=[],rules=[],fallbackMonth=''){
    const value=norm(raw);
    if(!value)return {ok:false,message:'ยังไม่ได้ยิงหรือกรอกรหัส'};
    let asset='',month='',formId='',explicitForm=false,explicitMonth=false,kind='barcode';
    if(/^ECM1\|/i.test(value) || /^ECF1\|/i.test(value)){
      const parts=value.split('|');
      if(parts.length===(parts[0]==='ECM1'?5:4) && parts[2]==='E'){
        formId=parts[1];asset=parts[3];
        if(parts[0]==='ECM1'){month=parts[4];explicitMonth=true;}
        explicitForm=true;kind='equipment-qr';
      }else return {ok:false,message:'QR นี้ไม่ได้ระบุเครื่องมือ หรือโครงสร้างไม่ถูกต้อง'};
    } else {
      const sorted=[...equipment].filter(e=>e.asset_new).sort((a,b)=>String(b.asset_new).length-String(a.asset_new).length);
      const hit=sorted.find(e=>value===norm(e.asset_new)||value.startsWith(norm(e.asset_new)+'-')||value.startsWith(norm(e.asset_new)+'|'));
      if(!hit)return {ok:false,message:'ไม่พบ ASSET นี้ในทะเบียนเครื่องมือ กรุณาตรวจสติกเกอร์'};
      asset=norm(hit.asset_new);
      let tail=value.slice(asset.length).replace(/^[-|]/,'');
      if(tail){
        let match=tail.match(/^(0[1-9]|1[0-2])-(20\d\d)(?:[-|](.+))?$/);
        if(match){month=match[2]+'-'+match[1];explicitMonth=true;tail=match[3]||'';}
        else {
          match=tail.match(/^(20\d\d)-(0[1-9]|1[0-2])(?:[-|](.+))?$/);
          if(match){month=match[1]+'-'+match[2];explicitMonth=true;tail=match[3]||'';}
          else return {ok:false,message:'หลัง ASSET ต้องเป็น MM-YYYY เช่น CN-B-000310-11-2026'};
        }
        if(tail){
          const f=forms.find(f=>norm(f.code)===norm(tail)||norm(f.id)===norm(tail));
          if(!f)return {ok:false,message:'รหัสแบบฟอร์มท้ายบาร์โค้ดไม่พบในทะเบียน'};
          formId=f.id;explicitForm=true;
        }
      }
    }
    const equipmentRow=equipment.find(e=>norm(e.asset_new)===norm(asset));
    if(!equipmentRow)return {ok:false,message:'QR มี ASSET ที่ไม่อยู่ในทะเบียน'};
    if(month && !monthOk(month))return {ok:false,message:'เดือน/ปีในรหัสไม่ถูกต้อง'};
    if(!month && monthOk(fallbackMonth))month=fallbackMonth;
    if(formId){const matchForm=forms.find(f=>norm(f.id)===norm(formId));if(!matchForm)return {ok:false,message:'ไม่พบแบบฟอร์มที่ระบุใน QR'};formId=matchForm.id;}
    const eligible=rules.filter(r=>r.active&&r.equipment_id===equipmentRow.id&&(!r.start_month||!month||r.start_month.slice(0,7)<=month));
    const formsOfMachine=[...new Set(eligible.map(r=>r.form_id).filter(id=>forms.some(f=>f.id===id)))];
    if(!formId && formsOfMachine.length===1)formId=formsOfMachine[0];
    if(formId && explicitForm && !forms.some(f=>f.id===formId))return {ok:false,message:'ฟอร์มที่ยิงไม่ได้อยู่ในทะเบียน'};
    return {ok:true,asset:equipmentRow.asset_new,equipmentId:equipmentRow.id,formId:formId||'',month:month||'',
      needsMonth:!month,needsForm:!formId,kind,raw:value,monthInCode:explicitMonth,formInCode:explicitForm,
      message:!formId?'พบเครื่องแล้ว — กรุณาเลือกแบบฟอร์ม':!month?'พบเครื่อง/ฟอร์มแล้ว — กรุณาเลือกเดือน':'จับคู่เครื่องมือ ฟอร์ม และเดือนแล้ว'};
  }
  const api={parse};
  root.CNMI_BARCODE=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
