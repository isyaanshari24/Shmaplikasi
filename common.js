/* MODE: Offline-First + Auto-Sync GAS jam 21:00
   • Input → IndexedDB (instan, tanpa sinyal)
   • Sync  → GAS Google Spreadsheet (otomatis jam 21:00 / manual)
   • Badge ☁️ di header menunjukkan jumlah data pending sync */
(function(){
  var bar=document.getElementById('offline-bar');
  function updateBar(){if(bar)bar.classList.toggle('show',!navigator.onLine);}
  window.addEventListener('online',updateBar);
  window.addEventListener('offline',updateBar);
  updateBar();
}());

/* THEME */
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  const ico=t==='dark'?'\u2600\uFE0F':'\uD83C\uDF19';
  document.querySelectorAll('.tbtn').forEach(b=>b.textContent=ico);
  const tcEl=document.getElementById('tc');
  if(tcEl)tcEl.content=t==='dark'?'#171b21':'#f7f8f8';
  try{localStorage.setItem('shm-t',t);}catch(e){/* storage diblokir, abaikan */}
}
function toggleTheme(){applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');}
(function(){
  var saved=null;
  try{saved=localStorage.getItem('shm-t');}catch(e){/* storage diblokir, abaikan */}
  applyTheme(saved||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));
}());

/* UTILS */
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(function(){t.classList.remove('on');},3000);}
function g(id){var el=document.getElementById(id);return el?el.value.trim():'';}
function today(){return new Date().toISOString().split('T')[0];}
function copyEl(id){navigator.clipboard.writeText(document.getElementById(id).textContent).then(function(){toast('\u2705 Teks disalin');});}
function fmtTs(iso){return new Date(iso).toLocaleString('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}

/* SPLASH — menggunakan window.onload dan setTimeout langsung, tanpa DOMContentLoaded */
function initDates(){document.querySelectorAll('input[type=date]').forEach(function(i){if(!i.readOnly&&!i.value)i.value=today();});}
function hideSplash(){
  var splash=document.getElementById('splash');
  var home=document.getElementById('home');
  splash.classList.add('out');
  setTimeout(function(){splash.style.display='none';home.style.display='block';},500);
}
/* Jalankan langsung — tidak perlu event */
setTimeout(function(){try{hideSplash();}catch(e){
  /* pengaman lapis kedua: paksa splash hilang walau ada error tak terduga */
  var sp=document.getElementById('splash'),hm=document.getElementById('home');
  if(sp)sp.style.display='none';
  if(hm)hm.style.display='block';
}},2500);
try{initDates();}catch(e){}

/* NAVIGATION */
var PAGE_TTL={input:'Input Data',absensi:'Absensi',anggota:'Data Anggota',export:'Export & Log'};
function enterApp(page){
  document.getElementById('home').style.display='none';
  document.getElementById('app').classList.add('on');
  switchPage(page);
}
function goHome(){
  document.getElementById('app').classList.remove('on');
  document.getElementById('home').style.display='block';
  window.scrollTo(0,0);
}
function switchPage(name){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('.nb').forEach(function(b){b.classList.remove('on');});
  var pg=document.getElementById('page-'+name);if(pg)pg.classList.add('on');
  var nb=document.querySelector('.nb[data-p="'+name+'"]');if(nb)nb.classList.add('on');
  document.getElementById('hdr-ttl').textContent=PAGE_TTL[name]||name;
  if(name==='absensi')loadAbsensi();
  if(name==='anggota')loadAnggota();
  if(name==='export')loadActLog();
  if(name==='input')showSub('sub-menu');
  window.scrollTo(0,0);
}
function showSub(id){
  document.querySelectorAll('.subpage').forEach(function(s){s.classList.remove('on');});
  var el=document.getElementById(id);if(el)el.classList.add('on');
  window.scrollTo(0,0);
}

/* TAGS */
function addTag(e,wrapId,hidId){
  if(e.key!=='Enter')return;e.preventDefault();
  var val=e.target.value.trim();if(!val)return;
  var h=document.getElementById(hidId);
  var arr=JSON.parse(h.value);
  if(arr.indexOf(val)>-1){e.target.value='';return;}
  arr.push(val);h.value=JSON.stringify(arr);
  var tag=document.createElement('span');tag.className='tag';
  tag.innerHTML=val+' <button onclick="rmTag(this,\''+hidId+'\',\''+val+'\')">x</button>';
  document.getElementById(wrapId).insertBefore(tag,e.target);
  e.target.value='';
}
function rmTag(btn,hidId,val){
  var h=document.getElementById(hidId);
  h.value=JSON.stringify(JSON.parse(h.value).filter(function(x){return x!==val;}));
  btn.parentElement.remove();
}

/* BLOK */
function addBlok(){
  var p=g('bp_proj'),a=g('bp_alat');
  if(!p||!a){toast('\u26A0\uFE0F Isi project & alat');return;}
  var h=document.getElementById('a_blok');
  var arr=JSON.parse(h.value);arr.push({project:p,alat:a});h.value=JSON.stringify(arr);
  var item=document.createElement('div');item.className='blk-item';
  item.innerHTML='<span><strong>'+a+'</strong> \u2192 '+p+'</span><button class="btn btn-d btn-sm" onclick="rmBlok(this,\''+p+'\',\''+a+'\')">Hapus</button>';
  document.getElementById('blok_list').appendChild(item);
  document.getElementById('bp_proj').value='';document.getElementById('bp_alat').value='';
}
function rmBlok(btn,p,a){
  var h=document.getElementById('a_blok');
  h.value=JSON.stringify(JSON.parse(h.value).filter(function(x){return!(x.project===p&&x.alat===a);}));
  btn.parentElement.remove();
}

/* ═══════════════════════════════════════════════════════
   DATABASE ENGINE — Offline-First + Auto-Sync GAS
   ───────────────────────────────────────────────────────
   Arsitektur:
   1. Semua tulis/baca → IndexedDB (instan, offline)
   2. Setiap record baru punya flag synced:false
   3. Auto-sync ke GAS setiap hari jam 21:00
   4. Sync manual tersedia via syncNow()
   5. Signature gasGet/gasPost identik → pemanggil tidak berubah
═══════════════════════════════════════════════════════ */

var GAS='https://script.google.com/macros/s/AKfycbxTOmlJT0ZarZZKL2UqX4s_RAvnp1utfsxGCb976JS5PKRTiSKCE9cbFDNNoTwMa11Gow/exec';

var DB_NAME='PTSHM_DB';
var DB_VER=2; /* versi 2: tambah store sync_queue */
var DB_STORES=[
  'request_material',
  'seri_tabung',
  'request_alat_berat',
  'laporan_keterlambatan',
  'absensi',
  'absensi_harian',
  'data_anggota'
];
var _db=null;

/* ── Buka IndexedDB ── */
function dbOpen(cb){
  if(_db){cb(_db);return;}
  if(!window.indexedDB){
    console.error('IndexedDB tidak tersedia di browser/viewer ini');
    cb(null);return;
  }
  try{
    var req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=function(e){
      var db=e.target.result;
      DB_STORES.forEach(function(s){
        if(!db.objectStoreNames.contains(s)){
          db.createObjectStore(s,{keyPath:'_lid',autoIncrement:true});
        }
      });
      /* Store antrian sync — menyimpan semua operasi yg belum ter-upload */
      if(!db.objectStoreNames.contains('sync_queue')){
        var sq=db.createObjectStore('sync_queue',{keyPath:'_qid',autoIncrement:true});
        sq.createIndex('synced','synced',{unique:false});
      }
    };
    req.onsuccess=function(e){_db=e.target.result;cb(_db);};
    req.onerror=function(){console.error('IndexedDB gagal dibuka');cb(null);};
  }catch(e){
    console.error('IndexedDB error:',e);
    cb(null);
  }
}


/* ── gasGet: baca dari IndexedDB ── */
function gasGet(sheet,cb){
  dbOpen(function(db){
    if(!db){cb({data:[]});return;}
    var tx=db.transaction(sheet,'readonly');
    var store=tx.objectStore(sheet);
    var req=store.getAll();
    req.onsuccess=function(){
      var rows=(req.result||[]).map(function(r){
        var o=Object.assign({},r);
        o.id=String(o._lid); /* expose sebagai 'id' agar kompatibel */
        return o;
      });
      cb({data:rows});
    };
    req.onerror=function(){cb({data:[]});};
  });
}

/* ── gasPost: tulis ke IndexedDB + antri sync ── */
function gasPost(action,sheet,data,id,cb){
  dbOpen(function(db){
    if(!db){cb({status:'error',message:'Database tidak tersedia'});return;}

    var tx=db.transaction([sheet,'sync_queue'],'readwrite');
    var store=tx.objectStore(sheet);
    var queue=tx.objectStore('sync_queue');
    var req;

    if(action==='add'){
      var row=Object.assign({},data);
      delete row.id; delete row._lid;
      row.created_at=new Date().toISOString();
      req=store.add(row);
      req.onsuccess=function(){
        /* Masukkan ke antrian sync */
        queue.add({action:'add',sheet:sheet,data:row,synced:0,ts:new Date().toISOString()});
        cb({status:'success'});
      };
    } else if(action==='delete'){
      req=store.delete(Number(id));
      req.onsuccess=function(){
        queue.add({action:'delete',sheet:sheet,id:id,synced:0,ts:new Date().toISOString()});
        cb({status:'success'});
      };
    } else if(action==='update'){
      var upd=Object.assign({},data);
      upd._lid=Number(id);
      upd.updated_at=new Date().toISOString();
      req=store.put(upd);
      req.onsuccess=function(){
        queue.add({action:'update',sheet:sheet,data:upd,id:id,synced:0,ts:new Date().toISOString()});
        cb({status:'success'});
      };
    } else {
      cb({status:'error',message:'Action tidak dikenal: '+action});return;
    }

    tx.onerror=function(){cb({status:'error',message:'Operasi database gagal'});};
  });
}

/* ══════════════════════════════════════════════
   SYNC ENGINE — Upload antrian ke GAS
══════════════════════════════════════════════ */

/* Kirim satu item ke GAS, kembalikan Promise */
function syncSendOne(item){
  return fetch(GAS,{
    method:'POST',
    body:JSON.stringify({action:item.action,sheet:item.sheet,data:item.data||{},id:item.id||''}),
    headers:{'Content-Type':'text/plain'}
  })
  .then(function(r){return r.json();})
  .then(function(res){
    if(res.status!=='success')throw new Error(res.message||'GAS error');
    return true;
  });
}

/* Tandai item sebagai sudah di-sync */
function syncMarkDone(qid){
  return new Promise(function(resolve){
    dbOpen(function(db){
      var tx=db.transaction('sync_queue','readwrite');
      var req=tx.objectStore('sync_queue').get(qid);
      req.onsuccess=function(){
        var item=req.result;
        if(item){item.synced=1;tx.objectStore('sync_queue').put(item);}
        resolve();
      };
    });
  });
}

/* Ambil semua item belum di-sync */
function syncGetPending(){
  return new Promise(function(resolve){
    dbOpen(function(db){
      var tx=db.transaction('sync_queue','readonly');
      var idx=tx.objectStore('sync_queue').index('synced');
      var req=idx.getAll(0); /* synced=0 */
      req.onsuccess=function(){resolve(req.result||[]);};
      req.onerror=function(){resolve([]);};
    });
  });
}

/* Hitung pending */
function syncCountPending(cb){
  syncGetPending().then(function(items){cb(items.length);});
}

/* Proses semua pending — sequential agar tidak spam GAS */
function syncFlush(onProgress){
  return syncGetPending().then(function(items){
    if(!items.length)return{sent:0,failed:0};
    var sent=0,failed=0;
    function next(i){
      if(i>=items.length)return Promise.resolve({sent:sent,failed:failed});
      return syncSendOne(items[i])
        .then(function(){
          sent++;
          return syncMarkDone(items[i]._qid);
        })
        .catch(function(){failed++;})
        .then(function(){
          if(onProgress)onProgress(sent+failed,items.length);
          return next(i+1);
        });
    }
    return next(0);
  });
}

/* ── Update badge indikator sync di header ── */
function syncUpdateBadge(){
  syncCountPending(function(n){
    var badge=document.getElementById('sync-badge');
    if(!badge)return;
    if(n>0){
      badge.textContent=n;
      badge.style.display='inline-flex';
    } else {
      badge.style.display='none';
    }
  });
}

/* ── Sync manual (dipanggil dari tombol) ── */
function syncNow(){
  if(!navigator.onLine){toast('⚠️ Tidak ada koneksi internet');return;}
  var btn=document.getElementById('sync-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Sinkronisasi...';}
  toast('⏳ Mengirim data ke server...');
  syncFlush(function(done,total){
    if(btn)btn.textContent='⏳ '+done+'/'+total+'...';
  }).then(function(res){
    var msg='✅ Sync selesai: '+res.sent+' data terkirim'+(res.failed?' · '+res.failed+' gagal':'');
    toast(msg);
    logAct('export','Sync ke GAS',res.sent+' data, '+res.failed+' gagal');
    syncUpdateBadge();
  }).catch(function(){
    toast('❌ Sync gagal. Coba lagi saat sinyal lebih baik.');
  }).finally(function(){
    if(btn){btn.disabled=false;btn.textContent='☁️ Sync Sekarang';}
  });
}

/* ── Auto-sync jam 21:00 ── */
function syncSchedule(){
  function msUntil21(){
    var now=new Date();
    var target=new Date();
    target.setHours(21,0,0,0);
    if(now>=target)target.setDate(target.getDate()+1); /* sudah lewat → besok */
    return target-now;
  }
  function doAutoSync(){
    if(!navigator.onLine){
      /* Coba lagi 30 menit kemudian jika offline */
      setTimeout(doAutoSync,30*60*1000);
      return;
    }
    syncCountPending(function(n){
      if(n===0){scheduleNext();return;}
      toast('🔄 Auto-sync dimulai ('+n+' data pending)...');
      syncFlush().then(function(res){
        toast('✅ Auto-sync: '+res.sent+' data terkirim'+(res.failed?' · '+res.failed+' gagal':''));
        logAct('export','Auto-Sync 21:00',res.sent+' data terkirim');
        syncUpdateBadge();
        scheduleNext();
      }).catch(scheduleNext);
    });
  }
  function scheduleNext(){
    setTimeout(doAutoSync,msUntil21());
  }
  /* Mulai jadwal */
  setTimeout(doAutoSync,msUntil21());
  /* Juga coba sync saat koneksi kembali muncul */
  window.addEventListener('online',function(){
    syncCountPending(function(n){
      if(n>0){
        toast('📶 Koneksi tersedia — '+n+' data akan disinkronkan');
        setTimeout(function(){
          syncFlush().then(function(res){
            if(res.sent>0){
              toast('✅ '+res.sent+' data berhasil disinkronkan');
              syncUpdateBadge();
            }
          });
        },3000); /* tunggu 3 detik pastikan koneksi stabil */
      }
    });
  });
}

/* ── Jalankan scheduler saat app siap ── */
dbOpen(function(){
  syncUpdateBadge();
  syncSchedule();
});
function logAct(type,title,desc){
  try{
    var logs=JSON.parse(localStorage.getItem('shm_logs')||'[]');
    logs.unshift({type:type,title:title,desc:desc,ts:new Date().toISOString()});
    localStorage.setItem('shm_logs',JSON.stringify(logs.slice(0,60)));
  }catch(e){/* storage diblokir, aktivitas tidak tercatat tapi app tetap jalan */}
}

/* ══════════════════════════════════════════════
   MATERIAL — Data Master (PLACEHOLDER, minta diganti user)
   Format: kode, nama, satuan, kategori (raw_material / consumable)
══════════════════════════════════════════════ */
var MATERIAL_MASTER=[{"kode":"00925442-1022","nama":"HEX HEAD BOLT_M10-1.5X40_FULL THREAD","satuan":"EA"},{"kode":"01010-61655","nama":"BOLT, MACHINE","satuan":"EA"},{"kode":"0159835001","nama":"CONTROL TRANSFORMER","satuan":"EA"},{"kode":"0191017103","nama":"MAIN CONTACTOR","satuan":"EA"},{"kode":"0191053111","nama":"VOLTMETER","satuan":"EA"},{"kode":"0191060118","nama":"AMMETER_2.5KA","satuan":"EA"},{"kode":"02762-00421","nama":"HOSE","satuan":"EA"},{"kode":"02763-00412","nama":"HOSE FUEL","satuan":"EA"},{"kode":"0490600605","nama":"DIODE_BLUE MARKING","satuan":"EA"},{"kode":"0490600625","nama":"DIODE_RED MARKING","satuan":"EA"},{"kode":"04QBANSMA","nama":"JOTAFIX PU TOPCOAT BLACK","satuan":"L"},{"kode":"04QBANSMA/GRN","nama":"JOTAFIX PU TOPCOAT GREEN","satuan":"L"},{"kode":"04QBANSMA/GRN2","nama":"JOTAFIX PU TOPCOAT GREEN","satuan":"L"},{"kode":"04QBAWSMA","nama":"JOTAFIX PU TOPCOAT WHITE","satuan":"L"},{"kode":"0533104701","nama":"MAIN SWITCH","satuan":"EA"},{"kode":"0648000404","nama":"FAN COMPLETTE","satuan":"EA"},{"kode":"0700-15195","nama":"O RING KOMATSU","satuan":"EA"},{"kode":"07000-12012","nama":"O-RING","satuan":"EA"},{"kode":"07000-12021","nama":"O-RING","satuan":"EA"},{"kode":"07000-13028","nama":"O-RING","satuan":"EA"},{"kode":"07000-13032","nama":"O-RING W3MM D32MM","satuan":"EA"},{"kode":"07000-13036","nama":"O-RING W3MM D36MM","satuan":"EA"},{"kode":"07097-21015","nama":"HOSE","satuan":"EA"},{"kode":"08230-00000","nama":"THINNER HEMPELS","satuan":"L"},{"kode":"08450-00000","nama":"THINNER HEMPELS","satuan":"L"},{"kode":"08XDRDWVA","nama":"SEAFORCE SHIELD DARK RED","satuan":"L"},{"kode":"092202WVA","nama":"THINNER NO. 02","satuan":"L"},{"kode":"092207WVA","nama":"THINNER NO 07","satuan":"L"},{"kode":"092210FVA","nama":"THINNER NO. 10","satuan":"L"},{"kode":"092217WVA","nama":"THINNER NO. 17","satuan":"L"},{"kode":"09244-02496","nama":"PIN","satuan":"EA"},{"kode":"0AR099SVA","nama":"JOTAMASTIC 80 BLACK","satuan":"L"},{"kode":"0ARGRESVA","nama":"JOTAMASTIC 80 GREY","satuan":"L"},{"kode":"0ARGRNSVA","nama":"JOTAMASTIC 80 GREEN","satuan":"L"},{"kode":"0ARREDSVA","nama":"JOTAMASTIC 80 RED","satuan":"L"},{"kode":"0FNBA5EQA","nama":"PILOT II YELLOW","satuan":"L"},{"kode":"0QZPLMRVA","nama":"SAFEGUARD UNIVERSAL ES","satuan":"L"},{"kode":"0S4099RVA","nama":"JOTAGUARD 660 BLACK","satuan":"L"},{"kode":"0S4GRERVA","nama":"JOTAGUARD 660 GREY","satuan":"L"},{"kode":"0S4REDRVA","nama":"JOTAGUARD 660 RED","satuan":"L"},{"kode":"0T1GRESVA","nama":"JOTAGUARD 630 GREY","satuan":"L"},{"kode":"0T1REDSVA","nama":"JOTAGUARD 630 RED","satuan":"L"},{"kode":"1000.01601","nama":"THINNER 1601 (THINNER PU, ACRYLIC)","satuan":"L"},{"kode":"1000.01625","nama":"THINNER 1625_POLYURETHANE (PU) THINNER","satuan":"L"},{"kode":"1000.01660","nama":"THINNER 1660 (THINNER EPOXY)","satuan":"L"},{"kode":"100005424","nama":"OIL SEPARATOR","satuan":"EA"},{"kode":"10171611-0002","nama":"CEMICAL ARUOW CALSIUM","satuan":"KG"},{"kode":"10171701-0007","nama":"HERBICIDE ROUNDAP 486 SL","satuan":"EA"},{"kode":"10402147-0001","nama":"RED LIPSTICK","satuan":"EA"},{"kode":"11101518-0001","nama":"CHALK POWDER","satuan":"KG"},{"kode":"11111701-0010","nama":"SILICA SAND","satuan":"KG"},{"kode":"11111806-0001","nama":"MODELING CLAY @500GRM","satuan":"EA"},{"kode":"11151505-0001","nama":"ASBESTOS TAPE 5MM","satuan":"ROL"},{"kode":"11151505-0002","nama":"PITA KAIN","satuan":"ROL"},{"kode":"11151512-0001","nama":"GLASS PAPER (PLASTIK MUKA) CUT INTO 4","satuan":"ROL"},{"kode":"11151515-0001","nama":"SERAT BALON HALUS @166.67GRAM/MTR","satuan":"G"},{"kode":"11151515-0002","nama":"SERAT BALON KASAR @800GRM/MTR","satuan":"G"},{"kode":"11162107-0001","nama":"RESIN CATION @25KG","satuan":"L"},{"kode":"115300-4280","nama":"INJECTION NOZZLE ASSY","satuan":"EA"},{"kode":"12050-50410","nama":"PAINT HEMPALIN PRIMER BROWN","satuan":"L"},{"kode":"12142116-0001","nama":"GAS OXYGENT ORIGINAL","satuan":"EA"},{"kode":"12181601-0003","nama":"FLUID, POWER STEERING, ATF, DM-3, DEXRON","satuan":"BT"},{"kode":"12352316-0010","nama":"SODA API / SODIUM HYDROXIDE","satuan":"EA"},{"kode":"126-1818","nama":"OIL FILTER","satuan":"EA"},{"kode":"13111204-0001","nama":"MIKA FILM TBL 0,20","satuan":"SHT"},{"kode":"150-27-00330","nama":"FLOATING SEAL","satuan":"EA"},{"kode":"15101505-0007","nama":"FUEL BIOSOLAR","satuan":"L"},{"kode":"15111510-0007","nama":"GAS LPG 50KG ORIGINAL","satuan":"EA"},{"kode":"15121501-0028","nama":"LUBE MEDITRAN S MIN 10W CF-2 (S10W)","satuan":"DR"},{"kode":"15121501-0033","nama":"LUBE TURALIK 48 ISO VG 46","satuan":"DR"},{"kode":"15121501-0044","nama":"LUBE RORED HDA MIN 90 GL-5 DR (SAE90)","satuan":"DR"},{"kode":"15121501-0047","nama":"LUBE MEDITRAN S SAE30 PERTAMINA","satuan":"DR"},{"kode":"15121501-0048","nama":"LUBE MEDITRAN SX PLUS SAE 15W-40","satuan":"DR"},{"kode":"15121501-0049","nama":"LUBE OMALA S2 GX 320","satuan":"DR"},{"kode":"15121501-0057","nama":"LUBE RORED HDA SAE 140 GL-5 (4LTR)","satuan":"PL"},{"kode":"15121803-0007","nama":"RUST REMOVER WD-40","satuan":"EA"},{"kode":"15121902-0003","nama":"GREASE EPX2NL KG","satuan":"KG"},{"kode":"15420-2OUTBOW","nama":"SOCKET OUTLET 2 OUTBOW 250V/16A","satuan":"EA"},{"kode":"15607-1731","nama":"LUBE FILTER","satuan":"EA"},{"kode":"15ASG-19990","nama":"PAINT HEMPADUR BLACK","satuan":"L"},{"kode":"15ASG-67120","nama":"PAINT HEMPADUR BROWN","satuan":"L"},{"kode":"1614765","nama":"TIRE VALVE STEM","satuan":"EA"},{"kode":"17634-11480","nama":"PAINT HEMPADUR QUATTRO GREY","satuan":"L"},{"kode":"17634-22090","nama":"PAINT HEMPADUR QUATTRO BEIGE","satuan":"L"},{"kode":"17634-50630","nama":"PAINT HEMPADUR QUATTRO RED","satuan":"L"},{"kode":"188-5500","nama":"CARRIER ROLLER CAT","satuan":"EA"},{"kode":"193-4640","nama":"SPIDER & BEARING GP","satuan":"EA"},{"kode":"1979679","nama":"SEGMENT","satuan":"EA"},{"kode":"1P-2299","nama":"FILTER A-F CAT","satuan":"EA"},{"kode":"2010PM","nama":"RACOR FILTER DONALDSON","satuan":"EA"},{"kode":"20111707-0001","nama":"BOR JANGKA 30 - 120MM","satuan":"EA"},{"kode":"20121610-0001","nama":"DRILL BIT BETON 8MM","satuan":"EA"},{"kode":"20121610-0002","nama":"DRILL BIT MITSUBISHI 20MM","satuan":"EA"},{"kode":"20121610-0003","nama":"STRAIGHT SHANK DRILL HSS 10MM (NACHI)","satuan":"EA"},{"kode":"20121613-0001","nama":"STRAIGHT SHANK DRILL HSS 12MM","satuan":"EA"},{"kode":"20122372-0001","nama":"SWIVEL JOINT 38 MM","satuan":"EA"},{"kode":"20122401-0001","nama":"ANTENNA CABLE SSB RG. U8-512 OHM","satuan":"M"},{"kode":"208-62-72480","nama":"HOSE 1080MM","satuan":"EA"},{"kode":"20Y-27-00110","nama":"SEAL ASSY","satuan":"EA"},{"kode":"20Y-27-21220","nama":"PIN","satuan":"EA"},{"kode":"20Y-27-21240","nama":"BEARING, WASHER, THRUST","satuan":"EA"},{"kode":"20Y-27-22210","nama":"BEARING, ROLLER, NEEDLE","satuan":"EA"},{"kode":"20Y-27-41120","nama":"SUN GEAR KOMATSU","satuan":"EA"},{"kode":"20Y-27-41180","nama":"LOCK PLATE KOMATSU","satuan":"EA"},{"kode":"20Y-27-77110","nama":"SPROCKET","satuan":"EA"},{"kode":"20Y-30-00481","nama":"CARRIER ROLLER","satuan":"EA"},{"kode":"20Y-30-00642","nama":"FRONT IDLER STD","satuan":"EA"},{"kode":"20Y-30-00671","nama":"CARRIER ROLLER","satuan":"EA"},{"kode":"20Y-30-07300","nama":"ROLLER","satuan":"EA"},{"kode":"20Y-30-42110","nama":"YOKE","satuan":"EA"},{"kode":"20Y-32-11260","nama":"SEAL","satuan":"EA"},{"kode":"20Y-60-32121","nama":"SOLENOID ASS'Y","satuan":"SET"},{"kode":"20Y-62-12520","nama":"HOSE","satuan":"EA"},{"kode":"20Y-62-13412","nama":"HOSE ASSY","satuan":"EA"},{"kode":"20Y-62-41181","nama":"HOSE","satuan":"SET"},{"kode":"20Y-62-51230","nama":"HOSE","satuan":"EA"},{"kode":"20Y-62-51240","nama":"HOSE","satuan":"EA"},{"kode":"20Y-62-51531","nama":"HOSE","satuan":"EA"},{"kode":"20Y-62-51541","nama":"HOSE","satuan":"EA"},{"kode":"20Y-62-51790","nama":"HOSE","satuan":"EA"},{"kode":"20Y-62-51922","nama":"HOSE ASSY","satuan":"SET"},{"kode":"20Y-62-52340","nama":"HOSE KOMATSU","satuan":"EA"},{"kode":"20Y-62-52350","nama":"HOSE KOMATSU","satuan":"EA"},{"kode":"21101801-0003","nama":"SPRAY TIP TITAN 615","satuan":"EA"},{"kode":"22101529-0002","nama":"ROLLER BLOCK OD 8\"  ( U/WIRE 16MM )","satuan":"EA"},{"kode":"226-0443","nama":"BELT SERPENTINE","satuan":"EA"},{"kode":"22B-54-17511","nama":"WORK LAMP ASSY","satuan":"EA"},{"kode":"22B-60-11160","nama":"STRAINER","satuan":"EA"},{"kode":"23022CC/W33","nama":"SPHERICAL ROLLER BEARING SKF","satuan":"UN"},{"kode":"23131503-0022","nama":"GRINDING DISC DIA 7 INCH","satuan":"EA"},{"kode":"23131503-0039","nama":"GRINDING DISC WIPRO GC120H-4460RPM W-13","satuan":"EA"},{"kode":"23131503-0040","nama":"GRINDING DISC WIPRO GC80L-4460RPM W-13","satuan":"EA"},{"kode":"23131513-0001","nama":"SANDING DISC 6\"","satuan":"EA"},{"kode":"23131513-0002","nama":"SANDING DISC 7\"","satuan":"EA"},{"kode":"23151513-0001","nama":"KARET TAMBAL LEBAR 75CM","satuan":"EA"},{"kode":"23151513-0002","nama":"LEM HITAM BINTIK-BINTIK","satuan":"EA"},{"kode":"23151513-0003","nama":"LEM RUBBER BOAT PUTIH","satuan":"EA"},{"kode":"23153032-0001","nama":"RING BESI ID 115, OD 150, THK 20 MM","satuan":"EA"},{"kode":"23181604-0001","nama":"MATA CUTTING TORCH SIZE : 1/16 NO. 3","satuan":"EA"},{"kode":"23181604-0003","nama":"MATA CUTTING TORCH SIZE : 5/64 NO. 4","satuan":"EA"},{"kode":"23226CCK/W33","nama":"SPHERICAL ROLLER BEARING SKF","satuan":"EA"},{"kode":"23241639-0005","nama":"STRAIGHT SHANK DRILL HSS 5MM","satuan":"EA"},{"kode":"23241639-0007","nama":"STRAIGHT SHANK DRILL HSS 8MM","satuan":"EA"},{"kode":"23271711-0006","nama":"PLASMA CUTTING ELECTRODE TIP 60A 1.3MM","satuan":"EA"},{"kode":"23271711-0014","nama":"NOZZEL CUTTING YAMATO 3/16, 1/32","satuan":"EA"},{"kode":"23271711-0018","nama":"PLASMA CUTTING NOZZLE TIP 60A 1.3MM","satuan":"EA"},{"kode":"23271711-0020","nama":"CUTTING TIP M LPG NO 2","satuan":"EA"},{"kode":"23271711-0021","nama":"CUTTING TIP M LPG NO 3","satuan":"EA"},{"kode":"23271711-0025","nama":"PLASMA CUTTING NOZZLE TIP 100A 1.7MM","satuan":"EA"},{"kode":"23271717-0006","nama":"FLASHBACK ARRESTOR OXYGEN-CUTTING TORCH","satuan":"EA"},{"kode":"23271717-0007","nama":"FLASHBACK ARRESTOR LPG-CUTTING TORCH","satuan":"EA"},{"kode":"23271717-0008","nama":"SAFETY FLASHBACK OXYGEN-REGULATOR","satuan":"EA"},{"kode":"23271717-0009","nama":"SAFETY FLASHBACK LPG/ACETYLENE-REGULATOR","satuan":"EA"},{"kode":"23271810-0110","nama":"WELDING ELECTRODES NK88 3,2MM","satuan":"KG"},{"kode":"23271810-0111","nama":"WELDING ELECTRODES NK88 4MM","satuan":"KG"},{"kode":"23271810-0112","nama":"WELDING ELECTRODES NSG 4,0MM","satuan":"KG"},{"kode":"23271810-0115","nama":"WELDING ELECTRODES NSN-308 4MM","satuan":"KG"},{"kode":"23271810-0121","nama":"WELDING ELECTRODES RD-460 4MM","satuan":"KG"},{"kode":"23271810-0124","nama":"WELDING ELECTRODES NK88 2,6MM","satuan":"KG"},{"kode":"23271810-0126","nama":"WELDING ELECTRODES RD-718 3,2MM","satuan":"KG"},{"kode":"23271810-0127","nama":"WELDING ELECTRODES 4MM HV450","satuan":"KG"},{"kode":"23271810-0128","nama":"WELDING ELECTRODES 4MM HV600","satuan":"KG"},{"kode":"23271810-0129","nama":"WELDING ELECTRODES CARBON 4MM","satuan":"KG"},{"kode":"23271810-0130","nama":"WELDING ELECTRODES CARBON 6MM","satuan":"KG"},{"kode":"23271810-0133","nama":"WELD ELECTRODES 5\"X400MM J38.12 E6013AWS","satuan":"KG"},{"kode":"23271810-0134","nama":"WELD ELECTRODES BRIDGE 5MM J421 E6013AWS","satuan":"KG"},{"kode":"23271813-0004","nama":"WELDING WIRE BRONZE 4 MM","satuan":"KG"},{"kode":"23271813-0006","nama":"WELD WIRE AWS.EM12 THM-43A GB H08MNA 4MM","satuan":"KG"},{"kode":"23271821-0009","nama":"PLASMA CUTTING TORCH 60A-120A CURRENT","satuan":"EA"},{"kode":"234-1951","nama":"SEAL LIFT CYL","satuan":"EA"},{"kode":"24101611-0032","nama":"SLING BELT 3TX3MTR","satuan":"EA"},{"kode":"24101638-0022","nama":"WIRE ROPE SLING 6X36 IWRC 1770 N/MM2X50M","satuan":"EA"},{"kode":"24101638-0039","nama":"THIMBLE EYE WIRE ROPE_52MMX25M_6X36","satuan":"EA"},{"kode":"24101641-0019","nama":"KENTER SHACKLE_34MM_LR CERTIF","satuan":"EA"},{"kode":"24101641-0031","nama":"ANCHOR SHACKLE_38MM_U2 GRADE_LR CERTIF","satuan":"EA"},{"kode":"24101641-0042","nama":"JOINING SHACKLE_36MM_LR CERTIF","satuan":"EA"},{"kode":"24101641-0050","nama":"KENTER SHACKLE_19MM_LR CERTIF","satuan":"EA"},{"kode":"24101641-0054","nama":"KENTER SHACKLE_32MM_LR CERTIF","satuan":"EA"},{"kode":"24101641-0056","nama":"KENTER SHACKLE_38MM_LR CERTIF","satuan":"EA"},{"kode":"24101641-0076","nama":"SHACKLE OMEGA BOLT 1\"-8,5T","satuan":"EA"},{"kode":"24101641-0077","nama":"SHACKLE OMEGA BOLT 2-1/2\"-55T","satuan":"EA"},{"kode":"24101641-0078","nama":"SHACKLE OMEGA BOLT 2\"-35T","satuan":"EA"},{"kode":"24101641-0079","nama":"SHACKLE OMEGA BOLT 3/4\"-4,75T","satuan":"EA"},{"kode":"24101641-0112","nama":"SHACKLE D BOLT 1/2\"-2T","satuan":"EA"},{"kode":"24101641-0116","nama":"ANCHOR SHACKLE 5/8\" M16","satuan":"EA"},{"kode":"24101641-0117","nama":"SHACKLE 1/2\"  GALV","satuan":"EA"},{"kode":"24101641-0118","nama":"SHACKLE FENDER M20","satuan":"EA"},{"kode":"24111818-0002","nama":"SEAL VALVE STEM 32A04-02801","satuan":"EA"},{"kode":"24111818-0003","nama":"SEGMENT","satuan":"SET"},{"kode":"24111818-0006","nama":"SEAL TAPE 1\"","satuan":"EA"},{"kode":"24111818-0008","nama":"SEAT VALVE INSERT ( A ) P/N 897037-6860","satuan":"EA"},{"kode":"24111818-0009","nama":"SEAT VALVE INSERT ( B ) P/N 511711-0280","satuan":"EA"},{"kode":"24112111-0001","nama":"STAVOL 600 VA","satuan":"EA"},{"kode":"24112208-0001","nama":"SPRAY TIP 517","satuan":"EA"},{"kode":"24112208-0002","nama":"SPRAY TIP 521","satuan":"EA"},{"kode":"24141501-0001","nama":"STRETCH WRAP FILMS","satuan":"ROL"},{"kode":"24141504-0001","nama":"INDICATIVE SEAL","satuan":"EA"},{"kode":"25171502-0002","nama":"WIPER AC 220V","satuan":"SET"},{"kode":"25171708-0001","nama":"KAMPAS KOPLING FORKLIFT S6S","satuan":"EA"},{"kode":"25171713-0002","nama":"BRAKE LINING 100X10MMX1MTR","satuan":"M"},{"kode":"25171713-0004","nama":"BRAKE LINING 100X8MMX1MTR","satuan":"M"},{"kode":"25171713-0005","nama":"BRAKE LINING 120X20MMX1MTR","satuan":"M"},{"kode":"25171713-0006","nama":"BRAKE LINING 150X10MMX1MTR","satuan":"M"},{"kode":"25171713-0008","nama":"BRAKE LINING 150X20MMX1MTR","satuan":"M"},{"kode":"25171713-0015","nama":"BRAKE LINING 50X10MMX1MTR","satuan":"M"},{"kode":"25172011-0001","nama":"SPRING @14KG ( SHOCK ABSORBER )","satuan":"EA"},{"kode":"25172502-0061","nama":"INNER TUBE TYRE 7.00-12 TR-75A","satuan":"EA"},{"kode":"25172503-0003","nama":"TYRE FENDER EX LOADER R25 SIZE 23,5","satuan":"EA"},{"kode":"25172503-0034","nama":"HEAVY TRUCK TIRE_SIZE 7.50-16 14PLY","satuan":"EA"},{"kode":"25172503-0038","nama":"SKID-STEER TUBELESS TIRE_12 X 16.5-12PLY","satuan":"EA"},{"kode":"25172504-0006","nama":"TYRE FORKLIFT (TUBE) SIZE 7.00-12 12PR","satuan":"EA"},{"kode":"25172504-0008","nama":"TYRE FORKLIFT (TUBE) SIZE 8.25-15 14PR","satuan":"EA"},{"kode":"25172509-0003","nama":"HEAVY TRUCK TIRE INNER TUBE_SIZE 7.50-16","satuan":"EA"},{"kode":"25172509-0004","nama":"HEAVY TRUCK TIRE FLAP_SIZE 7.50-16","satuan":"EA"},{"kode":"25172511-0014","nama":"TIRE PLUG PATCH SLP 6X35X50MM","satuan":"BOX"},{"kode":"25172511-0015","nama":"TUBE PATCH NO 5 (TIP TOP)","satuan":"BOX"},{"kode":"25172511-0018","nama":"TIRE PLUG PATCH SLP 9X40X75MM","satuan":"BOX"},{"kode":"25172511-0019","nama":"TIRE PLUG PATCH SLP 12X45X75MM","satuan":"BOX"},{"kode":"25172511-0020","nama":"TIRE SEAL STRING_6MM DIA_2MM LENGTH","satuan":"BOX"},{"kode":"25173807-0008","nama":"SHAFT 2034","satuan":"EA"},{"kode":"25173815-0001","nama":"CABLE SUB-AS PARKING BRK 47504-36780-71","satuan":"EA"},{"kode":"25173815-0002","nama":"CABLE SUB-AS PARKING BRK 47505-36780-71","satuan":"EA"},{"kode":"25174003-0001","nama":"RADIATOR CAP MD","satuan":"EA"},{"kode":"25174004-0005","nama":"SUPER COOLANT AF-NAC 18LTR KOMATSU","satuan":"EA"},{"kode":"25174004-0008","nama":"PERTAMINA HD COOLANT EG","satuan":"EA"},{"kode":"25202509-0001","nama":"SHOCK FEMALE THREADED 2 1/2\"","satuan":"EA"},{"kode":"25202509-0002","nama":"SHOCK THREADED 1 1/2\"","satuan":"EA"},{"kode":"25202509-0003","nama":"SHOCK THREADED 1\"","satuan":"EA"},{"kode":"25202509-0005","nama":"SHOCK TRANFOSIAL 1/2\"","satuan":"EA"},{"kode":"25202509-0006","nama":"SHOCK TRANFOSIAL 1-1/2\"","satuan":"EA"},{"kode":"25202509-0007","nama":"SHOCK INSIDE THREAD 1/2`","satuan":"EA"},{"kode":"256-7902","nama":"AIR CLEANER PRIMARY","satuan":"EA"},{"kode":"256-7903","nama":"AIR CLEANER SECONDARY","satuan":"EA"},{"kode":"26101727-0010","nama":"RING PISTON ZH 115 4R","satuan":"EA"},{"kode":"26101728-0001","nama":"TUBE NO. 4, 5 6754-71-5230","satuan":"EA"},{"kode":"26111703-0037","nama":"BATTERY (ACCU) N120 12V/120A","satuan":"EA"},{"kode":"26111703-0044","nama":"BATTERY (ACCU) 12V/150A","satuan":"EA"},{"kode":"26111703-0046","nama":"BATTERY (ACCU) 12V/70A","satuan":"EA"},{"kode":"26111801-0073","nama":"VAN BELT B63","satuan":"EA"},{"kode":"26111801-0085","nama":"VAN BELT A58","satuan":"EA"},{"kode":"26111801-0087","nama":"VAN BELT B86-8860MBO","satuan":"EA"},{"kode":"26111801-0089","nama":"V-BELT 5540/17 X 1350","satuan":"EA"},{"kode":"26121548-0001","nama":"WIRE EMAIL 0,35MM","satuan":"KG"},{"kode":"26121548-0002","nama":"WIRE EMAIL 0.65MM","satuan":"KG"},{"kode":"2656F843","nama":"FUEL FILTER PERKINS","satuan":"EA"},{"kode":"27111602-0032","nama":"SLEDGE HAMMER 5KG","satuan":"EA"},{"kode":"27111708-0005","nama":"WRENCH PIPE 24\"","satuan":"EA"},{"kode":"27111802-0003","nama":"GLASS PENDUGA 12 MM X 2 MTR","satuan":"EA"},{"kode":"27111907-0021","nama":"IRON BRUSH","satuan":"EA"},{"kode":"27111907-0022","nama":"MINI AIR GRINDER","satuan":"EA"},{"kode":"27111907-0023","nama":"MINI WIRE CUP BRUSH","satuan":"EA"},{"kode":"27111907-0025","nama":"WIRE CUP BRUSH 3\" ( M10 X 1.5 )","satuan":"EA"},{"kode":"27111930-0001","nama":"SMOOTH ROUND FILES","satuan":"EA"},{"kode":"27112129-0001","nama":"CABLE CLAMP 1''","satuan":"EA"},{"kode":"27112129-0002","nama":"CABLE CLAMP 1/2''","satuan":"EA"},{"kode":"27112501-0010","nama":"BENDING SPRING PIPE 25MM","satuan":"EA"},{"kode":"27112701-0015","nama":"PLASTIC BLOWER 20CM X 8CM","satuan":"ROL"},{"kode":"27112739-0001","nama":"VC-BELT ALTERNATOR FORKLIFT S6S","satuan":"EA"},{"kode":"27112749-0001","nama":"ANGEL GRINDER SXJ 150 120 T","satuan":"UN"},{"kode":"27112802-0003","nama":"HACKSAW BLADE 12\" 24TPI","satuan":"EA"},{"kode":"27112802-0004","nama":"CHAINSAW MS 180","satuan":"EA"},{"kode":"27112805-0001","nama":"HAND TAB M1 X 8","satuan":"EA"},{"kode":"27112838-0015","nama":"CUTTING WHEEL 14\"","satuan":"EA"},{"kode":"27112838-0016","nama":"CUTTING WHEEL 4\"","satuan":"EA"},{"kode":"27112839-0002","nama":"TRIANGLE CARBIDE TIP 10MM","satuan":"EA"},{"kode":"27112913-0002","nama":"LUBE GC32 PERTAMINA","satuan":"L"},{"kode":"27112913-0004","nama":"LUBE TURALIK 43 @209LTR","satuan":"L"},{"kode":"27112913-0006","nama":"PERTAMINA RORED HAD SAR 90API GL-5 @4LTR","satuan":"BT"},{"kode":"27121701-0109","nama":"HYD HOSE 1/4\" X 4MTR (AS SAMPLE)","satuan":"EA"},{"kode":"27121701-0110","nama":"HYD HOSE 3/8 X 2W UNIHOSE X 165CM","satuan":"EA"},{"kode":"27121701-0111","nama":"HYD HOSE 3/8 X 350CM - PLT06","satuan":"EA"},{"kode":"27121816-0001","nama":"CALTER OLI ( BELLOW )","satuan":"EA"},{"kode":"27131613-0002","nama":"COUPLING GUN 1\"","satuan":"EA"},{"kode":"278-2355","nama":"SEGMENT","satuan":"EA"},{"kode":"278-2356","nama":"SEGMENT DOZER D3K CAT","satuan":"EA"},{"kode":"2923911","nama":"OIL SEAL HITACHI","satuan":"EA"},{"kode":"2A5-30-00111","nama":"TRACK ROLLER","satuan":"EA"},{"kode":"2S-5301","nama":"SEAL 25-5301 CAT","satuan":"EA"},{"kode":"2S-5551","nama":"COUPLING CAT","satuan":"EA"},{"kode":"30101504-0004","nama":"ANGLE BAR EA M/S 100X100X10X6000MM","satuan":"EA"},{"kode":"30101504-0007","nama":"ANGLE BAR EA M/S 120X120X12X6000MM","satuan":"EA"},{"kode":"30101504-0008","nama":"ANGLE BAR EA M/S 150X150X12X6000MM","satuan":"EA"},{"kode":"30101504-0010","nama":"ANGLE BAR UA M/S 150X90X9X6000MM","satuan":"EA"},{"kode":"30101504-0013","nama":"ANGLE BAR EA M/S 50X50X5X6000MM","satuan":"EA"},{"kode":"30101504-0019","nama":"ANGLE BAR EA M/S 75X75X6X6000MM","satuan":"EA"},{"kode":"30101504-0022","nama":"ANGLE BAR EA M/S 80X80X8X6000MM","satuan":"EA"},{"kode":"30101504-0059","nama":"ANGLE BAR EA M/S 150X150X10X6000MM","satuan":"EA"},{"kode":"30101504-0075","nama":"ANGLE BAR UA M/S 125X75X10X6000MM","satuan":"EA"},{"kode":"30101504-0103","nama":"ANGLE BAR UA M/S_150X90X10MM_6000MM","satuan":"EA"},{"kode":"30101704-0001","nama":"H BEAM M/S 150X150X7X10X6000MM","satuan":"EA"},{"kode":"30101704-0003","nama":"H BEAM M/S 200X200X8X12X6000MM","satuan":"EA"},{"kode":"30101704-0004","nama":"H BEAM M/S 300X300X10X15X6000MM","satuan":"EA"},{"kode":"30101704-0005","nama":"H BEAM M/S 350X350X12X19X6000MM","satuan":"EA"},{"kode":"30102201-0010","nama":"SHEET PLATE ALUMINIUM 2X1200X2400MM","satuan":"SHT"},{"kode":"30102204-0017","nama":"SHEET PLATE M/S A36 ABS-A 12X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0018","nama":"SHEET PLATE M/S A36 ABS-A 14X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0019","nama":"SHEET PLATE M/S A36 ABS-A 16X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0020","nama":"SHEET PLATE M/S A36 ABS-A 8X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0021","nama":"SHEET PLATE M/S A36 BKI-A 10X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0022","nama":"SHEET PLATE M/S A36 BKI-A 12X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0023","nama":"SHEET PLATE M/S A36 BKI-A 14X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0024","nama":"SHEET PLATE M/S A36 BKI-A 16X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0025","nama":"SHEET PLATE M/S A36 BKI-A 20X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0026","nama":"SHEET PLATE M/S A36 BKI-A 6X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0027","nama":"SHEET PLATE M/S A36 BKI-A 8X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0029","nama":"SHEET PLATE M/S A36 NC 10X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0039","nama":"SHEET PLATE M/S A36 NC 25X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0045","nama":"SHEET PLATE M/S A36 NC 6X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0047","nama":"SHEET PLATE M/S A36 NC 8X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0051","nama":"STRIP PLATE M/S 12X100X6000MM","satuan":"SHT"},{"kode":"30102204-0053","nama":"STRIP PLATE M/S 12X75X6000MM","satuan":"SHT"},{"kode":"30102204-0055","nama":"STRIP PLATE M/S 4,5X50X6000MM","satuan":"SHT"},{"kode":"30102204-0071","nama":"SHEET PLATE M/S A36 BKI-A 25X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0076","nama":"BANDED PLATE 8MMX400+F100X20FT BKI","satuan":"SHT"},{"kode":"30102204-0083","nama":"CHECKERED PLATE 4X1200X2400MM","satuan":"SHT"},{"kode":"30102204-0084","nama":"CHECKERED PLATE 6X1200X2400MM","satuan":"SHT"},{"kode":"30102204-0085","nama":"BANDED PLATE 10MMX500+F100X20FT BKI","satuan":"SHT"},{"kode":"30102204-0090","nama":"SHEET PLATE M/S A36 ABS-A 10X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0092","nama":"SHEET PLATE M/S A36 NC 12X1800X6000MM","satuan":"SHT"},{"kode":"30102204-0094","nama":"SHEET PLATE M/S A36 NC 14X1800X6000MM","satuan":"SHT"},{"kode":"30103201-0002","nama":"GRATING C/S 1X3/16\"X900X6000MM","satuan":"SHT"},{"kode":"30111601-0009","nama":"CEMENT, SC2000 @690ML + HARDENER @40ML","satuan":"KIT"},{"kode":"30111601-0017","nama":"WHITE CEMENT","satuan":"KG"},{"kode":"30111601-0025","nama":"CEMENT 50KG","satuan":"SAK"},{"kode":"30111903-0004","nama":"WIRE MESH FOR MOSQUITO (SMALL HOLE)","satuan":"M"},{"kode":"30111903-0010","nama":"WIRE GAUZE 2X2MM","satuan":"M"},{"kode":"30141508-0002","nama":"INSULATION GLASSWOOL DENSITY 32MG/M2","satuan":"ROL"},{"kode":"30161809-0001","nama":"PAD AIRLEST","satuan":"EA"},{"kode":"30161809-0002","nama":"PAD GT 0960","satuan":"EA"},{"kode":"30171606-0001","nama":"SIDE SCUTTLE ( JENDELA BULAT ) 16\"","satuan":"EA"},{"kode":"30181506-0001","nama":"URINOR DUTY U-17 BLUE","satuan":"EA"},{"kode":"30262501-0001","nama":"BRONZE HOLLOW BAR ID 31 X OD 70 X 6000MM","satuan":"KG"},{"kode":"30263202-0001","nama":"STRIP LH 95 1045","satuan":"EA"},{"kode":"30263601-0003","nama":"ROUND BAR_6IN X 6000MM_S45C GRADE","satuan":"EA"},{"kode":"30263601-0004","nama":"ROUND BAR_6-1/2IN X 6000MM_S45C GRADE","satuan":"EA"},{"kode":"30266408-0001","nama":"NON ASBESTOS TAPE 2\"","satuan":"M"},{"kode":"30266408-0004","nama":"SELONGSONG ASBES 1MM","satuan":"M"},{"kode":"30266501-0001","nama":"RUBBER STRIP 5317742-150MM","satuan":"EA"},{"kode":"30840+95881","nama":"PAINT HEMPADUR MASTIC BLUE /W CURING AG","satuan":"L"},{"kode":"31151503-0004","nama":"PP ROPE MONOFILAMENT CIR 12X220MTR","satuan":"ROL"},{"kode":"31151503-0008","nama":"PP ROPE MONOFILAMENT CIR 8X200MTR","satuan":"ROL"},{"kode":"31151503-0009","nama":"PP ROPE MULTIFILAMENT CIR 10X220MTR","satuan":"ROL"},{"kode":"31151503-0010","nama":"PP ROPE MULTIFILAMENT CIR 1-1/4X220MTR","satuan":"ROL"},{"kode":"31151505-0027","nama":"WIRE GALV 6X36 BOTH FREE 16X135MTR-RHOL","satuan":"002"},{"kode":"31151505-0034","nama":"WIRE RP GALV 38MM IWRC RHOL GR.1960 6X36","satuan":"M"},{"kode":"31151604-0002","nama":"CHAIN_3/4IN X 1MTR_GALV","satuan":"EA"},{"kode":"31151604-0003","nama":"CHAIN_5/8IN X 1MTR_GALV","satuan":"EA"},{"kode":"31161505-0050","nama":"FISHER 10MM / 100PCS","satuan":"PAC"},{"kode":"31161616-0006","nama":"U-BOLT GALV 2-1/2\" M12","satuan":"EA"},{"kode":"31161616-0007","nama":"U-BOLT GALV 2X3/8\"","satuan":"EA"},{"kode":"31161616-0008","nama":"U-BOLT GALV 3\"X3/8\"","satuan":"EA"},{"kode":"31161616-0009","nama":"U-BOLT GALV 4\" M12","satuan":"EA"},{"kode":"31161616-0012","nama":"U-BOLT GALV 1\" M10","satuan":"EA"},{"kode":"31161616-0013","nama":"U-BOLT GALV 1-1/4\" M10","satuan":"EA"},{"kode":"31161616-0016","nama":"U-BOLT GALV 5\" M12","satuan":"EA"},{"kode":"31161616-0019","nama":"U-BOLT GALV 1-1/2\" M10","satuan":"EA"},{"kode":"31161616-0023","nama":"U-BOLT GALV 6\" M16","satuan":"EA"},{"kode":"31161616-0024","nama":"U-BOLT (STEEL GALVANIZED) 1 1/2\"","satuan":"EA"},{"kode":"31161616-0025","nama":"U-BOLT (STEEL GALVANIZED) 10\"","satuan":"EA"},{"kode":"31161616-0030","nama":"U-BOLT (STEEL GALVANIZED) 8\"XM19","satuan":"EA"},{"kode":"31161616-0031","nama":"U-BOLT 1/2\"","satuan":"EA"},{"kode":"31161616-0032","nama":"U-BOLT 3/4\"","satuan":"EA"},{"kode":"31161618-0009","nama":"THREADED BAR S/S 3/4\"X1000MM","satuan":"EA"},{"kode":"31161618-0018","nama":"THREADED BAR S/S M16X2000MM","satuan":"EA"},{"kode":"31161618-0019","nama":"THREADED BAR S/S M18X1000MM","satuan":"EA"},{"kode":"31161619-0003","nama":"STUD BOLT S/S M20 X 1 MTR","satuan":"EA"},{"kode":"31161619-0005","nama":"STUD SS M 16 X 1 MTR","satuan":"EA"},{"kode":"31161619-0006","nama":"STUD BOLT 7/8' X 1 MTR","satuan":"EA"},{"kode":"31161620-0075","nama":"BOLT, HEX. HEAD, M12X60, FT ZINC PLATED","satuan":"EA"},{"kode":"31161620-0082","nama":"BOLT STAINLESS STEEL M8 X 20 MM","satuan":"EA"},{"kode":"31161620-0083","nama":"BOLT STAINLESS STEEL M10 X 20 MM","satuan":"EA"},{"kode":"31161620-0091","nama":"BOLT STAINLESS STEEL M6 X 40 MM","satuan":"EA"},{"kode":"31161727-0004","nama":"HEX NUT S/S M16","satuan":"EA"},{"kode":"31161727-0005","nama":"HEX NUT S/S M20","satuan":"EA"},{"kode":"31161727-0009","nama":"HEX NUT BLACK GR 8.8 M20","satuan":"EA"},{"kode":"31161727-0018","nama":"HEX. BOLT & NUT ( GALV'D ) M6 X 10","satuan":"EA"},{"kode":"31161727-0023","nama":"HEX BOLT & NUT BLACK (HT8.8) 5/8X2-1/2\"","satuan":"EA"},{"kode":"31161727-0025","nama":"HEX. BOLT & NUT ( HT8.8 ) M18 X 100","satuan":"EA"},{"kode":"31161740-0017","nama":"HEAD HEX BOLT M12X40 GR8.8","satuan":"EA"},{"kode":"31161740-0085","nama":"COUNTERSUNK HEAD SCREW BRASS M8X50MM","satuan":"EA"},{"kode":"31161740-0087","nama":"HEX BOLT & NUT BLACK GR 8.8 3/8X1\"","satuan":"EA"},{"kode":"31161740-0089","nama":"HEX BOLT & NUT GALV GR 8.8 M20X80MM","satuan":"EA"},{"kode":"31161740-0093","nama":"HEX BOLT & NUT S/S M20X105MM","satuan":"EA"},{"kode":"31161740-0094","nama":"HEX BOLT & NUT BLACK GR 10.9 M10X50MM","satuan":"EA"},{"kode":"31161740-0097","nama":"HEX BOLT & NUT S/S M24X140MM","satuan":"EA"},{"kode":"31161740-0103","nama":"HEX BOLT & NUT BLACK GR 8.8 M16X65MM","satuan":"EA"},{"kode":"31161740-0105","nama":"HEX BOLT & NUT BLACK GR 8.8 M20X105MM","satuan":"EA"},{"kode":"31161740-0109","nama":"HEX BOLT & NUT BLACK GR 8.8 M22X115MM","satuan":"EA"},{"kode":"31161740-0111","nama":"HEX BOLT & NUT BLACK GR 8.8 M24X140MM","satuan":"EA"},{"kode":"31161740-0148","nama":"HEX BOLT & NUT BLACK GR 8.8 M20X130MM","satuan":"EA"},{"kode":"31161740-0194","nama":"HEX BOLT & NUT S/S 5/8\"X50MM","satuan":"EA"},{"kode":"31161740-0196","nama":"HEX BOLT & NUT BLACK GR 8.8 M8X40MM","satuan":"EA"},{"kode":"31161740-0197","nama":"COUNTERSUNK HEAD SCREW BRASS M6X40MM","satuan":"EA"},{"kode":"31161740-0215","nama":"COUNTERSUNK HEAD SCREW S/S M12X70MM","satuan":"EA"},{"kode":"31161740-0306","nama":"HEX BOLT & NUT GALV GR 8.8 M20X70MM","satuan":"EA"},{"kode":"31161740-0307","nama":"HEX BOLT & NUT S/S 3/4\"X50MM","satuan":"EA"},{"kode":"31161740-0308","nama":"HEX BOLT & NUT S/S 5/8\"X65MM","satuan":"EA"},{"kode":"31161740-0313","nama":"HEX BOLT & NUT S/S M14X65MM","satuan":"EA"},{"kode":"31161740-0314","nama":"HEX BOLT & NUT S/S M20X50MM","satuan":"EA"},{"kode":"31161740-0328","nama":"HEX BOLT & NUT BLACK GR 8.8 M12X65MM","satuan":"EA"},{"kode":"31161740-0330","nama":"HEX BOLT & NUT BLACK GR 8.8 M14X50MM","satuan":"EA"},{"kode":"31161740-0334","nama":"HEX BOLT & NUT BLACK GR 8.8 M16X50MM","satuan":"EA"},{"kode":"31161740-0343","nama":"BOLT & NUT ( STEEL ) 5/8\" X 3\"","satuan":"EA"},{"kode":"31161740-0344","nama":"BOLT & NUT (GALV) M20 X 90MM","satuan":"EA"},{"kode":"31161740-0345","nama":"BOLT & NUT (STEEL) 30MMX200MM","satuan":"EA"},{"kode":"31161740-0349","nama":"BOLT & NUT+ RING M27 X 140MM (GR10.9)","satuan":"SET"},{"kode":"31161740-0351","nama":"BOLT LONG DRAT 3/4 X 1MTR BLACK","satuan":"EA"},{"kode":"31161740-0352","nama":"BOLT NUT 27 X 120MM","satuan":"EA"},{"kode":"31161740-0353","nama":"BOLT NUT 30 X 125MM","satuan":"EA"},{"kode":"31161740-0355","nama":"BOLT NUT BLACK 5/8 X 2''","satuan":"EA"},{"kode":"31161740-0357","nama":"BOLT TYRE FORKLIFT S6S","satuan":"EA"},{"kode":"31161740-0358","nama":"BOLT WHEEL J1833-07100","satuan":"EA"},{"kode":"31161740-0363","nama":"HEX BOLT & NUT BLACK GR 10.9 3/4\"X65MM","satuan":"EA"},{"kode":"31161740-0364","nama":"HEX BOLT & NUT BLACK GR 10.9 7/8\"X65MM","satuan":"EA"},{"kode":"31161740-0366","nama":"HEX BOLT & NUT GALV GR 8.8 M12X75MM","satuan":"EA"},{"kode":"31161740-0368","nama":"HEX BOLT & NUT S/S 1/2\"X50MM","satuan":"EA"},{"kode":"31161740-0369","nama":"HEX BOLT & NUT S/S 1/2\"X65MM","satuan":"EA"},{"kode":"31161740-0370","nama":"NUT 00800","satuan":"EA"},{"kode":"31161740-0371","nama":"NUT 5/8\" BLACK","satuan":"EA"},{"kode":"31161740-0372","nama":"NUT M10 X 1.25PITCH (S/S)","satuan":"EA"},{"kode":"31161740-0373","nama":"NUT STEEL DIA 1-1/2\"","satuan":"EA"},{"kode":"31161740-0374","nama":"NUT STEEL DIA 7/8\"","satuan":"EA"},{"kode":"31161740-0376","nama":"BOLT & NUT ( HT8.8 ) 7/8 X 3\"","satuan":"EA"},{"kode":"31161740-0378","nama":"BOLT & NUT ( S/S ) M14 X 25","satuan":"SET"},{"kode":"31161740-0379","nama":"BOLT & NUT ( S/S ) M6 X 120MM","satuan":"EA"},{"kode":"31161740-0382","nama":"BOLT & NUT (STEEL GALVANIZED) M16 X 65MM","satuan":"EA"},{"kode":"31161740-0383","nama":"BOLT & NUT (STEEL GALVANIZED) M16 X 75MM","satuan":"EA"},{"kode":"31161740-0389","nama":"BOLT & NUT S/S 3/4 X 2 1/2\" SS","satuan":"EA"},{"kode":"31161740-0391","nama":"BOLT & NUT S/S M16 X 2\"","satuan":"SET"},{"kode":"31161740-0395","nama":"BOLT NUT HITAM ( HT8.8 ) 3/4 X 3\"","satuan":"EA"},{"kode":"31161740-0396","nama":"BOLT NUT HITAM 3/4 X 1 1/2\"","satuan":"EA"},{"kode":"31161740-0398","nama":"BRASS BUTTERFLY BOLT 5/8X 5\" /W WING NUT","satuan":"EA"},{"kode":"31161740-0401","nama":"NUT BLACK 7/8\"","satuan":"EA"},{"kode":"31161740-0402","nama":"NUT S/S 3/4\"","satuan":"EA"},{"kode":"31161740-0403","nama":"NUT S/S 5/8\"","satuan":"EA"},{"kode":"31161740-0404","nama":"NUT S/S 7/8\"","satuan":"EA"},{"kode":"31161740-0420","nama":"BOLT NUT BLACK 1/2X2IN","satuan":"EA"},{"kode":"31161740-0421","nama":"HEX BOLT NUT BLACK HT8.8 M12X50 (P-1.75)","satuan":"EA"},{"kode":"31161740-0422","nama":"BOLT NUT BLACK 1/2X2-1/2IN","satuan":"EA"},{"kode":"31161807-0010","nama":"FLAT WASHER GALV M12","satuan":"EA"},{"kode":"31161807-0011","nama":"FLAT WASHER GALV M20","satuan":"EA"},{"kode":"31161807-0012","nama":"FLAT WASHER S/S M12","satuan":"EA"},{"kode":"31161807-0013","nama":"FLAT WASHER S/S M20","satuan":"EA"},{"kode":"31161807-0016","nama":"FLAT WASHER M16 GALV","satuan":"EA"},{"kode":"31161811-0003","nama":"SPRING WASHER S/S M12","satuan":"EA"},{"kode":"31161811-0004","nama":"SPRING WASHER S/S M20","satuan":"EA"},{"kode":"31161811-0010","nama":"SPRING WASHER S/S M16","satuan":"EA"},{"kode":"31161811-0011","nama":"FLAT WASHER S/S M16","satuan":"EA"},{"kode":"31162002-0001","nama":"CLEAM NAILS","satuan":"EA"},{"kode":"31162002-0002","nama":"RIVET NAILS","satuan":"EA"},{"kode":"31162201-0004","nama":"RIVET P/N : 406763","satuan":"EA"},{"kode":"31162203-0001","nama":"STANG RIVET","satuan":"EA"},{"kode":"31162305-0001","nama":"GRATING CLIPS GALV","satuan":"EA"},{"kode":"31162405-0015","nama":"HARD NEEDLE 6MM","satuan":"EA"},{"kode":"31162405-0017","nama":"TURNBUCKLE 1/2 X L30","satuan":"EA"},{"kode":"31162416-0001","nama":"BLASTING COUPLING HOSE MALE END","satuan":"EA"},{"kode":"31162416-0003","nama":"COUPLING HOSE END 1\"","satuan":"EA"},{"kode":"31162416-0004","nama":"COUPLING HOSE MALE 1\"","satuan":"EA"},{"kode":"31162506-0003","nama":"BRACKET AC","satuan":"SET"},{"kode":"31162804-0001","nama":"DOOR TOGGLE","satuan":"EA"},{"kode":"31162813-0003","nama":"WIRE CLIPS GALV 22MM","satuan":"EA"},{"kode":"31162813-0004","nama":"WIRE CLIPS GALV 32MM","satuan":"EA"},{"kode":"31162813-0005","nama":"WIRE CLIPS GALV 38MM","satuan":"EA"},{"kode":"31162813-0017","nama":"WIRE CLIPS GALV 19MM","satuan":"EA"},{"kode":"31162813-0018","nama":"WIRE CLIPS GALV 3MM","satuan":"EA"},{"kode":"31162813-0019","nama":"WIRE CLIPS M26","satuan":"EA"},{"kode":"31162818-0001","nama":"ALUMINIUM ANODES BW 13,2KG","satuan":"EA"},{"kode":"31162818-0002","nama":"ALUMINIUM ANODES BW 3,2KG","satuan":"EA"},{"kode":"31162818-0003","nama":"ALUMINIUM ANODES BW 5,2KG","satuan":"EA"},{"kode":"31162818-0005","nama":"ALUMINIUM ANODES BW 9KG","satuan":"EA"},{"kode":"31162818-0008","nama":"ZINC ANODE TYPE WZ ( GW 8,5 KG )","satuan":"EA"},{"kode":"31162819-0002","nama":"LEVER BLOCK 3T","satuan":"UN"},{"kode":"31162906-0017","nama":"CLAMP HOSE 4 INCH","satuan":"EA"},{"kode":"31162906-0034","nama":"CLAMP HOSE S/S 3\"","satuan":"EA"},{"kode":"31162906-0050","nama":"CLAMP HOSE S/S 1\"","satuan":"EA"},{"kode":"31162906-0052","nama":"CLAMP HOSE S/S 1/2\"","satuan":"EA"},{"kode":"31163006-0002","nama":"SCREW COUPLING BLASTING","satuan":"EA"},{"kode":"31163011-0001","nama":"COUPLING HOSE END 1\"","satuan":"EA"},{"kode":"31163101-0011","nama":"SOCK PUMO","satuan":"EA"},{"kode":"31163201-0011","nama":"SLEEP PER 4 MM","satuan":"EA"},{"kode":"31163224-0001","nama":"SMALL GRENDEL","satuan":"EA"},{"kode":"31171505-0180","nama":"BEARING ROLL MO9D0004","satuan":"EA"},{"kode":"31171540-0001","nama":"NEADLE BEARING","satuan":"EA"},{"kode":"31171541-0001","nama":"BEARING NTN","satuan":"EA"},{"kode":"31171541-0002","nama":"BEARING SPHERICAL","satuan":"EA"},{"kode":"31171610-0001","nama":"HEAD POLE BATTERY ACCU","satuan":"EA"},{"kode":"31171802-0001","nama":"PLATE FRONT IDELER 6P 6653","satuan":"EA"},{"kode":"31181701-0003","nama":"PACKING FIREFLY/TBA 2MM","satuan":"SHT"},{"kode":"31181701-0004","nama":"PACKING FIREFLY/TBA 3,2MM","satuan":"SHT"},{"kode":"31181701-0006","nama":"RUBBER PACKING 2MM - L : 1MTR","satuan":"M"},{"kode":"31181701-0007","nama":"RUBBER PACKING 3MM - L : 1MTR","satuan":"M"},{"kode":"31181701-0009","nama":"RUBBER PACKING 5MM - L : 1MTR","satuan":"M"},{"kode":"31181701-0010","nama":"PACKING FIREFLY/TBA 1/2MM","satuan":"SHT"},{"kode":"31181701-0012","nama":"PACKING KLINGRIT WIRE 3MM","satuan":"SHT"},{"kode":"31181701-0014","nama":"PACKING TOMBO 1000 3MM","satuan":"SHT"},{"kode":"31181701-0016","nama":"PACKING TOMBO 1000 5MM","satuan":"SHT"},{"kode":"31181701-0026","nama":"PACKING EY 20 ALKON","satuan":"EA"},{"kode":"31181701-0027","nama":"PACKING SET OVERHAULD FORKLIFT DP 40","satuan":"SET"},{"kode":"31181701-0028","nama":"PACKING SET ZH 115","satuan":"SET"},{"kode":"31181702-0003","nama":"REMES/GLAND PACKING 10MM","satuan":"M"},{"kode":"31181702-0004","nama":"REMES/GLAND PACKING 16MM","satuan":"M"},{"kode":"31181702-0008","nama":"REMES/GLAND PACKING 25MM","satuan":"M"},{"kode":"31181702-0009","nama":"REMES/GLAND PACKING 32MM","satuan":"M"},{"kode":"31181702-0025","nama":"REMIS PACKING 19 MM","satuan":"M"},{"kode":"31181702-0026","nama":"REMIS PACKING 38 MM","satuan":"M"},{"kode":"31191501-0060","nama":"SANDPAPER CC-240","satuan":"EA"},{"kode":"31191501-0061","nama":"SANDPAPER P600","satuan":"EA"},{"kode":"31191505-0001","nama":"ROUND SANDPAPER 25X30MM","satuan":"EA"},{"kode":"31191510-0003","nama":"GRINDING WHEEL 4\"","satuan":"EA"},{"kode":"31201525-0060","nama":"TAPE ISOLATION SCOTCH 23 BLACK","satuan":"ROL"},{"kode":"31201530-0002","nama":"ALUMINIUM ALLOY RIVET 6X22MM","satuan":"EA"},{"kode":"31201533-0001","nama":"AC TAPES ISOLATION","satuan":"EA"},{"kode":"31201607-0002","nama":"PLASTIC STEEL EPOXY","satuan":"EA"},{"kode":"31201610-0030","nama":"GLUE REMA SVS-VULC 5059142 70ML","satuan":"EA"},{"kode":"31201610-0031","nama":"GLUE (FOX) 600GR","satuan":"EA"},{"kode":"31201632-0011","nama":"THREEBOND 1104 ECO (100GR)","satuan":"EA"},{"kode":"31211502-0002","nama":"CAT INTERGARD 263 LIGHT GREY 1PL:20 LTR","satuan":"L"},{"kode":"31211503-0001","nama":"GUARD IM 9029","satuan":"EA"},{"kode":"31211503-0005","nama":"JOTAMASTIC 80 AL BLACK","satuan":"L"},{"kode":"31211503-0007","nama":"SEACONOMY 700 ( RED BROWN )","satuan":"L"},{"kode":"31211503-0010","nama":"HEMPADUR MASTIC WHITE 45881 + CA 95881","satuan":"L"},{"kode":"31211507-0021","nama":"PILOX YELLOW","satuan":"EA"},{"kode":"31211507-0030","nama":"PILOX WHITE","satuan":"EA"},{"kode":"31211508-0070","nama":"PASTE, GASOLINE GAUGING, NET. 2.25 OZ","satuan":"TUB"},{"kode":"31211803-0021","nama":"THINER JOTUN NO 7 1 PAIL = 5 LTR","satuan":"L"},{"kode":"31211904-0020","nama":"FLAT PAINT BRUSH 2\"","satuan":"EA"},{"kode":"31211906-0005","nama":"MINI PAINT ROLLER+HANDLE 100MM","satuan":"EA"},{"kode":"31211906-0010","nama":"MINI PAINT ROLLER REFILL 100MM","satuan":"BOX"},{"kode":"31241601-0001","nama":"PARTICULATE FILTER 7093","satuan":"BOX"},{"kode":"31241607-0007","nama":"ROUND BAR ST41 M/S 1\"X6000MM","satuan":"EA"},{"kode":"31241607-0008","nama":"ROUND BAR ST41 M/S 2-1/2\"X6000MM","satuan":"EA"},{"kode":"31241607-0010","nama":"ROUND BAR ST41 M/S 2\"X6000MM","satuan":"EA"},{"kode":"31241607-0011","nama":"ROUND BAR ST60 M/S 3\"X6000MM","satuan":"EA"},{"kode":"31241607-0012","nama":"ROUND BAR ST70 M/S 4\"X6000MM","satuan":"EA"},{"kode":"31241607-0014","nama":"ROUND BAR ST41 M/S 5/8\"X6000MM","satuan":"EA"},{"kode":"31241607-0015","nama":"ROUND BAR ST41 M/S 7/8\"X6000MM","satuan":"EA"},{"kode":"31241607-0016","nama":"ROUND BAR ST41 M/S 3/4\"X6000MM","satuan":"EA"},{"kode":"31241607-0034","nama":"ROUNBAR (BRONZE) 1-1/2\" X 1MTR","satuan":"EA"},{"kode":"31241607-0035","nama":"ROUNBAR (S/S) 1\" X 2MTR","satuan":"EA"},{"kode":"31241607-0036","nama":"ROUND BAR (BRONZE) DIA 50 X 1000MM","satuan":"EA"},{"kode":"31241608-0001","nama":"SQUARE BAR M/S 22X22X6000MM","satuan":"EA"},{"kode":"31241704-0001","nama":"KACA PUTIH 39,5 CM X 22 CM","satuan":"EA"},{"kode":"31241704-0002","nama":"WINDOW GLASS (KACA BIASA) DIA 364X5MM","satuan":"EA"},{"kode":"31241814-0001","nama":"FILTER SUCTION P/N YL00003141","satuan":"EA"},{"kode":"31311211-0001","nama":"PIPE FUEL ZH 115","satuan":"SET"},{"kode":"31351212-0001","nama":"COPPER TUBE (BRONZE PIPE) 8MM 15/16`","satuan":"ROL"},{"kode":"31401503-0074","nama":"O RING LBQ1210","satuan":"EA"},{"kode":"31401503-0075","nama":"O RING LBQ1410","satuan":"EA"},{"kode":"31411605-0001","nama":"OIL SEAL AXLE STERING","satuan":"EA"},{"kode":"31411605-0002","nama":"OIL SEAL SET","satuan":"EA"},{"kode":"31411702-0005","nama":"MECHANICAL SEAL","satuan":"EA"},{"kode":"31411704-0005","nama":"V RING 1-1/2\"X3/4\"","satuan":"EA"},{"kode":"31411704-0006","nama":"V RING 2X1-1/2\"","satuan":"EA"},{"kode":"31411901-0018","nama":"ORING SMALL","satuan":"EA"},{"kode":"32101517-0001","nama":"COUPLER PH 40 COUPLER PH 40","satuan":"EA"},{"kode":"32101517-0002","nama":"COUPLING (AS SAMPLE) - OLD STOCK","satuan":"EA"},{"kode":"32101632-0002","nama":"TIMER ON DELAY REXL2TNP7","satuan":"EA"},{"kode":"32121501-0023","nama":"CAPACITOR PHILIPS 25 MF / MICRON","satuan":"EA"},{"kode":"32131006-0001","nama":"STOP KONTAK 4 LOBANG OUTBROW ( BROCO )","satuan":"EA"},{"kode":"32131006-0002","nama":"STOP KONTAK ANTENA TV","satuan":"EA"},{"kode":"32141107-0015","nama":"SOCKET WELD M/S 1\"X1\"","satuan":"EA"},{"kode":"32141107-0016","nama":"TEE SOCKET WELD 3/4\"X3000","satuan":"EA"},{"kode":"32A19-00400","nama":"BOLT","satuan":"EA"},{"kode":"32A20-02900","nama":"NUT CRANKSHAFT HYUNDAI","satuan":"EA"},{"kode":"32A46-10010","nama":"CASE ASSY MITSUBISHI","satuan":"EA"},{"kode":"32B01-12100","nama":"GASKET CYL HEAD MITSUBISHI","satuan":"EA"},{"kode":"340-4002_NRR25DB","nama":"EARS PLUG CORDED WITH CASE","satuan":"PAI"},{"kode":"34407-02090","nama":"OIL SEAL BACK MITSUBISHI","satuan":"EA"},{"kode":"34407-11090","nama":"SEAL OIL ASSY MITSUBISHI","satuan":"EA"},{"kode":"37101-33900-71","nama":"UNIVERSAL SPIDER SET","satuan":"EA"},{"kode":"39101601-0061","nama":"NAV LAMP P28S 24V/40W","satuan":"EA"},{"kode":"39101625-0001","nama":"BARGE LAMP/WARNING LIGHT /W BATTERY 6V","satuan":"SET"},{"kode":"39101625-0002","nama":"LAMP GANGWAY -","satuan":"EA"},{"kode":"39101625-0003","nama":"LAMP NAVIGATION TYPE CXH6-21P","satuan":"SET"},{"kode":"39101625-0004","nama":"NAC LAMP/MASTHEAD LIGHT TYPE CXH3-21P","satuan":"EA"},{"kode":"39101625-0005","nama":"ROTARY LAMP 24 VOLT","satuan":"EA"},{"kode":"39101628-0067","nama":"LAMP, TUBE LIGHT, 36W/54 TLD, PHILIPS","satuan":"EA"},{"kode":"39101804-0002","nama":"SI PLUS IGNITOR PHILIPS 250 - 1000 W","satuan":"EA"},{"kode":"39101804-0010","nama":"IGNITOR SI 5I 220VAC/400W PHILIPS","satuan":"EA"},{"kode":"39111608-0002","nama":"LED STREET LIGHT_6500K WHITE_50WATT","satuan":"EA"},{"kode":"39111802-0003","nama":"FLOURESCENT PUNDANT LIGHT 2 X 38W","satuan":"UN"},{"kode":"39111802-0004","nama":"LAMP HOUSING","satuan":"EA"},{"kode":"39111810-0002","nama":"LAMP STARTER S10-P 4-65W","satuan":"EA"},{"kode":"39111817-0001","nama":"MARINE SEARCH LIGHT TG27-B 220V 50/60HZ","satuan":"EA"},{"kode":"39111817-0002","nama":"LAMP TL MARINE 2 X 20 W WT TYPE JCY26-2","satuan":"SET"},{"kode":"39111819-0001","nama":"LAMP FITTING 300/1000WATT","satuan":"EA"},{"kode":"39111819-0002","nama":"LAMP FITTING DOWN LIGHT 4''","satuan":"EA"},{"kode":"39121031-0002","nama":"SAKLAR MARINE SAKLAR TEMPEL","satuan":"SET"},{"kode":"39121031-0004","nama":"SAKLAR EMERGENCY STOP","satuan":"EA"},{"kode":"39121032-0031","nama":"CURRENT TRANSFORMER 100/5A","satuan":"EA"},{"kode":"39121032-0032","nama":"CURRENT TRANSFORMER 800/5A","satuan":"EA"},{"kode":"39121308-0002","nama":"BOSS 12800","satuan":"EA"},{"kode":"39121308-0003","nama":"SOCKET OUTLET 13A","satuan":"EA"},{"kode":"39121308-0005","nama":"SOCKET OUTLET MARINE + PLUG","satuan":"EA"},{"kode":"39121316-0001","nama":"CEILING LIGHT WALL LIGHT AC 60W","satuan":"EA"},{"kode":"39121402-0041","nama":"STEKER 2P 16A","satuan":"EA"},{"kode":"39121405-0061","nama":"CABLE LUG/SKUN ALU 120MM","satuan":"EA"},{"kode":"39121405-0063","nama":"CABLE LUG/SKUN ALU 70MM","satuan":"EA"},{"kode":"39121405-0077","nama":"CABLE LUG / SKUN COPPER SC 95-12","satuan":"EA"},{"kode":"39121405-0084","nama":"CABLE LUG 16MM X HOLE 6","satuan":"EA"},{"kode":"39121405-0087","nama":"CONNECTOR / SKUN SHOCK 70 MM","satuan":"EA"},{"kode":"39121405-0088","nama":"CONNECTOR / SKUN SHOCK 95 MM","satuan":"EA"},{"kode":"39121406-0027","nama":"ELECTRICAL SOCKET_2 OUTBOW_IP55","satuan":"EA"},{"kode":"39121410-0023","nama":"SEPARATOR TRA 2","satuan":"EA"},{"kode":"39121410-0024","nama":"SEPARATOR TRA 3","satuan":"EA"},{"kode":"39121410-0025","nama":"TERMINAL BLOCK TB1512 15A 600V","satuan":"EA"},{"kode":"39121410-0026","nama":"TERMINAL BLOCK BLACK","satuan":"EA"},{"kode":"39121432-0016","nama":"THERMAL BUBBLE ROLL 4X1.2MMX25MTR","satuan":"ROL"},{"kode":"39121432-0017","nama":"TERMINAL PVC WHITE 60A (25MM) 400V","satuan":"EA"},{"kode":"39121460-0001","nama":"HBAD 6754-71-7200","satuan":"EA"},{"kode":"39121611-0005","nama":"CERAMIC FUSE_10 X 38MM_gG TYPE_500V_10A","satuan":"EA"},{"kode":"39121702-0007","nama":"FITTING, HOLDER LAMP, PANASONIC NLP52201","satuan":"EA"},{"kode":"39121703-0040","nama":"CABLE TIES 100X3,0","satuan":"PAC"},{"kode":"39121703-0041","nama":"CABLE TIES 150X3,6","satuan":"PAC"},{"kode":"39121703-0042","nama":"CABLE TIES 250X3,6","satuan":"PAC"},{"kode":"39121703-0043","nama":"CABLE TIES 300X4,8","satuan":"PAC"},{"kode":"39121705-0018","nama":"CLAMP, DOUBLE BOLT, CLAW MINSUP, 3/4\"","satuan":"EA"},{"kode":"39121710-0001","nama":"RECEPTACLE NWT 16A FLUSH TYPE","satuan":"EA"},{"kode":"39121723-0040","nama":"HEAT SHRINKABLE TUBE_20-84MM INNER DIA","satuan":"EA"},{"kode":"39122204-0002","nama":"TUMBLER,TAKE UP 9024878","satuan":"EA"},{"kode":"39122211-0001","nama":"SAKLAR TYPE DOUBLE","satuan":"EA"},{"kode":"39122224-0001","nama":"WHT 20 / SWITCH WITH 20 A 440 B 3 PHASE","satuan":"EA"},{"kode":"39122307-0008","nama":"AUXILURY RELAY 220V/50HZ","satuan":"EA"},{"kode":"39131604-0007","nama":"SPIRAL HOSE PROTECTOR_1/2INCH_50M_RUBBER","satuan":"ROL"},{"kode":"39131604-0008","nama":"SPIRAL HOSE PROTECTOR_1INCH_50M_RUBBER","satuan":"ROL"},{"kode":"39131704-0004","nama":"CABLE TRAY 20MM X 10 X 240","satuan":"EA"},{"kode":"40101720-0001","nama":"FUEL COOLER 206-03-71161","satuan":"EA"},{"kode":"40141604-0004","nama":"SAFETY V/V MFW.A 1/2\" 12MM SET.P 10KG/CM","satuan":"EA"},{"kode":"40141607-0020","nama":"VALVE BALL 2 INCH","satuan":"EA"},{"kode":"40141607-0037","nama":"BALL VALVE BSP FEMALE BRNZ 2-1/2\"","satuan":"EA"},{"kode":"40141607-0040","nama":"BALL VALVE BSP FEMALE S/S 1\"","satuan":"EA"},{"kode":"40141607-0041","nama":"BALL VALVE BSP FEMALE S/S 1-1/4\"","satuan":"EA"},{"kode":"40141607-0042","nama":"BALL VALVE BSP FEMALE S/S 3/4\"","satuan":"EA"},{"kode":"40141607-0043","nama":"BALL VALVE HYDRAULIC NPT C/S PN500 1/2\"","satuan":"EA"},{"kode":"40141607-0120","nama":"BALL VALVE PVC 2-1/2\"","satuan":"EA"},{"kode":"40141607-0121","nama":"BALL VALVES S/S 1-1/2''","satuan":"EA"},{"kode":"40141607-0123","nama":"BALL VALVE 3/4\" X 5K ( BRONZE )","satuan":"EA"},{"kode":"40141610-0005","nama":"FLOATING VALVE BRASS 3/4\"","satuan":"EA"},{"kode":"40141611-0020","nama":"GLOBE VALVE C/I PN16 DN100","satuan":"EA"},{"kode":"40141611-0027","nama":"QUICK CLOSING GLOBE V/V C/S JIS 10K 50","satuan":"EA"},{"kode":"40141611-0032","nama":"SWING CHECK VALVE F7373 C/I JIS 10K 65","satuan":"EA"},{"kode":"40141611-0035","nama":"GLOBE VALVE 5K 65 (NON RETURN VALVE)","satuan":"EA"},{"kode":"40141611-0039","nama":"GLOBE VALVE SDNR KUNINGAN 1\" 16K","satuan":"EA"},{"kode":"40141611-0043","nama":"ANGLE GLOBE VALVE_DN32_C/I_PN16_SDNR","satuan":"EA"},{"kode":"40141613-0010","nama":"GATE VALVE F7364 C/I JIS 10K 80","satuan":"EA"},{"kode":"40141613-0012","nama":"GATE VALVE F7364 C/I JIS 10K 100","satuan":"EA"},{"kode":"40141613-0014","nama":"GATE VALVE F7364 C/I JIS 10K 50","satuan":"EA"},{"kode":"40141613-0018","nama":"GATE VALVE F7363 C/I JIS 5K 65","satuan":"EA"},{"kode":"40141613-0028","nama":"GATE VALVE F7366 C/S JIS 10K 100","satuan":"EA"},{"kode":"40141613-0030","nama":"GATE VALVE F7363 C/I JIS 5K 25","satuan":"EA"},{"kode":"40141613-0034","nama":"GATE VALVE BRNZ JIS 5K 20","satuan":"EA"},{"kode":"40141613-0035","nama":"GATE VALVE F7364 C/I JIS 10K 40","satuan":"EA"},{"kode":"40141613-0037","nama":"GATE VALVE BRNZ JIS 5K 40","satuan":"EA"},{"kode":"40141613-0038","nama":"GATE VALVE BRNZ JIS 5K 50","satuan":"EA"},{"kode":"40141613-0042","nama":"GATE VALVE C/I 2 1/2\" X JIS 10K","satuan":"EA"},{"kode":"40141613-0056","nama":"GATE VALVE_DN40_100MM_JIS 10K_B2026","satuan":"EA"},{"kode":"40141615-0001","nama":"SELF CLOSE DRAIN V/V F7398 BRNZ U A15 5K","satuan":"EA"},{"kode":"40141615-0002","nama":"SELF CLOSING U DRAIN BRONZE 5K X 3/4\"","satuan":"EA"},{"kode":"40141617-0011","nama":"ANGLE VALVE HYDRNT BRNZ JIS 10K 40","satuan":"EA"},{"kode":"40141636-0001","nama":"SPRING CHECK VALVE 2 1/2\"","satuan":"EA"},{"kode":"40141638-0001","nama":"EMRGNCY SHUTOFF F7399 C/S BKI JIS A15 5K","satuan":"EA"},{"kode":"40141638-0002","nama":"EMRGNCY SHUTOFF F7399 C/S BKI JIS A25 5K","satuan":"EA"},{"kode":"40141651-0005","nama":"AIR VENT HEAD C/I JIS 10K 65","satuan":"EA"},{"kode":"40141651-0006","nama":"AIR VENT HEAD C/I JIS 10K 80","satuan":"EA"},{"kode":"40141651-0009","nama":"AIR VENT HEAD C/I JIS 5K 65","satuan":"EA"},{"kode":"40141656-0013","nama":"BUTTERFLY VALVE C/I JIS 10K 150","satuan":"EA"},{"kode":"40141719-0004","nama":"CAMLOCK COUPLING_SIZE 2IN_TYPE C FEMALE","satuan":"EA"},{"kode":"40141719-0005","nama":"CAMLOCK COUPLING_SIZE 2IN_TYPE E FEMALE","satuan":"EA"},{"kode":"40141734-0025","nama":"CAMLOCK COUPLING_SIZE 2IN_TYPE D FEMALE","satuan":"EA"},{"kode":"40141743-0002","nama":"NOZZLE HOLDER  1\"","satuan":"EA"},{"kode":"40142002-0027","nama":"RUBBER AIR HOSE_3/4IN X 50M_2 THREAD","satuan":"EA"},{"kode":"40142003-0002","nama":"HOSE MINDER 3/4\"","satuan":"EA"},{"kode":"40142003-0003","nama":"HOSE RADIATOR BELLOW FORKLIFT S6S","satuan":"EA"},{"kode":"40142003-0005","nama":"HOSE TRANSMISSION 1/2\"","satuan":"M"},{"kode":"40142008-0048","nama":"HOSE \"OEM\" 02760-00209","satuan":"EA"},{"kode":"40142018-0001","nama":"RUBBER HOSE FOR BLASTING 2-1/2\"","satuan":"M"},{"kode":"40142018-0002","nama":"RUBBER HOSE FOR BLASTING 4\"","satuan":"M"},{"kode":"40142201-0010","nama":"REGULATOR LPG/ACETYLENE YR-76","satuan":"EA"},{"kode":"40142204-0010","nama":"REGULATOR OXYGEN YR-76","satuan":"EA"},{"kode":"40142204-0011","nama":"REGULATOR LPG 12KG","satuan":"EA"},{"kode":"40142503-0001","nama":"STEAM TRAP","satuan":"EA"},{"kode":"40151506-0007","nama":"SEMI ROTARY HAND PUMP 1/2\"","satuan":"EA"},{"kode":"40151506-0008","nama":"HALF TWIST - ACTION HAND PUMP 1`","satuan":"EA"},{"kode":"40161502-0012","nama":"CARTRIDGE, SEDIMEN FILTER 1 MICRON - 10\"","satuan":"EA"},{"kode":"40161502-0055","nama":"WATER PHASS 24\"","satuan":"EA"},{"kode":"40161505-0015","nama":"ACT 140-T S/N 19TR02974","satuan":"UN"},{"kode":"40161513-0016","nama":"FUEL FILTER 1302D488","satuan":"EA"},{"kode":"40161513-0017","nama":"FUEL FILTER COMPRESSOR PDS 365","satuan":"EA"},{"kode":"40161806-0001","nama":"FILTER NET 1X3FEET","satuan":"EA"},{"kode":"40171602-0008","nama":"PIPE SML C/S SCH40 - 1-1/2\" X 6MTR","satuan":"EA"},{"kode":"40171602-0014","nama":"PIPE SML C/S SCH40 - 2-1/2\" X 6MTR","satuan":"EA"},{"kode":"40171602-0020","nama":"PIPE SML C/S SCH40 - 8\" X 6MTR","satuan":"EA"},{"kode":"40171602-0021","nama":"PIPE SML C/S SCH80 - 1-1/2\" X 6MTR","satuan":"EA"},{"kode":"40171602-0022","nama":"PIPE SML C/S SCH80 - 1-1/4\" X 6MTR","satuan":"EA"},{"kode":"40171602-0023","nama":"PIPE SML C/S SCH80 - 1/2\" X 6MTR","satuan":"EA"},{"kode":"40171602-0024","nama":"PIPE SML C/S SCH80 - 10\" X 6MTR","satuan":"EA"},{"kode":"40171602-0025","nama":"PIPE SML C/S SCH80 - 12\" X 6MTR","satuan":"EA"},{"kode":"40171602-0026","nama":"PIPE SML C/S SCH80 - 14\" X 6MTR","satuan":"EA"},{"kode":"40171602-0027","nama":"PIPE SML C/S SCH80 - 1\" X 6MTR","satuan":"EA"},{"kode":"40171602-0028","nama":"PIPE SML C/S SCH80 - 2-1/2\" X 6MTR","satuan":"EA"},{"kode":"40171602-0029","nama":"PIPE SML C/S SCH80 - 2\" X 6MTR","satuan":"EA"},{"kode":"40171602-0030","nama":"PIPE SML C/S SCH80 - 3/4\" X 6MTR","satuan":"EA"},{"kode":"40171602-0031","nama":"PIPE SML C/S SCH80 - 3\" X 6MTR","satuan":"EA"},{"kode":"40171602-0032","nama":"PIPE SML C/S SCH80 - 4\" X 6MTR","satuan":"EA"},{"kode":"40171602-0033","nama":"PIPE SML C/S SCH80 - 5\" X 6MTR","satuan":"EA"},{"kode":"40171602-0034","nama":"PIPE SML C/S SCH80 - 6\" X 6MTR","satuan":"EA"},{"kode":"40171602-0035","nama":"PIPE SML C/S SCH80 - 8\" X 6MTR","satuan":"EA"},{"kode":"40171602-0038","nama":"SEAMLESS  PIPE C/S SCH80 SIZE 16\" X 6MTR","satuan":"EA"},{"kode":"40171602-0039","nama":"SEAMLESS  PIPE C/S SCH80 SIZE 24\" X 6MTR","satuan":"EA"},{"kode":"40171612-0028","nama":"PIPE GALV SCH40 - 1-1/4\" X 6MTR","satuan":"EA"},{"kode":"40171612-0029","nama":"PIPE GALV SCH80 - 1-1/2\" X 6MTR","satuan":"EA"},{"kode":"40171612-0030","nama":"PIPE GALV SCH80 - 1-1/4\" X 6MTR","satuan":"EA"},{"kode":"40171612-0031","nama":"PIPE GALV SCH80 - 1\" X 6MTR","satuan":"EA"},{"kode":"40171612-0032","nama":"PIPE GALV SCH80 - 2-1/2\" X 6MTR","satuan":"EA"},{"kode":"40171612-0033","nama":"PIPE GALV SCH80 - 2\" X 6MTR","satuan":"EA"},{"kode":"40171612-0034","nama":"PIPE GALV SCH80 - 3/4\" X 6MTR","satuan":"EA"},{"kode":"40171612-0035","nama":"PIPE GALV SCH80 - 3\" X 6MTR","satuan":"EA"},{"kode":"40171612-0036","nama":"PIPE GALV SCH80 - 5\" X 6MTR","satuan":"EA"},{"kode":"40171612-0037","nama":"PIPE GALV SCH80 - 8\" X 6MTR","satuan":"EA"},{"kode":"40171612-0047","nama":"PIPE GALV SCH80 - 4\" X 6MTR","satuan":"EA"},{"kode":"40171612-0050","nama":"PIPE GALV SCH80 - 6IN X 6MTR","satuan":"EA"},{"kode":"40172201-0010","nama":"FLANGE SORF ANSI150 - 6\"","satuan":"EA"},{"kode":"40172201-0012","nama":"PIPE FLANGE_1-1/2IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0014","nama":"PIPE FLANGE_1/2IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0015","nama":"PIPE FLANGE_1IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0016","nama":"PIPE FLANGE_2-1/2IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0017","nama":"PIPE FLANGE_2IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0018","nama":"PIPE FLANGE_3/4IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0020","nama":"PIPE FLANGE_4IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0021","nama":"PIPE FLANGE_6IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0022","nama":"PIPE FLANGE_8IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0023","nama":"PIPE FLANGE_1-1/2IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0025","nama":"PIPE FLANGE_1IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0026","nama":"PIPE FLANGE_2-1/2IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0027","nama":"PIPE FLANGE_2IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0028","nama":"PIPE FLANGE_3/4IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0031","nama":"PIPE FLANGE_8IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0037","nama":"FLANGE SOFF JIS 10K - 5\"","satuan":"EA"},{"kode":"40172201-0038","nama":"FLANGE GALV - 1/2\"","satuan":"EA"},{"kode":"40172201-0039","nama":"FLANGE GALV JIS 10K - 1-1/4\"","satuan":"EA"},{"kode":"40172201-0040","nama":"FLANGE GALV JIS 10K - 2 1/2\"","satuan":"EA"},{"kode":"40172201-0042","nama":"FLANGE GALV PN16 - 3\"","satuan":"EA"},{"kode":"40172201-0043","nama":"FLANGE HYD SQUARE 3/4\"X210K","satuan":"EA"},{"kode":"40172201-0044","nama":"FLANGE HYD SQUARE JIS 10K - 1''","satuan":"EA"},{"kode":"40172201-0045","nama":"PIPE FLANGE_10IN_SOFF JIS 10K","satuan":"EA"},{"kode":"40172201-0046","nama":"PIPE FLANGE_1-1/2IN_SOFF JIS 20K","satuan":"EA"},{"kode":"40172201-0047","nama":"PIPE FLANGE_1/2IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0050","nama":"PIPE FLANGE_5IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0051","nama":"PIPE FLANGE_6IN_SOFF JIS 5K","satuan":"EA"},{"kode":"40172201-0052","nama":"FLANGE SORF ANSI 10''","satuan":"EA"},{"kode":"40172201-0053","nama":"FLANGE B2220 M/S SS 400 JIS F.F A75 10K","satuan":"EA"},{"kode":"40172201-0056","nama":"FLANGE GALV 3\" 5K","satuan":"EA"},{"kode":"40172201-0058","nama":"FLANGE B2220 M/S SS 400 F.F JIS A32 5K","satuan":"EA"},{"kode":"40172201-0062","nama":"FLANGE MS 1 1/4\" 5K","satuan":"EA"},{"kode":"40172201-0063","nama":"FLANGE MS 3\" 5K","satuan":"EA"},{"kode":"40172201-0064","nama":"FLANGE MS 4\" 5K","satuan":"EA"},{"kode":"40172414-0001","nama":"DOP SGP GALV 2 1/2\"","satuan":"EA"},{"kode":"40172414-0002","nama":"DOP SGP GALV 4\"","satuan":"EA"},{"kode":"40172414-0003","nama":"DOP SGP GALV 2\" NPT (IN THREAD)","satuan":"EA"},{"kode":"40172414-0004","nama":"DOP SGP GALV 2\" NPT (OUT THREAD)","satuan":"EA"},{"kode":"40172414-0005","nama":"DOP SGP GALV 1-1/2\"","satuan":"EA"},{"kode":"40172414-0006","nama":"DOP SGP GALV 3\"","satuan":"EA"},{"kode":"40172611-0010","nama":"HDPE STRAIGHT PIPE COUPLING_25MM","satuan":"EA"},{"kode":"40172611-0011","nama":"HDPE STRAIGHT PIPE COUPLING_32MM","satuan":"EA"},{"kode":"40172611-0012","nama":"HDPE STRAIGHT PIPE COUPLING_50MM","satuan":"EA"},{"kode":"40172611-0013","nama":"HDPE STRAIGHT PIPE COUPLING_63MM","satuan":"EA"},{"kode":"40172802-0134","nama":"ELBOW BW LR 90 C/S SCH40 - 1/2\"","satuan":"EA"},{"kode":"40172802-0150","nama":"ELBOW BW LR 90 C/S SCH40 - 4\"","satuan":"EA"},{"kode":"40172802-0151","nama":"ELBOW BW LR 90 C/S SCH80 - 1-1/2\"","satuan":"EA"},{"kode":"40172802-0152","nama":"ELBOW BW LR 90 C/S SCH80 - 1-1/4\"","satuan":"EA"},{"kode":"40172802-0153","nama":"ELBOW BW LR 90 C/S SCH80 - 1/2\"","satuan":"EA"},{"kode":"40172802-0154","nama":"ELBOW BW LR 90 C/S SCH80 - 10\"","satuan":"EA"},{"kode":"40172802-0155","nama":"ELBOW BW LR 90 C/S SCH80 - 1\"","satuan":"EA"},{"kode":"40172802-0156","nama":"PIPE ELBOW_2.5IN_BW_SCH80_C/S_LR 90","satuan":"EA"},{"kode":"40172802-0157","nama":"PIPE ELBOW_2IN_BW_SCH80_C/S_LR 90","satuan":"EA"},{"kode":"40172802-0158","nama":"ELBOW BW LR 90 C/S SCH80 - 3/4\"","satuan":"EA"},{"kode":"40172802-0159","nama":"PIPE ELBOW_3IN_BW_SCH80_C/S_LR 90","satuan":"EA"},{"kode":"40172802-0160","nama":"ELBOW BW LR 90 C/S SCH80 - 4\"","satuan":"EA"},{"kode":"40172802-0161","nama":"ELBOW BW LR 90 C/S SCH80 - 5\"","satuan":"EA"},{"kode":"40172802-0162","nama":"ELBOW BW LR 90 C/S SCH80 - 6\"","satuan":"EA"},{"kode":"40172802-0163","nama":"ELBOW BW LR 90 C/S SCH80 - 8\"","satuan":"EA"},{"kode":"40172802-0170","nama":"ELBOW BW LR 90 GALV SCH40 - 1/2\"","satuan":"EA"},{"kode":"40172802-0172","nama":"ELBOW BW SR 45 C/S SCH40 - 5\"","satuan":"EA"},{"kode":"40172802-0173","nama":"ELBOW BW SR 45 C/S SCH40 - 6\"","satuan":"EA"},{"kode":"40172802-0174","nama":"ELBOW BW SR 45 C/S SCH40 - 8\"","satuan":"EA"},{"kode":"40172802-0175","nama":"ELBOW GALV 1-1/2 SCH 40","satuan":"EA"},{"kode":"40172802-0176","nama":"ELBOW S/S 304 90 DEGREES 1\"","satuan":"EA"},{"kode":"40172802-0177","nama":"ELBOW SGP ( UNGALVANIZED ) Ø 2 1/2` SCH","satuan":"EA"},{"kode":"40172802-0180","nama":"ELBOW MS 6\" SCH 40","satuan":"EA"},{"kode":"40172815-0012","nama":"ELBOW BW LR 90 GALV SCH80 - 4\"","satuan":"EA"},{"kode":"40172815-0026","nama":"ELBOW BW LR 90 GALV SCH80 - 1-1/2\"","satuan":"EA"},{"kode":"40172815-0028","nama":"ELBOW BW LR 90 GALV SCH80 - 2-1/2\"","satuan":"EA"},{"kode":"40172815-0029","nama":"ELBOW BW LR 90 GALV SCH80 - 2\"","satuan":"EA"},{"kode":"40172815-0031","nama":"ELBOW BW LR 90 GALV SCH80 - 5\"","satuan":"EA"},{"kode":"40173408-0001","nama":"PVC PLASTIC PIPE PLATE FLANGE_2IN_4 HOLE","satuan":"EA"},{"kode":"40173502-0002","nama":"PLUG M/S 1\"","satuan":"EA"},{"kode":"40174602-0062","nama":"TEE, GALVD, FEMALE THREADED, SIZE: 1/2\"","satuan":"EA"},{"kode":"40183102-0005","nama":"TEE SGP BW GALV SCH80 - 4\"","satuan":"EA"},{"kode":"40183102-0007","nama":"TEE SGP BW C/S SCH80 - 1\"","satuan":"EA"},{"kode":"40183102-0013","nama":"TEE SGP BW C/S SCH40 - 1/2\"","satuan":"EA"},{"kode":"40183102-0014","nama":"TEE SGP BW C/S SCH80 - 1/2\"","satuan":"EA"},{"kode":"40183102-0015","nama":"TEE SGP BW C/S SCH80 - 6\"","satuan":"EA"},{"kode":"40183102-0016","nama":"TEE SGP BW GALV SCH40 - 2-1/2''","satuan":"EA"},{"kode":"40183102-0018","nama":"T - WB 1 1/2\" GALVANIS","satuan":"EA"},{"kode":"40183102-0020","nama":"T - WB 1\" GALVANIS T - WB 1\" GALVANIS","satuan":"EA"},{"kode":"40183102-0022","nama":"T - WB 1/2\" GALVANIS","satuan":"EA"},{"kode":"40183102-0025","nama":"T - WB 2.5\" GALVANIS","satuan":"EA"},{"kode":"40183102-0026","nama":"T - WB 3\" SCH 40","satuan":"EA"},{"kode":"40183102-0027","nama":"TEE 2 1/2\" SCH 80","satuan":"EA"},{"kode":"40183105-0001","nama":"NEPPLE 3/4\"","satuan":"EA"},{"kode":"40183105-0002","nama":"NEPPLE GREASE M10X1.5","satuan":"EA"},{"kode":"40183105-0003","nama":"NEPPLE COUPLING S/S 1/2\"","satuan":"EA"},{"kode":"40183105-0005","nama":"NEPPLE GREASE STRAIGHT 5/8\"","satuan":"EA"},{"kode":"40183105-0006","nama":"BLASTING HOSE CLAW COUPLING FML 1-1/4\"","satuan":"EA"},{"kode":"40183105-0007","nama":"M.S SOCKET 1/2\"","satuan":"EA"},{"kode":"40183105-0008","nama":"M.S SOCKET 3/4\"","satuan":"EA"},{"kode":"40183105-0009","nama":"Y NEPPLE BRASS 1-1/4''","satuan":"EA"},{"kode":"40183105-0011","nama":"NEPPLE 1/2\"","satuan":"EA"},{"kode":"40183107-0001","nama":"CLAW COUPLING GALV FEMALE 3/4\"","satuan":"EA"},{"kode":"40183112-0009","nama":"REDUCER M/S SCH80 - 2X4\"","satuan":"EA"},{"kode":"40183112-0010","nama":"REDUCER M/S SCH80 - 3X2\"","satuan":"EA"},{"kode":"40183112-0011","nama":"REDUCER M/S SCH80 - 4X3\"","satuan":"EA"},{"kode":"40183112-0012","nama":"REDUCER M/S SCH80 - 4X6\"","satuan":"EA"},{"kode":"40183112-0013","nama":"REDUCER M/S SCH80 - 5X3\"","satuan":"EA"},{"kode":"40183112-0014","nama":"REDUCER M/S SCH80 - 6X3\"","satuan":"EA"},{"kode":"40183112-0044","nama":"REDUCER 3/4 X 2-1/2 SGP","satuan":"EA"},{"kode":"40183112-0045","nama":"REDUCER ANSI B16.9 GALV CON 32X25A SCH40","satuan":"EA"},{"kode":"40183112-0046","nama":"REDUCER CPL SOCK BW+NPT 3000 A105 BW 1\"","satuan":"EA"},{"kode":"40183112-0047","nama":"REDUCER CPL SOCK BW+NPT BW 1\"X1/2\" NPT30","satuan":"EA"},{"kode":"40183112-0048","nama":"REDUCER GALV SCH40 - 1\"X2-1/2\"","satuan":"EA"},{"kode":"40183112-0050","nama":"REDUCER SGP 5X4","satuan":"EA"},{"kode":"40183112-0051","nama":"CON REDUCER M/S 2\" X 1\" SCH80","satuan":"EA"},{"kode":"40183112-0056","nama":"REDUCER MS SCH 80 2 1/2\" X 1 1/2\"","satuan":"EA"},{"kode":"40183112-0057","nama":"REDUCING BUSH ( GALV`D ) 2` X 1 1/2`","satuan":"EA"},{"kode":"40183112-0058","nama":"REDUCER M/S SCH 80 2-1/2X1-1/2IN","satuan":"EA"},{"kode":"4024299","nama":"RELAY BATTERY 24V HITACHI","satuan":"EA"},{"kode":"4027429","nama":"O RING HITACHI","satuan":"EA"},{"kode":"4037462","nama":"SEAL OIL HITACHI","satuan":"EA"},{"kode":"4052860","nama":"OIL SEAL HITACHI","satuan":"EA"},{"kode":"4058965","nama":"COOLANT FILTER CUMMINS","satuan":"EA"},{"kode":"4059482","nama":"SEAL GROUP HITACHI","satuan":"EA"},{"kode":"4062811","nama":"O RING HITACHI","satuan":"EA"},{"kode":"4062814","nama":"O RING HITACHI","satuan":"EA"},{"kode":"4062823","nama":"RING SEAL HITACHI","satuan":"EA"},{"kode":"4062824","nama":"RING SEAL HITACHI","satuan":"EA"},{"kode":"4106879","nama":"RING WEAR HITACHI","satuan":"EA"},{"kode":"41103313-0001","nama":"RUDDER INDICATOR ING","satuan":"SET"},{"kode":"41104213-0005","nama":"WATER DISTILLED/DEMINERALIZED WATER","satuan":"L"},{"kode":"41104818-0001","nama":"RUBBER HATCH PACKING RECTANGULAR 50X30MM","satuan":"M"},{"kode":"41111802-0008","nama":"MEGA CHECK CLEANER BLUE","satuan":"EA"},{"kode":"41111802-0009","nama":"MEGA CHECK DEVELOPER","satuan":"EA"},{"kode":"41111917-0005","nama":"MULTI TESTER SANWA MODEL : XY360TRF","satuan":"EA"},{"kode":"4112336","nama":"PACKING O RING HITACHI","satuan":"EA"},{"kode":"421-06-23330","nama":"LIGHTBULB 70W 24V","satuan":"EA"},{"kode":"42221617-0001","nama":"ELEMEN PEMANAS KEPALA AIR BAG -","satuan":"EA"},{"kode":"42262105-0001","nama":"CHOCKFAST ORANGE PR 610 TCF","satuan":"EA"},{"kode":"42272007-0001","nama":"TUBE BENDER 3 IN 1","satuan":"EA"},{"kode":"43221703-0011","nama":"ANTENNA CABLE TV RG. 6 - 75 OHM","satuan":"M"},{"kode":"4336570","nama":"LAMP;HEAD","satuan":"EA"},{"kode":"4353560","nama":"STRAINER","satuan":"EA"},{"kode":"4436537","nama":"SENSOR","satuan":"EA"},{"kode":"45751-12340","nama":"PAINT HEMPADUR MULTI STRENGTH GREY","satuan":"L"},{"kode":"45751-50630","nama":"PAINT HEMPADUR MULTI STRENGTH RED","satuan":"L"},{"kode":"45881-11480","nama":"PAINT HEMPADUR DARK GREY","satuan":"L"},{"kode":"45881-19990","nama":"PAINT HEMPADUR MASTIC BLACK","satuan":"L"},{"kode":"45881-40640","nama":"PAINT HEMPADUR MASTIC GREEN","satuan":"L"},{"kode":"45881-50630","nama":"PAINT HEMPADUR MASTIC RED","satuan":"L"},{"kode":"45889+95881","nama":"PAINT HEMPADUR MASTIC BLACK /W CURING AG","satuan":"L"},{"kode":"4612331","nama":"V-BELT","satuan":"EA"},{"kode":"46171501-0020","nama":"WIRE, WHITE ( KAWAT PUTIH ) 2MM","satuan":"ROL"},{"kode":"46171501-0039","nama":"PADLOCK 60MM","satuan":"EA"},{"kode":"46181504-0030","nama":"COTTON HAND GLOVES","satuan":"PAI"},{"kode":"46181504-0031","nama":"HAND GLOVES COMBINATION GS-1913","satuan":"PAI"},{"kode":"46181536-0001","nama":"RUBBER GLOVES","satuan":"PAI"},{"kode":"46181604-0050","nama":"RUBBER BOOTS SIZE 40 RED AP BOOTS","satuan":"PAI"},{"kode":"46181604-0051","nama":"RUBBER BOOTS SIZE 42 RED AP BOOTS","satuan":"PAI"},{"kode":"46181706-0005","nama":"BLASTING HELMET FIBRE /W BLASTING JACKET","satuan":"SET"},{"kode":"46181707-0001","nama":"GLASS FOR WELDING BLACK","satuan":"EA"},{"kode":"46181707-0002","nama":"GLASS FOR WELDING CLEAR","satuan":"EA"},{"kode":"46181802-0017","nama":"SAFETY GLASSES GREY 599","satuan":"EA"},{"kode":"46181902-0010","nama":"EAR MUFFS 39106","satuan":"EA"},{"kode":"46191604-0010","nama":"FIRE BLANKET HT800 1MMX1X50M","satuan":"EA"},{"kode":"46191611-0010","nama":"FIRE HOSE BOX CAPACITY 20MTR","satuan":"EA"},{"kode":"47131604-0007","nama":"NYLON BROOM","satuan":"EA"},{"kode":"47131612-0001","nama":"WATERTIGHT RUBBER DOOR PACKING 30X20MM","satuan":"M"},{"kode":"47131612-0003","nama":"WATERTIGHT RUBBER DOOR PACKING 40X20MM","satuan":"M"},{"kode":"47131825-0020","nama":"CONTACT CLEANER 360ML","satuan":"EA"},{"kode":"47131909-0001","nama":"OIL ABSORBENT PAD","satuan":"EA"},{"kode":"4810230","nama":"O RING HITACHI","satuan":"EA"},{"kode":"49183-25150","nama":"PAINT HEMPADUR TIE COAT KHAKIBROWN","satuan":"L"},{"kode":"4M-9334","nama":"AIR FILTER CAT","satuan":"EA"},{"kode":"4V310-10","nama":"PNEUMATIC SELENOID VALVE AIRTAC","satuan":"EA"},{"kode":"500-FG","nama":"FUEL FILTER RACOR","satuan":"EA"},{"kode":"51106","nama":"THRUST BALL BEARING SINGLE SKF","satuan":"EA"},{"kode":"51206","nama":"THRUST BALL BEARING SINGLE SKF","satuan":"EA"},{"kode":"51570-19000","nama":"PAINT HEMPELS SILVIUM ALUMINIUM","satuan":"L"},{"kode":"52140-10000","nama":"PAINT HEMPALIN WHITE","satuan":"L"},{"kode":"52140-11480","nama":"PAINT HEMPALIN GREY","satuan":"L"},{"kode":"52140-20300","nama":"PAINT HEMPALIN YELLOW","satuan":"L"},{"kode":"52140-40640","nama":"PAINT HEMPALIN GREEN","satuan":"L"},{"kode":"52140-42170","nama":"HEMPALIN ENAMEL, GREEN YELLOW PAINT","satuan":"L"},{"kode":"52140-60050","nama":"PAINT HEMPALIN BROWN","satuan":"L"},{"kode":"539511","nama":"WEBSLING 5T X 6M 150MM FLAT","satuan":"EA"},{"kode":"55210-10000","nama":"PAINT HEMPATHANE TOP COAT WHITE","satuan":"L"},{"kode":"55210-19990","nama":"PAINT HEMPATHANE TOP COAT BLACK","satuan":"L"},{"kode":"55210-20300","nama":"PAINT HEMPATHANE TOP COAT YELLOW","satuan":"L"},{"kode":"55210-30700","nama":"PAINT HEMPATHANE TOP COAT BLUE","satuan":"L"},{"kode":"55210-30840","nama":"PAINT HEMPATHANE TOP COAT BLUE","satuan":"L"},{"kode":"55210-40640","nama":"PAINT HEMPATHANE TOP COAT GREEN","satuan":"L"},{"kode":"55210-42170","nama":"HEMPATHANE TOPCOAT, GREEN YELLOW PAINT","satuan":"L"},{"kode":"55210-50800","nama":"PAINT HEMPATHANE TOP COAT RED","satuan":"L"},{"kode":"5L-8855","nama":"3.14MM THICK METAL SEAL RING","satuan":"EA"},{"kode":"5M-2997","nama":"83.31MM OUTER DIAMETER FAN DRIVE SEAL","satuan":"EA"},{"kode":"5P-1262","nama":"CM-HOSE STK","satuan":"EA"},{"kode":"600-185-4110","nama":"AIR CLEANER","satuan":"EA"},{"kode":"600-311-3640","nama":"BOWL","satuan":"EA"},{"kode":"600-311-3722","nama":"FUEL SENSOR","satuan":"EA"},{"kode":"600-319-3610","nama":"FUEL FILTER","satuan":"EA"},{"kode":"600-319-3750","nama":"FUEL FILTER","satuan":"EA"},{"kode":"600-625-7620","nama":"FAN ASSEMBLY, CENTRIFUGAL","satuan":"EA"},{"kode":"600-815-8941","nama":"SWITCH","satuan":"EA"},{"kode":"600-861-3420","nama":"ALTERNATOR 35 A","satuan":"EA"},{"kode":"600-863-4210","nama":"STARTING MOTOR","satuan":"EA"},{"kode":"600-863-511","nama":"STARTING MOTOR DENSO","satuan":"EA"},{"kode":"60131405-0010","nama":"DRUMS EX / USED","satuan":"EA"},{"kode":"612600081335","nama":"FUEL FILTER WEICHAI","satuan":"EA"},{"kode":"6203-2Z","nama":"BEARING SKF","satuan":"EA"},{"kode":"6210-11-5232","nama":"CLAMP","satuan":"EA"},{"kode":"6210-2Z/C3","nama":"BEARING","satuan":"EA"},{"kode":"6213","nama":"BEARING SKF","satuan":"EA"},{"kode":"63/22","nama":"BEARING SKF","satuan":"EA"},{"kode":"6650120","nama":"RACE","satuan":"EA"},{"kode":"6667352","nama":"ELEMENT, INGERSOLL RAND  P/N. 6667352","satuan":"EA"},{"kode":"6678233","nama":"ENGINE OIL FILTER","satuan":"EA"},{"kode":"6692337","nama":"HYDRAULIC OIL FILTER CARTRIDGE","satuan":"EA"},{"kode":"6732-21-5491","nama":"GUIDE","satuan":"EA"},{"kode":"6736-51-5142","nama":"ENGINE OIL FILTER","satuan":"EA"},{"kode":"6754-11-8180","nama":"PACKING","satuan":"EA"},{"kode":"6754-41-4100","nama":"VALVE KOMATSU","satuan":"EA"},{"kode":"6754-41-4200","nama":"VALVE KOMATSU","satuan":"EA"},{"kode":"6754-79-6140","nama":"FUEL FILTER","satuan":"EA"},{"kode":"6754-81-8090","nama":"TURBOCHARGE","satuan":"EA"},{"kode":"7002734","nama":"HYDRAULIC OIL TANK FILTER","satuan":"EA"},{"kode":"7008043","nama":"OUTER AIR FILTER","satuan":"EA"},{"kode":"7008044","nama":"INNER AIR FILTER","satuan":"EA"},{"kode":"7012314","nama":"HYDRAULIC OIL FILTER","satuan":"EA"},{"kode":"703-08-94510","nama":"RING, BASE","satuan":"EA"},{"kode":"703-08-96140","nama":"SEAL OIL","satuan":"EA"},{"kode":"706-7G-11291","nama":"SEALOIL","satuan":"EA"},{"kode":"707-98-46280-R","nama":"SERVICE KIT BOOM CYLINDER RH KOMATSU","satuan":"EA"},{"kode":"707-98-48610","nama":"SERVICE KIT","satuan":"EA"},{"kode":"708-2L-06480","nama":"BLOCK ASSY RR","satuan":"EA"},{"kode":"708-2L-23131","nama":"SEAT","satuan":"EA"},{"kode":"708-2L-32150","nama":"BEARING","satuan":"EA"},{"kode":"708-2L-33160","nama":"SPRING","satuan":"EA"},{"kode":"708-2L-33350","nama":"SHOE RETAINER","satuan":"EA"},{"kode":"708-2L-33430","nama":"PISTON SUB ASSY","satuan":"EA"},{"kode":"708-7L-12140","nama":"BEARING","satuan":"EA"},{"kode":"708-8F-12151","nama":"BEARING KOMATSU","satuan":"EA"},{"kode":"708-8F-32121","nama":"SHAFT","satuan":"EA"},{"kode":"7142000","nama":"ALTERNATOR BELT","satuan":"EA"},{"kode":"7188792","nama":"DRIVE PUMP BELT","satuan":"EA"},{"kode":"7195W-51110","nama":"PAINT A/F OLYMPIC PROTECT RED","satuan":"L"},{"kode":"723-11-18150","nama":"O-RING","satuan":"EA"},{"kode":"723-11-19130","nama":"O-RING","satuan":"EA"},{"kode":"723-46-17510","nama":"ORING","satuan":"EA"},{"kode":"723-46-17520","nama":"RING BACK-UP","satuan":"EA"},{"kode":"723-46-17530","nama":"ORING","satuan":"EA"},{"kode":"723-46-41950","nama":"O-RING","satuan":"EA"},{"kode":"7414582","nama":"HYDRAULIC OIL FILTER AND O-RINGS","satuan":"EA"},{"kode":"7496373","nama":"HYDRAULIC OIL CANISTER CAP","satuan":"EA"},{"kode":"7G-6576","nama":"CAGE A","satuan":"EA"},{"kode":"7M-4710","nama":"COGGED V-BELT (SET OF 2)","satuan":"EA"},{"kode":"80266689","nama":"SAFETY VALVE TANK","satuan":"EA"},{"kode":"85671-11150","nama":"PAINT HEMPADUR LIGHT GREY","satuan":"L"},{"kode":"85GR-REDCYLICONE","nama":"SILICONE RED","satuan":"EA"},{"kode":"860112394","nama":"CAP RADIATOR XMCG","satuan":"EA"},{"kode":"88A13001F1","nama":"FUEL FILTER","satuan":"EA"},{"kode":"897222-1720","nama":"TURBO CHARGE HITACHI","satuan":"EA"},{"kode":"8FD70N_ 4715-02","nama":"BRAKE ASSY, LH","satuan":"EA"},{"kode":"8FD70N_1603-01","nama":"RADIATOR ASSY","satuan":"EA"},{"kode":"8FD70N_1603-17","nama":"SHAFT ASSY, FAN DRIVE","satuan":"EA"},{"kode":"8FD70N_1603-41A","nama":"BELT, V","satuan":"EA"},{"kode":"8FD70N_1603-46","nama":"HOSE, RADIATOR, INLET","satuan":"EA"},{"kode":"8FD70N_1603-54","nama":"RUBBER, MOUNTING (FOR RADIATOR)","satuan":"EA"},{"kode":"8FD70N_1603-68","nama":"BELT, FAN DRIVE","satuan":"EA"},{"kode":"8FD70N_1603-80","nama":"HOSE, RADIATOR, OUTLET, NO. 1","satuan":"EA"},{"kode":"8FD70N_1603-DP","nama":"CLIP","satuan":"EA"},{"kode":"8FD70N_1603-DQ","nama":"BEARING","satuan":"EA"},{"kode":"8FD70N_1603-ED","nama":"FITTING","satuan":"EA"},{"kode":"8FD70N_1603-GQ","nama":"SEAL OR RING, O 9FOR VALVE STEM OIL","satuan":"EA"},{"kode":"8FD70N_1603-XG","nama":"SPACER","satuan":"EA"},{"kode":"8FD70N_1603-XI","nama":"BEARING","satuan":"EA"},{"kode":"8FD70N_2201-01","nama":"HOLDER & NOZZLE SET","satuan":"EA"},{"kode":"8FD70N_2601-10","nama":"WIRE ASSY, ACCELERATOR FLEXIBLE","satuan":"EA"},{"kode":"8FD70N_3201-20B","nama":"SEAL, OIL (FOR TORQUECONVERTER CASE)","satuan":"EA"},{"kode":"8FD70N_3201-21","nama":"CASE SUB-ASSY, TOQUECONVERTER, NO. 2","satuan":"EA"},{"kode":"8FD70N_3201-21A","nama":"PACKING, TRANSMISSION CASE","satuan":"EA"},{"kode":"8FD70N_3204-45C","nama":"RING, O (FOR OUTPUT SHAFT)","satuan":"EA"},{"kode":"8FD70N_3204-66A","nama":"SEAL, OIL (FOR COUPLING)","satuan":"EA"},{"kode":"8FD70N_3204-66B","nama":"BEARING, COUPLING","satuan":"EA"},{"kode":"8FD70N_3204-AQ","nama":"PLATE, LOCK","satuan":"EA"},{"kode":"8FD70N_3204-AR","nama":"BOLT","satuan":"EA"},{"kode":"8FD70N_3204-FU","nama":"DEFLETOR","satuan":"EA"},{"kode":"8FD70N_4101-59A","nama":"SEAL, OIL (FOR CARRIER COVER)","satuan":"EA"},{"kode":"8FD70N_4101-60","nama":"GEAR, REDUCTION","satuan":"EA"},{"kode":"8FD70N_4101-60A","nama":"BEARING, NO. 1, REDUCTION GEAR","satuan":"EA"},{"kode":"8FD70N_4201-40C","nama":"SEAL, OIL (FOR FRONT AXLE SHAFT)","satuan":"EA"},{"kode":"8FD70N_4201-41C","nama":"BEARING, NO.2 , FRONT AXLE HUB","satuan":"EA"},{"kode":"8FD70N_4201-41D","nama":"NUT, BEARING LOCK","satuan":"EA"},{"kode":"8FD70N_4201-41E","nama":"BOLT, HUB","satuan":"EA"},{"kode":"8FD70N_4201-46","nama":"SHAFT, PLANET GEAR","satuan":"EA"},{"kode":"8FD70N_4201-47","nama":"GEAR, PLANET","satuan":"EA"},{"kode":"8FD70N_4201-47A","nama":"BUSHING, PLANET GEAR","satuan":"EA"},{"kode":"8FD70N_4201-48B","nama":"RING, O (FOR PLANET GEAR CARRIER)","satuan":"EA"},{"kode":"8FD70N_4201-49","nama":"PLATE, LOCK NUT","satuan":"EA"},{"kode":"8FD70N_4201-53B","nama":"SEAL, OIL (FOR FRONT AXLE SHAFT)","satuan":"EA"},{"kode":"8FD70N_4201-AN","nama":"WASHER, THRUST","satuan":"EA"},{"kode":"8FD70N_4201-BP","nama":"SCREW","satuan":"EA"},{"kode":"8FD70N_4201-FD","nama":"NUT","satuan":"EA"},{"kode":"8FD70N_4301-20A","nama":"BUSHING, REAR AXLE BEAM","satuan":"EA"},{"kode":"8FD70N_4301-40","nama":"KNUCKLE, STEERING, RH","satuan":"EA"},{"kode":"8FD70N_4301-41","nama":"KNUCKLE, STEERING, LH","satuan":"EA"},{"kode":"8FD70N_4301-42","nama":"PIN, STEERING KNUCKLE KING","satuan":"EA"},{"kode":"8FD70N_4301-42B","nama":"SEAL, OIL, NO. 1","satuan":"EA"},{"kode":"8FD70N_4301-42C","nama":"BEARING, NEEDLE","satuan":"EA"},{"kode":"8FD70N_4301-44A","nama":"BEARING, INNER","satuan":"EA"},{"kode":"8FD70N_4301-44B","nama":"BEARING, OUTER","satuan":"EA"},{"kode":"8FD70N_4301-44C","nama":"BOLT, HUB","satuan":"EA"},{"kode":"8FD70N_4301-44D","nama":"NUT, HUB","satuan":"EA"},{"kode":"8FD70N_4301-44F","nama":"SEAL, OIL (FOR REAR AXLE HUB)","satuan":"EA"},{"kode":"8FD70N_4301-45","nama":"CAP, REAR AXLE HUB","satuan":"EA"},{"kode":"8FD70N_4301-47","nama":"TIE-ROD","satuan":"EA"},{"kode":"8FD70N_4301-AA","nama":"BOLT","satuan":"EA"},{"kode":"8FD70N_4301-AB","nama":"FITTING, GREASE","satuan":"EA"},{"kode":"8FD70N_4301-AC","nama":"FITTING, GREASE","satuan":"EA"},{"kode":"8FD70N_4301-AF","nama":"PLATE, STOPPER","satuan":"EA"},{"kode":"8FD70N_4301-BX","nama":"BOLT","satuan":"EA"},{"kode":"8FD70N_4301-CP","nama":"COLLAR","satuan":"EA"},{"kode":"8FD70N_4301-DG","nama":"PIN","satuan":"EA"},{"kode":"8FD70N_4301-DV","nama":"NUT","satuan":"EA"},{"kode":"8FD70N_4301-DY","nama":"NUT","satuan":"EA"},{"kode":"8FD70N_4301-JI","nama":"RING, O","satuan":"EA"},{"kode":"8FD70N_4402-20","nama":"WHEEL SUB-ASSY, DISC","satuan":"EA"},{"kode":"8FD70N_4402-AF","nama":"FLAP","satuan":"EA"},{"kode":"8FD70N_4403-20","nama":"WHEEL SUB-ASSY, DISC","satuan":"EA"},{"kode":"8FD70N_4714-20","nama":"PIPE SUB-ASSY, BRAKE, MAIN, NO. 1","satuan":"EA"},{"kode":"8FD70N_4714-22","nama":"PIPE SUB-ASSY, BRAKE, RH NO. 1","satuan":"EA"},{"kode":"8FD70N_4714-23","nama":"PIPE SUB-ASSY, BRAKE, LH NO. 1","satuan":"EA"},{"kode":"8FD70N_4715-23","nama":"PLATE SUB-ASSY,BACKING, LH","satuan":"EA"},{"kode":"8FD70N_5611-01B","nama":"BULB,HEAD LAMP","satuan":"EA"},{"kode":"8FD70N_5611-04A","nama":"BULB, REAR COMBINATION LAMP","satuan":"EA"},{"kode":"8FD70N_5611-04D","nama":"BULB, REAR COMBINATION LAMP","satuan":"EA"},{"kode":"8FD70N_5611-04J","nama":"BULB, REAR COMBINATION LAMP","satuan":"EA"},{"kode":"8FD70N_5611-57","nama":"LAMP ASSY, FLASHING BEACON","satuan":"EA"},{"kode":"8FD70N_6101-20B","nama":"BUSHING, MAST SUPPORT","satuan":"EA"},{"kode":"8FD70N_6101-41","nama":"ROLLER, LIFT(FOR INNER MAST)","satuan":"EA"},{"kode":"8FD70N_6101-42","nama":"ROLLER, LIFT(FOR MIDDLE MAST)","satuan":"EA"},{"kode":"8FD70N_6101-50","nama":"ROLLER, SIDE(FOR INNER MAST)","satuan":"EA"},{"kode":"8FD70N_6301-21K","nama":"PIN KIT,FORK STOPPER","satuan":"EA"},{"kode":"8FD70N_6301-40","nama":"ROLLER, LIFT(UPPER,LOWER)","satuan":"EA"},{"kode":"8FD70N_6301-41","nama":"ROLLER, LIFT (CENTER)","satuan":"EA"},{"kode":"8FD70N_6301-42","nama":"ROLLER, SIDE","satuan":"EA"},{"kode":"8FD70N_6302-40","nama":"WHEEL, CHAIN","satuan":"EA"},{"kode":"8FD70N_6302-40A","nama":"RING, SHAFT SNAP (FOR CHAIN WHEEL)","satuan":"EA"},{"kode":"8FD70N_6611-12A","nama":"BULB, FRONT COMBINATION","satuan":"EA"},{"kode":"8FD70N_6611-17A","nama":"BULB, COMBINATION HEAD LIGHT","satuan":"EA"},{"kode":"8FD70N_6611-17B","nama":"BULB, COMBINATION HEADLIGHT","satuan":"EA"},{"kode":"8FD70N_6611-17C","nama":"BULB, COMBINATION HEAD LIGHT","satuan":"EA"},{"kode":"8FD70N_6802-48","nama":"FITTING, FRONT LIFT CYLINDER","satuan":"EA"},{"kode":"8FD70N_6802-76","nama":"VALVE ASSY,SAFETY DOWN","satuan":"EA"},{"kode":"8FD70N_6802-AC","nama":"RING","satuan":"EA"},{"kode":"8FD70N_6802-BC","nama":"HOSE, HIGH PRESSURE","satuan":"EA"},{"kode":"8FD70N_6802-PG","nama":"RING, O","satuan":"EA"},{"kode":"8FD70N_§101-40","nama":"ROLLER, LIFT (FOR OUTER MAST)","satuan":"EA"},{"kode":"8PK1725","nama":"RIBBED BELT MITSUBOSHI","satuan":"EA"},{"kode":"9-14215-166-1","nama":"HYDRAULIC FILTER ISUZU","satuan":"EA"},{"kode":"9-14215-167-0","nama":"INNER AIR FILTER ISUZU","satuan":"EA"},{"kode":"90105-10013-71","nama":"UNIVERSAL JOINT BOLT","satuan":"EA"},{"kode":"91801-07400","nama":"PULLEY KOMATSU","satuan":"EA"},{"kode":"934668B","nama":"SOLID MARKER - BLUE","satuan":"EA"},{"kode":"94410-00600","nama":"MAIN ROLLER AR-D = 117 MITSUBISHI","satuan":"EA"},{"kode":"9G-5343","nama":"256.67MM ASSEMBLED OUTSIDE DIA SEAL","satuan":"EA"},{"kode":"9S-9972","nama":"AIR FILTER CAT","satuan":"EA"},{"kode":"9W-9058","nama":"BOLT","satuan":"EA"},{"kode":"A-1305","nama":"AIR FILTER  SAKURA","satuan":"EA"},{"kode":"A-6111","nama":"AIR FILTER  SAKURA","satuan":"EA"},{"kode":"A04425274","nama":"OIL FILTER CARTRIDGE","satuan":"EA"},{"kode":"A212.10230","nama":"ADMISEAL 212","satuan":"L"},{"kode":"A314.00900","nama":"ADMIMASTIC 331 BLACK","satuan":"L"},{"kode":"A314.50729","nama":"ADMIMASTIC 331 RED 50729","satuan":"L"},{"kode":"A314.AAG","nama":"ADMIMASTIC 331 GREY","satuan":"L"},{"kode":"A317.20362","nama":"ADMIGUARD 317 BEIGE","satuan":"L"},{"kode":"A317.50728","nama":"ADMIGUARD 317 RED","satuan":"L"},{"kode":"A318.30463","nama":"ADMIGUARD 318","satuan":"L"},{"kode":"A810045","nama":"O RING HITACHI","satuan":"EA"},{"kode":"A810090","nama":"O-RING","satuan":"EA"},{"kode":"A882.00900","nama":"COALTAR GUARD 882","satuan":"L"},{"kode":"A942.10000","nama":"ADMITHANE 942 WHITE 10000","satuan":"L"},{"kode":"A942.80300","nama":"ADMITHANE 942 YELLOW GREEN RAL 6018","satuan":"L"},{"kode":"A942.80466","nama":"ADMITHANE 942 GREEN 40640","satuan":"L"},{"kode":"A942.99864","nama":"ADMITHANE 942 BLACK 19990","satuan":"L"},{"kode":"AVR-556","nama":"VOLTAGE REGULATOR 24V","satuan":"EA"},{"kode":"B7577","nama":"LUBE FILTER BALDWIN","satuan":"EA"},{"kode":"BMA664","nama":"PAINT INTERSWIFT 6600 RED","satuan":"L"},{"kode":"BQA624","nama":"PAINT INTERSPEED 6200 RED","satuan":"L"},{"kode":"BQA628","nama":"PAINT INTERSPEED 6200 BROWN","satuan":"L"},{"kode":"BR-262","nama":"BATTERY RELAY 24V","satuan":"EA"},{"kode":"C-1006","nama":"OIL FILTER","satuan":"EA"},{"kode":"C-1301","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"C-1304","nama":"FUEL FILTER  SAKURA","satuan":"EA"},{"kode":"C-1305","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"C-1306","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"C-1310","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"C-1701","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"C-1706","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"CEA0093","nama":"BEARING HITACHI","satuan":"EA"},{"kode":"CLB000/5L/RI","nama":"PAINT INTERLAC 665 WHITE","satuan":"L"},{"kode":"CLL549/5L/RI","nama":"PAINT INTERLAC 665 S GREEN","satuan":"L"},{"kode":"CPA099/5L/RI","nama":"PAINT INTERPRIME 198 RED","satuan":"L"},{"kode":"DR110","nama":"GREASE PUMP YAMADA","satuan":"EA"},{"kode":"EONSPILL257","nama":"EON SPILL 257","satuan":"PL"},{"kode":"EZ1599","nama":"SAFETY LATCH","satuan":"EA"},{"kode":"F-1801","nama":"FUEL FILTER  SAKURA","satuan":"EA"},{"kode":"F2300-20000","nama":"NUT MITSUBISHI","satuan":"EA"},{"kode":"F8140-30214","nama":"TAPER ROLLER BEARING MITSUBISHI","satuan":"EA"},{"kode":"FAJ034/A20L/RI","nama":"PAINT INTERGARD 263 LIGHT GREY","satuan":"L"},{"kode":"FC-1007","nama":"FUEL FILTER  SAKURA","satuan":"EA"},{"kode":"FC-1503","nama":"FUEL FILTER  SAKURA","satuan":"EA"},{"kode":"FC-1801","nama":"FUEL FILTER  SAKURA","satuan":"EA"},{"kode":"FGH-1","nama":"FUEL GUN HUSKY","satuan":"EA"},{"kode":"GTA004/5L/RI","nama":"PAINT THINNER CLEAR","satuan":"L"},{"kode":"GTA007/5L/RI","nama":"PAINT THINNER CLEAR","satuan":"L"},{"kode":"HHB-630M","nama":"ELECTRIC HYDRAULIC PUMP_35L_2.2KW_380V","satuan":"EA"},{"kode":"HHYG-100150","nama":"SINGLE ACT HYD CYLINDER_100TON X 150MM","satuan":"EA"},{"kode":"I0-91110-522-0","nama":"WHEEL NUT PIN_FRONT AXLE","satuan":"EA"},{"kode":"I2-97014-252-1","nama":"FAN BELT COOLING_NKR66","satuan":"EA"},{"kode":"I2-97247-514-0","nama":"OIL FILTER_NKR66/66-2","satuan":"EA"},{"kode":"I5-87832-221-0","nama":"REPAIR KIT_CLUTCH M/CYLINDER NQR 71B","satuan":"EA"},{"kode":"I7-42502-223-A","nama":"CABLE BATTERY TO STARTER_NKR71","satuan":"EA"},{"kode":"I7-76020-215-A","nama":"PROPELLER SHAFT_NLR71-T","satuan":"EA"},{"kode":"I7-89002-217-B","nama":"DISC WHEELNKR71-T/THD","satuan":"EA"},{"kode":"I8-94133-759-9","nama":"PLUG GLOW_D-MAX","satuan":"EA"},{"kode":"I8-94248-117-1","nama":"SEAL OIL HUB FRONT_NKR66","satuan":"EA"},{"kode":"I8-94360-792-A","nama":"KING PIN ONLY_NKR71","satuan":"EA"},{"kode":"I8-94399-398-0","nama":"STRAINER GASKET_NKR66","satuan":"EA"},{"kode":"I8-97033-888-0","nama":"EXHAUST BRAKE AIR FILTER_NKR66","satuan":"EA"},{"kode":"I8-97085-071-A","nama":"BRAKE DRUM FRONT NKR55E2","satuan":"EA"},{"kode":"I8-97107-349-2","nama":"TIE ROD L","satuan":"EA"},{"kode":"I8-97124-740-0","nama":"HOSE WATER BOTTO","satuan":"EA"},{"kode":"I8-97162-163-A","nama":"HOSE RADIATOR IN_NKR71E2","satuan":"EA"},{"kode":"I8-97171-451-2","nama":"FUEL FILTER_NKR66","satuan":"EA"},{"kode":"I8-97172-548-0","nama":"CAP FUEL FILTER_NKR71E2","satuan":"EA"},{"kode":"I8-97209-950-A","nama":"HOSE WATER TURBO_NKR71E2","satuan":"EA"},{"kode":"I8-97217-911-3","nama":"HOSE_AIR_TURBO_NHR55E2","satuan":"EA"},{"kode":"I8-97224-318-1","nama":"HOSE OIL COOLER_NHR55E2","satuan":"EA"},{"kode":"I8-97359-805-0","nama":"WHEEL NUT_INNER_REAR AXLE","satuan":"EA"},{"kode":"I8-97359-806-0","nama":"LH WHEEL NUT_INNER MOUNT","satuan":"EA"},{"kode":"I8-97359-809-0","nama":"NUT WHEEL PIN REAR AXLE FILTER_E2","satuan":"EA"},{"kode":"I8-97359-810-0","nama":"LH NUT WHEEL PIN REAR AXLE_FTR","satuan":"EA"},{"kode":"I8-97377-899-A","nama":"CLUTCH DISC NKR55E2","satuan":"EA"},{"kode":"I8-97695-623-A","nama":"SPRING LEAF FRONT_NMR71_SD","satuan":"EA"},{"kode":"I8-97695-631-A","nama":"SPRING LEAF REAR_NMR71_ST","satuan":"EA"},{"kode":"I8-98098-250-0","nama":"CYLINDER_CLUTCH MASTER_NQ","satuan":"EA"},{"kode":"I8-98127-460-3","nama":"CYLINDER_BRAKE MASTER NLR5","satuan":"EA"},{"kode":"I8-98171-254-A","nama":"BEARING INNER FRONT HUB_NQR71","satuan":"EA"},{"kode":"I8-98213-867-0","nama":"STRAINER_OIL_OIL PUMP FTR90","satuan":"EA"},{"kode":"I8-98251-954-0","nama":"TIE ROD R","satuan":"EA"},{"kode":"I8-98319-912-A","nama":"FUEL FILTER_NKR71","satuan":"EA"},{"kode":"I8-98321-413-A","nama":"AIR CLEANER FILTER","satuan":"EA"},{"kode":"I8-98327-903-0","nama":"NUT_BEARING_REAR HUB NLR55","satuan":"EA"},{"kode":"I9-00093-081-A","nama":"BEARING INNER REAR HUB_NKR58","satuan":"EA"},{"kode":"I9-00093-082-A","nama":"BEARING OUTER REAR HUB_NKR55","satuan":"EA"},{"kode":"I9-00093-172-A","nama":"HUB OUTER BEARING_FRONT AXLE","satuan":"EA"},{"kode":"INTERSPEED6200","nama":"PAINT A/F BQA628-BROWN","satuan":"L"},{"kode":"J75481","nama":"FITTING","satuan":"EA"},{"kode":"J75581","nama":"FITTING GREASE","satuan":"EA"},{"kode":"J8610111","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"J8610495","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"J8610940","nama":"LUBE FILTER","satuan":"EA"},{"kode":"J8613000","nama":"LUBE FILTER","satuan":"EA"},{"kode":"J8620121","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"J8621311","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"J8621614","nama":"FUEL FILTER","satuan":"EA"},{"kode":"J8630180-1","nama":"HYDRAULIC FILTER DONALDSON","satuan":"EA"},{"kode":"J8633052","nama":"HYDRAULIC FILTER","satuan":"EA"},{"kode":"JBA016/5L/RI","nama":"PAINT INTERTUF 16 BLACK","satuan":"L"},{"kode":"KDK724/A20L/RI","nama":"PAINT INTERBOND 201 STROM GREY","satuan":"L"},{"kode":"KDL549/A20L/RI","nama":"PAINT INTERBOND 201 S GREEN","satuan":"L"},{"kode":"KDY999/A20L/RI","nama":"PAINT INTERBOND 201 BLACK","satuan":"L"},{"kode":"MC810632","nama":"NUT WHEEL MITSUBISHI","satuan":"EA"},{"kode":"MVAA-220-4A2","nama":"PILOT VALVE MINDMAN","satuan":"EA"},{"kode":"N310ECP","nama":"CYLINDER ROLLER BEARING","satuan":"EA"},{"kode":"NU2307ECP","nama":"CYLINDRICAL ROLLER BEARING","satuan":"EA"},{"kode":"O-1809","nama":"LUBE FILTER  SAKURA","satuan":"EA"},{"kode":"P173238","nama":"HYDRAULIC FILTER DONALDSON","satuan":"EA"},{"kode":"P181099","nama":"AIR FILTER DONALDSON","satuan":"EA"},{"kode":"P502244","nama":"HYDRAULIC FILTER STRAINER DONALDSON","satuan":"EA"},{"kode":"P502270","nama":"HYDRAULIC FILTER DONALDSON","satuan":"EA"},{"kode":"P502382","nama":"HYDRAULIC FILTER","satuan":"EA"},{"kode":"P502527","nama":"HYDRAULIC FILTER DONALDSON","satuan":"EA"},{"kode":"P527484","nama":"AIR FILTER DONALDSON","satuan":"EA"},{"kode":"P550335","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"P550385","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P550588","nama":"WATER SEPARATOR FUEL FILTER","satuan":"EA"},{"kode":"P550777","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"P551210","nama":"HYDRAULIC FILTER DONALDSON","satuan":"EA"},{"kode":"P551314","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P551329","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P551342","nama":"HYDRAULIC FILTER DONALDSON","satuan":"EA"},{"kode":"P551670","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"P551864","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P552010PM","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P552040PM","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P553000","nama":"LUBE FILTER","satuan":"EA"},{"kode":"P554005","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"P554105","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"P555823","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"P558615","nama":"LUBE FILTER","satuan":"EA"},{"kode":"P828889","nama":"AIR FILTER DONALDSON","satuan":"EA"},{"kode":"PHY999/A","nama":"PAINT INTERTHANE 990 BLACK","satuan":"L"},{"kode":"QX104190","nama":"AIR FILTER","satuan":"EA"},{"kode":"QX150410","nama":"SEPARATOR KIT D","satuan":"SET"},{"kode":"QX150411","nama":"MINOR KIT C","satuan":"SET"},{"kode":"QX150412","nama":"MAJOR KIT E","satuan":"SET"},{"kode":"RS3505","nama":"AIR FILTER","satuan":"EA"},{"kode":"S/F459051","nama":"TRACK ROLLER KOMATSU","satuan":"EA"},{"kode":"S1136714990","nama":"FAN BELT","satuan":"EA"},{"kode":"SCWO4000-20","nama":"SCREW COMPRESSOR OIL 4000 HOUR","satuan":"PL"},{"kode":"SCX550E-2040779","nama":"ROD : PISTON","satuan":"EA"},{"kode":"SCX550E-3053246","nama":"FLANGE : SPL","satuan":"EA"},{"kode":"SCX550E-3075543","nama":"NUT : SPL","satuan":"EA"},{"kode":"SCX550E-3077237","nama":"AXLE","satuan":"EA"},{"kode":"SCX550E-3078695","nama":"ROD","satuan":"EA"},{"kode":"SCX550E-3078698","nama":"HOLDER","satuan":"EA"},{"kode":"SCX550E-3104056","nama":"AXLE","satuan":"EA"},{"kode":"SCX550E-4137866","nama":"U-RING","satuan":"EA"},{"kode":"SCX550E-4140481","nama":"O-RING","satuan":"EA"},{"kode":"SCX550E-4142235","nama":"BUSHING","satuan":"EA"},{"kode":"SCX550E-4153731","nama":"SEAL : GROUP","satuan":"EA"},{"kode":"SCX550E-4182363","nama":"RING","satuan":"EA"},{"kode":"SCX550E-4264035","nama":"SEAL : DUST","satuan":"EA"},{"kode":"SCX550E-4272503","nama":"BOLT : SPL","satuan":"EA"},{"kode":"SCX550E-4282633","nama":"SEAL : GROUP","satuan":"EA"},{"kode":"SCX550E-4350249","nama":"FILTER","satuan":"EA"},{"kode":"SCX550E-4353620","nama":"LINING","satuan":"EA"},{"kode":"SCX550E-4353621","nama":"LINING","satuan":"EA"},{"kode":"SCX550E-4630998","nama":"PIN","satuan":"EA"},{"kode":"SCX550E-9245617","nama":"TAKE-UP ROLLER","satuan":"EA"},{"kode":"SCX550E-9246878","nama":"TRACK : ROLLER","satuan":"EA"},{"kode":"SCX550E-A590906","nama":"WASHER : SPRING","satuan":"EA"},{"kode":"SCX550E-A810070","nama":"O-RING","satuan":"EA"},{"kode":"SCX550E-A810080","nama":"O-RING","satuan":"EA"},{"kode":"SCX550E-J782000","nama":"BOLT : HEX SOC HD","satuan":"EA"},{"kode":"SCX550E-M341025","nama":"BOLT : HEX SOC HD","satuan":"EA"},{"kode":"SCX550E-M480630","nama":"SCREW : FLUSH HD","satuan":"EA"},{"kode":"SCX550E-M500605","nama":"NUT : HIGH STRENGTH","satuan":"EA"},{"kode":"SCX550E-YA00030338","nama":"VALVE","satuan":"EA"},{"kode":"SCX550E-YL40002598","nama":"ROPE : PENDANT","satuan":"EA"},{"kode":"SCX550E-YL40003181","nama":"ROPE : PENDANT","satuan":"EA"},{"kode":"SCX550E-Z942491","nama":"BRG : BALL","satuan":"EA"},{"kode":"SCX550E-Z950386","nama":"BRG : BALL","satuan":"EA"},{"kode":"SCX550E-Z971541","nama":"BRG : BALL","satuan":"EA"},{"kode":"SCX550E-Z991349","nama":"RETAINER","satuan":"EA"},{"kode":"SFH3321","nama":"DRAIN FILTER SURE FILTER","satuan":"EA"},{"kode":"SFO1431","nama":"FUEL FILTER SURE FILTER","satuan":"EA"},{"kode":"SPOTCHECKCLEANER","nama":"SPOTCHECK","satuan":"CAN"},{"kode":"SPOTCHECKDEVELOPER","nama":"SPOTCHECK","satuan":"CAN"},{"kode":"SPOTCHECKPENETRANT","nama":"SPOTCHECK, PENETRANT","satuan":"CAN"},{"kode":"YA00033065","nama":"HYDRAULIC FILTER","satuan":"EA"},{"kode":"Z435692","nama":"SPRING HITACHI","satuan":"EA"},{"kode":"_01643-31645","nama":"WASHER KOMATSU","satuan":"EA"},{"kode":"_07959-20001","nama":"VALVE KOMATSU","satuan":"EA"},{"kode":"_30020202","nama":"VAN BELT CUMMIS","satuan":"EA"},{"kode":"_30214JR","nama":"BEARING","satuan":"EA"},{"kode":"_3040303","nama":"VAN BELT CUMMIS","satuan":"EA"},{"kode":"_4061709","nama":"LINING HITACHI","satuan":"EA"},{"kode":"_4067160","nama":"LINING, CLUTCH HITACHI","satuan":"EA"},{"kode":"_4067161","nama":"LINING, CLUTCH HITACHI","satuan":"EA"},{"kode":"_4067762","nama":"LINING HITACHI","satuan":"EA"},{"kode":"_6307","nama":"BEARING SKF","satuan":"EA"},{"kode":"_A-6006","nama":"AIR FILTER  SAKURA","satuan":"EA"},{"kode":"_AF928M","nama":"AIR FILTER FLEETGUARD","satuan":"EA"},{"kode":"_FC-1805","nama":"AIR FILTER  SAKURA","satuan":"EA"},{"kode":"_FF5319","nama":"FUEL FILTER FLEETGUARD","satuan":"EA"},{"kode":"_LC1D25M7","nama":"CONTACTOR 440V/25A","satuan":"EA"},{"kode":"_P532966","nama":"AIR FILTER DONALDSON","satuan":"EA"},{"kode":"_P551110","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"_P553004","nama":"FUEL FILTER DONALDSON","satuan":"EA"},{"kode":"_P553771","nama":"LUBE FILTER DONALDSON","satuan":"EA"},{"kode":"_P554004","nama":"LUBE FILTER DONALDSON","satuan":"EA"}];
function matFindByKode(kode){
  for(var i=0;i<MATERIAL_MASTER.length;i++){if(MATERIAL_MASTER[i].kode===kode)return MATERIAL_MASTER[i];}
  return null;
}

/* ══════════════════════════════════════════════
   KAPAL — daftar project/kapal (tersimpan di HP, localStorage)
══════════════════════════════════════════════ */
function kapalGetList(){
  try{return JSON.parse(localStorage.getItem('shm_kapal')||'[]');}catch(e){return [];}
}
function kapalSaveList(list){
  try{localStorage.setItem('shm_kapal',JSON.stringify(list));}catch(e){}
}
function kapalAdd(nama){
  nama=(nama||'').trim();
  if(!nama)return;
  var list=kapalGetList();
  if(list.indexOf(nama)===-1){list.push(nama);kapalSaveList(list);}
  kapalRenderOptions();
}
function kapalDelete(nama){
  var list=kapalGetList().filter(function(k){return k!==nama;});
  kapalSaveList(list);
  kapalRenderOptions();
}
function kapalPromptAdd(){
  var nama=prompt('Nama kapal/project baru:');
  if(nama)kapalAdd(nama);
}
function kapalPromptDelete(){
  var sel=document.getElementById('m_kapal');
  if(!sel||!sel.value){toast('\u26A0\uFE0F Pilih kapal dulu');return;}
  if(confirm('Hapus "'+sel.value+'" dari daftar kapal?'))kapalDelete(sel.value);
}
function kapalRenderOptions(){
  var sel=document.getElementById('m_kapal');
  if(!sel)return;
  var cur=sel.value;
  var list=kapalGetList();
  sel.innerHTML='<option value="">\u2014 Pilih Kapal \u2014</option>'+
    list.map(function(k){return '<option'+(k===cur?' selected':'')+'>'+k+'</option>';}).join('');
}

/* ══════════════════════════════════════════════
   MATERIAL — Baris dinamis (multi-item per request)
══════════════════════════════════════════════ */
var matRowCount=0;
function matAddRow(){
  var idx=matRowCount++;
  var wrap=document.createElement('div');
  wrap.className='mrow';
  wrap.id='mrow_'+idx;
  wrap.style.cssText='border:1px dashed var(--border);border-radius:10px;padding:12px;margin-bottom:12px;position:relative';
  wrap.innerHTML=
    '<button type="button" onclick="matRemoveRow('+idx+')" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--destructive);font-size:16px">&#128465;</button>'+
    '<div class="field"><label class="flbl">Nama Material</label>'+
      '<input type="text" id="mr_nama_'+idx+'" list="mat_global_list" placeholder="Ketik nama material..." oninput="matPickRow('+idx+')"/></div>'+
    '<div class="field" style="margin-top:8px"><label class="flbl">Kode Material</label>'+
      '<input type="text" id="mr_kode_'+idx+'" readonly style="opacity:.7"/></div>'+
    '<div class="fr" style="margin-top:8px">'+
      '<div class="field"><label class="flbl">Valuation</label>'+
        '<select id="mr_val_'+idx+'" onchange="matToggleVal('+idx+')"><option value="NEW">NEW</option><option value="OFF-CUT">OFF-CUT</option></select></div>'+
      '<div class="field" id="mr_qtywrap_'+idx+'"><label class="flbl">Jumlah</label>'+
        '<div style="display:flex;gap:6px"><input type="number" id="mr_qty_'+idx+'" placeholder="0" min="0" style="flex:1"/>'+
        '<input type="text" id="mr_sat_'+idx+'" readonly style="width:56px;opacity:.7"/></div></div>'+
    '</div>'+
    '<div id="mr_offcut_'+idx+'" style="display:none;margin-top:8px">'+
      '<div class="field"><label class="flbl">Ukuran <span class="opt">(pisah koma kalau lebih dari 1)</span></label><input type="text" id="mr_ukurOC_'+idx+'" placeholder="500mm, 700mm"/></div>'+
      '<div class="fr" style="margin-top:8px">'+
        '<div class="field"><label class="flbl">Return</label><input type="text" id="mr_ret_'+idx+'" placeholder="PT.MSM"/></div>'+
        '<div class="field"><label class="flbl">Project</label><input type="text" id="mr_projOC_'+idx+'" placeholder="TB. MBP 3209"/></div>'+
      '</div>'+
    '</div>'+
    '<div class="field" style="margin-top:8px" id="mr_ukurwrap_'+idx+'"><label class="flbl">Ukuran <span class="opt">(opsional)</span></label><input type="text" id="mr_ukur_'+idx+'" placeholder="1200x2400"/></div>'+
    '<div class="field" style="margin-top:8px"><label class="flbl">Mark <span class="opt">(opsional)</span></label><input type="text" id="mr_mark_'+idx+'" placeholder="Catatan..."/></div>';
  document.getElementById('mrows').appendChild(wrap);
}
function matRemoveRow(idx){
  var el=document.getElementById('mrow_'+idx);
  if(el)el.remove();
}
/* Datalist GLOBAL — dirender 1x saja, dipakai semua baris (biar HP gak lag) */
var _matListRendered=false;
function matRenderGlobalList(){
  if(_matListRendered)return;
  var dl=document.getElementById('mat_global_list');
  if(!dl)return;
  var html='';
  for(var i=0;i<MATERIAL_MASTER.length;i++){
    var m=MATERIAL_MASTER[i];
    html+='<option value="'+m.nama.replace(/"/g,'&quot;')+' ['+m.kode+']">';
  }
  dl.innerHTML=html;
  _matListRendered=true;
}
function matFindByNamaKode(text){
  /* text formatnya "Nama Material [KODE]" hasil pilih dari datalist */
  var m=text.match(/\[([^\[\]]+)\]\s*$/);
  if(!m)return null;
  return matFindByKode(m[1]);
}
function matPickRow(idx){
  var input=document.getElementById('mr_nama_'+idx).value;
  var found=matFindByNamaKode(input);
  if(found){
    document.getElementById('mr_nama_'+idx).value=found.nama;
    document.getElementById('mr_kode_'+idx).value=found.kode;
    document.getElementById('mr_sat_'+idx).value=found.satuan;
  } else {
    document.getElementById('mr_kode_'+idx).value='';
    document.getElementById('mr_sat_'+idx).value='';
  }
}
function matToggleVal(idx){
  var val=document.getElementById('mr_val_'+idx).value;
  var isOC=val==='OFF-CUT';
  document.getElementById('mr_offcut_'+idx).style.display=isOC?'block':'none';
  document.getElementById('mr_qtywrap_'+idx).style.display=isOC?'none':'block';
  document.getElementById('mr_ukurwrap_'+idx).style.display=isOC?'none':'block';
}
function matCollectRows(){
  var rows=[];
  document.querySelectorAll('#mrows .mrow').forEach(function(el){
    var idx=el.id.replace('mrow_','');
    var val=document.getElementById('mr_val_'+idx).value;
    var row={
      kode:document.getElementById('mr_kode_'+idx).value.trim(),
      nama:document.getElementById('mr_nama_'+idx).value.trim(),
      satuan:document.getElementById('mr_sat_'+idx).value,
      valuation:val,
      mark:document.getElementById('mr_mark_'+idx).value.trim()||'-'
    };
    if(val==='OFF-CUT'){
      row.ukuran=document.getElementById('mr_ukurOC_'+idx).value.trim();
      row.ret=document.getElementById('mr_ret_'+idx).value.trim();
      row.proj_row=document.getElementById('mr_projOC_'+idx).value.trim();
    } else {
      row.qty=document.getElementById('mr_qty_'+idx).value;
      row.ukuran=document.getElementById('mr_ukur_'+idx).value.trim();
    }
    if(row.kode&&row.nama)rows.push(row);
  });
  return rows;
}

/* ── Bangun teks output (dipakai preview & simpan) ── */
function matBuildText(tgl,kapal,rows){
  var lines=['\uD83D\uDCE6 REQUEST MATERIAL \u2014 PT. SHM'];
  var newRows=rows.filter(function(r){return r.valuation==='NEW';});
  var ocRows=rows.filter(function(r){return r.valuation==='OFF-CUT';});
  lines.push('Tanggal : '+tgl);
  if(newRows.length){
    lines.push('Project : *'+kapal+'*');
    lines.push('Valuation : NEW');
    newRows.forEach(function(r){
      lines.push('- '+r.kode+' '+r.nama);
      lines.push('*('+r.qty+' '+r.satuan+')*');
    });
  }
  if(ocRows.length){
    var groups={};
    var order=[];
    ocRows.forEach(function(r){
      var key=r.ret+'|||'+r.proj_row;
      if(!groups[key]){groups[key]=[];order.push(key);}
      groups[key].push(r);
    });
    order.forEach(function(key){
      var grp=groups[key];
      lines.push('');
      lines.push('Valuation: OFF-CUT');
      lines.push('Return : '+grp[0].ret);
      lines.push('Project : '+grp[0].proj_row);
      grp.forEach(function(r){
        lines.push('- '+r.kode+' '+r.nama);
        lines.push('X *'+r.ukuran+'*');
      });
    });
  }
  return lines.join('\n');
}

function prevMaterial(){
  var tgl=g('m_tgl')||today();
  var kapal=g('m_kapal');
  var rows=matCollectRows();
  if(!rows.length){toast('\u26A0\uFE0F Tambahkan minimal 1 material');return;}
  document.getElementById('m_prev').textContent=matBuildText(tgl,kapal,rows);
  document.getElementById('m_prev_card').style.display='block';
}
function saveMaterial(){
  var tgl=g('m_tgl')||today();
  var kapal=g('m_kapal');
  var rows=matCollectRows();
  if(!kapal){toast('\u26A0\uFE0F Pilih kapal dulu');return;}
  if(!rows.length){toast('\u26A0\uFE0F Tambahkan minimal 1 material');return;}
  toast('\u23F3 Menyimpan '+rows.length+' material...');
  var done=0,fail=0;
  rows.forEach(function(r){
    var data={
      tanggal:tgl,project_kapal:r.valuation==='OFF-CUT'?r.proj_row:kapal,
      kode_material:r.kode,nama_material:r.nama,
      valuation:r.valuation,mark:r.mark,
      jumlah:r.valuation==='NEW'?r.qty:'-',
      satuan:r.valuation==='NEW'?r.satuan:'-',
      ukuran:r.ukuran||'-',
      return_ke:r.valuation==='OFF-CUT'?r.ret:'-'
    };
    gasPost('add','request_material',data,'',function(res){
      done++;
      if(res.status!=='success')fail++;
      if(done===rows.length){
        toast(fail?('\u26A0\uFE0F '+(rows.length-fail)+' tersimpan, '+fail+' gagal'):'\u2705 '+rows.length+' material tersimpan');
        logAct('create','Request Material',rows.length+' item \u2014 '+kapal);
      }
    });
  });
}

/* TABUNG */
function prevTabung(){
  var s=g('t_status');
  var ico=s==='Normal'?'\uD83D\uDFE2':s==='No Seri Hilang'?'\uD83D\uDFE0':'\uD83D\uDD34';
  document.getElementById('t_prev').textContent=
    '\uD83D\uDD35 LAPORAN SERI TABUNG \u2014 PT. SHM\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+
    'Tanggal  : '+(g('t_tgl')||today())+'\nNo. Seri : '+g('t_seri')+
    '\nJenis    : '+g('t_jenis')+'\nStatus   : '+ico+' '+s+
    '\nProject  : '+g('t_proj')+'\nCatatan  : '+(g('t_cat')||'-')+'\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  document.getElementById('t_prev_card').style.display='block';
}
function saveTabung(){
  var data={tanggal:g('t_tgl')||today(),no_seri:g('t_seri'),jenis_tabung:g('t_jenis'),
    status:g('t_status'),project_kapal:g('t_proj'),catatan:g('t_cat')||'-'};
  toast('\u23F3 Menyimpan...');
  gasPost('add','seri_tabung',data,'',function(r){
    if(r.status==='success'){toast('\u2705 Data tabung tersimpan');logAct('create','Seri Tabung',data.no_seri+' \u2014 '+data.jenis_tabung);}
    else toast('\u274C '+(r.message||'Gagal'));
  });
}

/* ALAT */
function prevAlat(){
  var projs=JSON.parse(document.getElementById('a_projs').value);
  var alats=JSON.parse(document.getElementById('a_alats').value);
  var blok=JSON.parse(document.getElementById('a_blok').value);
  var blokTxt=blok.length?blok.map(function(b){return'  \u2022 '+b.alat+' \u2192 '+b.project;}).join('\n'):'  -';
  document.getElementById('a_prev').textContent=
    '\uD83C\uDFD7\uFE0F REQUEST HEAVY EQUIPMENT \u2014 PT. SHM\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+
    'Tanggal    : '+(g('a_tgl')||today())+'\nSubkon     : '+g('a_subkon')+
    '\nProject    : '+(projs.join(', ')||'-')+
    '\nWaktu      : '+g('a_waktu')+(g('a_jam')?' \u2014 '+g('a_jam'):'')+
    '\nAlat       : '+(alats.join(', ')||'-')+
    '\nRekomendasi: '+(g('a_rekom')||'-')+'\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+
    'Blok Pekerjaan:\n'+blokTxt+'\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  document.getElementById('a_prev_card').style.display='block';
}
function saveAlat(){
  var data={tanggal:g('a_tgl')||today(),subkontraktor:g('a_subkon'),
    project:document.getElementById('a_projs').value,waktu:g('a_waktu'),jam:g('a_jam')||'-',
    alat_berat:document.getElementById('a_alats').value,
    rekomendasi_unit:g('a_rekom')||'-',
    blok_pekerjaan:document.getElementById('a_blok').value};
  toast('\u23F3 Menyimpan...');
  gasPost('add','request_alat_berat',data,'',function(r){
    if(r.status==='success'){toast('\u2705 Request alat tersimpan');logAct('create','Request Alat Berat',g('a_subkon'));}
    else toast('\u274C '+(r.message||'Gagal'));
  });
}

/* KENDALA */
function saveKendala(){
  var data={tanggal:g('k_tgl')||today(),project_kapal:g('k_proj'),
    jenis_kendala:g('k_jenis'),deskripsi:g('k_desk'),
    durasi:g('k_dur'),solusi:g('k_sol')};
  toast('\u23F3 Menyimpan...');
  gasPost('add','laporan_keterlambatan',data,'',function(r){
    if(r.status==='success'){toast('\u2705 Laporan tersimpan');logAct('create','Laporan Kendala',data.jenis_kendala+' \u2014 '+data.project_kapal);}
    else toast('\u274C '+(r.message||'Gagal'));
  });
}

/* ABSENSI INPUT */
var HARI=['Ahad','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
var HARI_S=['Ahad','Sen','Sel','Rab','Kam','Jum','Sab'];
function buildAbsenGrid(){
  var mulai=g('ab_mulai');if(!mulai)return;
  var d=new Date(mulai);
  var dates=HARI.map(function(_,i){var dd=new Date(d);dd.setDate(d.getDate()+i);return dd.toISOString().split('T')[0];});
  document.getElementById('ab_selesai').value=dates[6];
  var opts=['Hadir','Izin','Alpha','Libur'];
  document.getElementById('ab_body').innerHTML='<tr><td style="font-size:12px;font-weight:700">'+(g('ab_nama')||'\u2014')+'</td>'+
    dates.map(function(dt,i){
      return '<td><select id="ab_d'+i+'">'+opts.map(function(o){return'<option'+(o==='Hadir'?' selected':'')+'>'+o+'</option>';}).join('')+'</select>'+
        '<div style="font-size:9px;color:var(--muted-fg);margin-top:2px">'+dt.slice(5)+'</div></td>';
    }).join('')+'</tr>';
}
function saveAbsensi(){
  var kehadiran={};
  HARI.forEach(function(h,i){var el=document.getElementById('ab_d'+i);kehadiran[h.toLowerCase()]=el?el.value:'Libur';});
  var data={nama:g('ab_nama'),posisi:g('ab_pos'),minggu_mulai:g('ab_mulai'),minggu_selesai:g('ab_selesai')};
  Object.assign(data,kehadiran);
  if(!data.nama){toast('\u26A0\uFE0F Isi nama anggota');return;}
  toast('\u23F3 Menyimpan...');
  gasPost('add','absensi',data,'',function(r){
    if(r.status==='success'){toast('\u2705 Absensi tersimpan');logAct('create','Input Absensi',data.nama+' \u2014 '+data.minggu_mulai);}
    else toast('\u274C '+(r.message||'Gagal'));
  });
}

/* ANGGOTA BARU */
function saveAnggota(){
  var data={nama:g('an_nama'),posisi:g('an_pos'),no_hp:g('an_hp'),no_ktp:g('an_nik'),
    status_aktif:g('an_stat'),
    link_ktp:g('an_lktp')||'-',link_idcard:g('an_lid')||'-',
    link_qr:g('an_lqr')||'-',link_bpjs:g('an_lbpjs')||'-'};
  if(!data.nama){toast('\u26A0\uFE0F Isi nama anggota');return;}
  toast('\u23F3 Menyimpan...');
  gasPost('add','data_anggota',data,'',function(r){
    if(r.status==='success'){toast('\u2705 Anggota tersimpan');logAct('create','Anggota Baru',data.nama);}
    else toast('\u274C '+(r.message||'Gagal'));
  });
}

/* PAGE ABSENSI REKAP */
var abData=[];
function loadAbsensi(){
  document.getElementById('ab_list').innerHTML='<div class="loading"><div class="spinner"></div>Memuat...</div>';
  gasGet('absensi',function(r){abData=r.data||[];renderAbsensi();});
}
function renderAbsensi(){
  var q=(document.getElementById('ab_search').value||'').trim().toLowerCase();
  var rows=abData.filter(function(r){return!q||((r.nama||'').toLowerCase().indexOf(q)>-1);});
  document.getElementById('ab_ct').textContent=rows.length+' rekap ditemukan';
  if(!rows.length){document.getElementById('ab_list').innerHTML='<div class="empty"><div class="ei">\uD83D\uDCED</div><p>Belum ada data absensi.</p></div>';return;}
  document.getElementById('ab_list').innerHTML=rows.slice().reverse().map(function(r){
    var days=['ahad','senin','selasa','rabu','kamis','jumat','sabtu'];
    var daysFull=['Ahad','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    var cnt={Hadir:0,Izin:0,Alpha:0,Libur:0};
    var chips=days.map(function(d,i){
      var s=r[d]||'Libur';cnt[s]=(cnt[s]||0)+1;
      var cls=s==='Hadir'?'dc-h':s==='Izin'?'dc-i':s==='Alpha'?'dc-a':'dc-l';
      return '<span class="dchip '+cls+'">'+daysFull[i].slice(0,3)+': '+s+'</span>';
    }).join('');
    return '<div class="ab-rkp">'+
      '<div class="ab-rkp-name">'+(r.nama||'\u2014')+'</div>'+
      '<div class="ab-rkp-week">\uD83D\uDCC5 '+(r.minggu_mulai||'\u2014')+' s/d '+(r.minggu_selesai||'\u2014')+' \u00B7 '+(r.posisi||'\u2014')+'</div>'+
      '<div class="ab-rkp-days">'+chips+'</div>'+
      '<div class="ab-rkp-tot">'+
        '<div class="tot-item"><b>'+(cnt.Hadir||0)+'x</b><span>Hadir</span></div>'+
        '<div class="tot-item"><b>'+(cnt.Izin||0)+'x</b><span>Izin</span></div>'+
        '<div class="tot-item"><b>'+(cnt.Alpha||0)+'x</b><span>Alpha</span></div>'+
        '<div class="tot-item"><b>'+(cnt.Libur||0)+'x</b><span>Libur</span></div>'+
        '<div class="tot-item" style="margin-left:auto;color:var(--primary);font-weight:700"><b>'+(cnt.Hadir||0)+'</b><span>hari masuk</span></div>'+
      '</div>'+
    '</div>';
  }).join('');
}

/* DATA ANGGOTA */
var memData=[];var memF='semua';
function loadAnggota(){
  document.getElementById('mem_list').innerHTML='<div class="loading"><div class="spinner"></div>Memuat...</div>';
  gasGet('data_anggota',function(r){memData=r.data||[];renderAnggota();});
}
function setMF(btn){
  memF=btn.getAttribute('data-f');
  document.querySelectorAll('.f-chip').forEach(function(b){b.classList.remove('on');});
  btn.classList.add('on');renderAnggota();
}
function renderAnggota(){
  var q=(document.getElementById('mem_search').value||'').trim().toLowerCase();
  var rows=memData.filter(function(r){
    return(!q||(r.nama||'').toLowerCase().indexOf(q)>-1)&&(memF==='semua'||r.status_aktif===memF);
  });
  document.getElementById('mem_ct').textContent=rows.length+' anggota ditemukan';
  if(!rows.length){document.getElementById('mem_list').innerHTML='<div class="empty"><div class="ei">\uD83D\uDCED</div><p>Belum ada data anggota.</p></div>';return;}
  document.getElementById('mem_list').innerHTML=rows.map(function(r){
    var init=(r.nama||'?').charAt(0).toUpperCase();
    var bdg=r.status_aktif==='Aktif'?'<span class="bdg bdg-p">Aktif</span>':'<span class="bdg bdg-m">Tidak Aktif</span>';
    var links='';
    if(r.link_ktp&&r.link_ktp!=='-')links+='<a class="mlink" href="'+r.link_ktp+'" target="_blank">KTP</a>';
    if(r.link_idcard&&r.link_idcard!=='-')links+='<a class="mlink" href="'+r.link_idcard+'" target="_blank">ID Card</a>';
    if(r.link_qr&&r.link_qr!=='-')links+='<a class="mlink" href="'+r.link_qr+'" target="_blank">QR</a>';
    if(r.link_bpjs&&r.link_bpjs!=='-')links+='<a class="mlink" href="'+r.link_bpjs+'" target="_blank">BPJS</a>';
    return '<div class="mem-card">'+
      '<div class="mem-av">'+init+'</div>'+
      '<div class="mem-info">'+
        '<div class="mem-name">'+( r.nama||'\u2014')+' '+bdg+'</div>'+
        '<div class="mem-pos">'+(r.posisi||'\u2014')+' \u00B7 '+(r.no_hp||'\u2014')+'</div>'+
        (links?'<div class="mem-links">'+links+'</div>':'')+
      '</div>'+
      '<button class="btn btn-d btn-sm" onclick="delAnggota(\''+r.id+'\')">\uD83D\uDDD1</button>'+
    '</div>';
  }).join('');
}
function delAnggota(id){
  if(!confirm('Hapus data anggota ini? Tindakan tidak dapat dibatalkan.'))return;
  toast('\u23F3 Menghapus...');
  gasPost('delete','data_anggota',{},id,function(r){
    if(r.status==='success'){toast('\uD83D\uDDD1\uFE0F Dihapus');logAct('delete','Hapus Anggota',id);loadAnggota();}
    else toast('\u274C '+(r.message||'Gagal'));
  });
}

/* EXPORT */
var expFmt='pdf';
function selFmt(f){
  expFmt=f;
  document.getElementById('fmt-pdf').classList.toggle('sel',f==='pdf');
  document.getElementById('fmt-xl').classList.toggle('sel',f==='excel');
  document.getElementById('exp_btn').textContent='Export '+(f==='pdf'?'PDF':'Excel');
}
function doExport(){
  var sheet=g('exp_scope');
  var btn=document.getElementById('exp_btn');
  btn.textContent='\u23F3 Memuat data...';btn.disabled=true;
  gasGet(sheet,function(r){
    var rows=r.data||[];
    if(!rows.length){toast('\u26A0\uFE0F Tidak ada data untuk di-export');}
    else{
      if(expFmt==='pdf')expPDF(sheet,rows);
      else expExcel(sheet,rows);
      logAct('export','Export '+expFmt.toUpperCase(),sheet);
      toast('\u2705 '+expFmt.toUpperCase()+' berhasil dibuat');
    }
    btn.textContent='Export '+(expFmt==='pdf'?'PDF':'Excel');btn.disabled=false;
  });
}
function expPDF(title,rows){
  var keys=Object.keys(rows[0]);
  var w=window.open('','_blank');
  var trs=rows.map(function(r){return'<tr>'+keys.map(function(k){return'<td>'+(r[k]||'\u2014')+'</td>';}).join('')+'</tr>';}).join('');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+title+'</title>'+
    '<style>body{font-family:sans-serif;font-size:12px;padding:20px}h2{margin-bottom:8px}'+
    'table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}'+
    'th{background:#f4f4f4;font-weight:700}tr:nth-child(even){background:#fafafa}'+
    'p{font-size:11px;color:#888;margin-bottom:12px}</style></head>'+
    '<body><h2>PT. Sumber Hayati Mandiri \u2014 '+title.replace(/_/g,' ')+'</h2>'+
    '<p>Dicetak: '+new Date().toLocaleString('id-ID')+' | Total: '+rows.length+' data</p>'+
    '<table><thead><tr>'+keys.map(function(k){return'<th>'+k+'</th>';}).join('')+'</tr></thead>'+
    '<tbody>'+trs+'</tbody></table>'+
    '<script>window.onload=function(){window.print();}<\/script></body></html>');
  w.document.close();
}
function expExcel(title,rows){
  /* Gunakan SheetJS untuk output .xlsx sesungguhnya */
  function doXLSX(){
    var ws=XLSX.utils.json_to_sheet(rows);
    var wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,title.slice(0,31));
    XLSX.writeFile(wb,title+'_'+today()+'.xlsx');
  }
  if(typeof XLSX!=='undefined'){doXLSX();return;}
  /* Lazy-load SheetJS jika belum ada */
  var s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload=doXLSX;
  s.onerror=function(){toast('❌ Gagal memuat library Excel. Cek koneksi internet.');};
  document.head.appendChild(s);
}

/* ═══════════════════════════════════════════════════════
   ABSENSI HARIAN — STATE & HELPERS
═══════════════════════════════════════════════════════ */
var ABH = {
  step: 1,
  tgl: '',
  anggotaCache: [],          // [{id,nama,posisi}] diurut A-Z
  kehadiran: {},             // {id: {nama,posisi,status,jam}}
  projects: [],              // ['SPOB. BAHTERA 02', ...]
  assign: {}                 // {projectName: [id, ...]}
};

/* Format tanggal Indonesia untuk output WA */
function abh_fmtTglWA(iso){
  var d=new Date(iso+'T00:00:00');
  var bln=['Januari','Februari','Maret','April','Mei','Juni',
           'Juli','Agustus','September','Oktober','November','Desember'];
  return d.getDate()+' '+bln[d.getMonth()]+' '+d.getFullYear();
}

/* Update visual step indicator */
function abh_updateStepUI(step){
  ABH.step=step;
  for(var i=0;i<4;i++){
    var dot=document.getElementById('sdot-'+i);
    var lbl=document.getElementById('slbl-'+i);
    var line=document.getElementById('sline-'+i);
    if(!dot)continue;
    dot.className='step-dot'+(i<step-1?' done':i===step-1?' active':'');
    lbl.className='step-lbl'+(i===step-1?' active':'');
    if(line)line.className='step-line'+(i<step-1?' done':'');
  }
  /* Tampilkan step yang benar */
  for(var s=1;s<=4;s++){
    var el=document.getElementById('abh-step-'+s);
    if(el)el.className='ab-step'+(s===step?' on':'');
  }
  window.scrollTo(0,0);
}

/* Entry point dari sub-menu */
function openAbsensiHarian(){
  /* Reset state */
  ABH.step=1; ABH.tgl=''; ABH.kehadiran={}; ABH.projects=[]; ABH.assign={};
  showSub('sub-absensi-harian');
  abh_updateStepUI(1);
  /* Set tanggal default hari ini */
  var tglEl=document.getElementById('abh_tgl');
  if(tglEl&&!tglEl.value)tglEl.value=today();
}

/* ── STEP 1 → 2 ── */
function abh_toStep1(){abh_updateStepUI(1);}

function abh_toStep2(){
  var tgl=document.getElementById('abh_tgl').value;
  if(!tgl){toast('⚠️ Pilih tanggal terlebih dahulu');return;}
  ABH.tgl=tgl;
  document.getElementById('abh_tgl_lbl').textContent=
    '📅 '+abh_fmtTglWA(tgl);
  abh_updateStepUI(2);
  abh_loadAnggotaList();
}

function abh_loadAnggotaList(){
  var el=document.getElementById('abh_anggota_list');
  el.innerHTML='<div class="loading"><div class="spinner"></div>Memuat anggota...</div>';
  gasGet('data_anggota',function(r){
    var data=(r.data||[]).filter(function(a){return a.status_aktif==='Aktif';});
    /* Urutkan A-Z berdasarkan nama */
    data.sort(function(a,b){return (a.nama||'').localeCompare(b.nama||'','id');});
    ABH.anggotaCache=data;
    /* Inisialisasi kehadiran default = Masuk */
    data.forEach(function(a){
      if(!ABH.kehadiran[a.id]){
        ABH.kehadiran[a.id]={nama:a.nama,posisi:a.posisi,status:'Masuk',jam:''};
      }
    });
    abh_renderAnggotaList();
  });
}

function abh_renderAnggotaList(){
  var el=document.getElementById('abh_anggota_list');
  if(!ABH.anggotaCache.length){
    el.innerHTML='<div class="empty"><div class="ei">👥</div><p>Belum ada anggota aktif terdaftar.</p></div>';
    return;
  }
  el.innerHTML=ABH.anggotaCache.map(function(a,idx){
    var kh=ABH.kehadiran[a.id]||{status:'Masuk',jam:''};
    var st=kh.status;
    var selCls=st==='Masuk'?'s-masuk':st==='Lembur'?'s-lembur':st==='Setengah Hari'?'s-setengah':'s-libur';
    var showJam=(st==='Setengah Hari')?'show':'';
    return '<div class="an-ab-row" id="abrow-'+idx+'">'+
      '<div class="an-ab-av">'+(a.nama||'?').charAt(0).toUpperCase()+'</div>'+
      '<div style="flex:1;min-width:0">'+
        '<div class="an-ab-name">'+(a.nama||'—')+'</div>'+
        '<div class="an-ab-pos">'+(a.posisi||'—')+'</div>'+
      '</div>'+
      '<div class="an-ab-ctrl">'+
        '<select class="ab-status-sel '+selCls+'" data-id="'+a.id+'" data-idx="'+idx+'" onchange="abh_onStatusChange(this)">'+
          '<option'+(st==='Masuk'?' selected':'')+'>Masuk</option>'+
          '<option'+(st==='Lembur'?' selected':'')+'>Lembur</option>'+
          '<option'+(st==='Setengah Hari'?' selected':'')+'>Setengah Hari</option>'+
          '<option'+(st==='Libur'?' selected':'')+'>Libur</option>'+
        '</select>'+
        '<input type="time" class="ab-jam-inp '+showJam+'" data-id="'+a.id+'" value="'+(kh.jam||'')+'" onchange="abh_onJamChange(this)" placeholder="Jam pulang"/>'+
      '</div>'+
    '</div>';
  }).join('');
}

function abh_onStatusChange(sel){
  var id=sel.getAttribute('data-id');
  var st=sel.value;
  /* Update warna select */
  sel.className='ab-status-sel'+(st==='Masuk'?' s-masuk':st==='Lembur'?' s-lembur':st==='Setengah Hari'?' s-setengah':' s-libur');
  /* Tampilkan / sembunyikan input jam */
  var row=sel.closest('.an-ab-ctrl');
  var jamEl=row.querySelector('.ab-jam-inp');
  if(st==='Setengah Hari'){jamEl.classList.add('show');}
  else{jamEl.classList.remove('show');jamEl.value='';}
  /* Update state */
  if(!ABH.kehadiran[id])ABH.kehadiran[id]={};
  ABH.kehadiran[id].status=st;
  if(st!=='Setengah Hari')ABH.kehadiran[id].jam='';
}

function abh_onJamChange(inp){
  var id=inp.getAttribute('data-id');
  if(!ABH.kehadiran[id])ABH.kehadiran[id]={};
  ABH.kehadiran[id].jam=inp.value;
}

function abh_markAll(status){
  ABH.anggotaCache.forEach(function(a){
    if(!ABH.kehadiran[a.id])ABH.kehadiran[a.id]={nama:a.nama,posisi:a.posisi};
    ABH.kehadiran[a.id].status=status;
    ABH.kehadiran[a.id].jam='';
  });
  abh_renderAnggotaList();
}

/* ── STEP 2 → 3 ── */
function abh_toStep3(){
  /* Validasi: minimal 1 yang masuk/lembur/setengah hari */
  var hadir=ABH.anggotaCache.filter(function(a){
    var s=(ABH.kehadiran[a.id]||{}).status||'Masuk';
    return s!=='Libur';
  });
  if(!hadir.length){toast('⚠️ Tidak ada anggota yang hadir');return;}
  abh_updateStepUI(3);
  abh_renderProjList();
}

function abh_toStep2_from3(){abh_updateStepUI(2);abh_renderAnggotaList();}

/* Tambah project baru */
function abh_addProject(){
  var inp=document.getElementById('abh_new_proj');
  var nama=inp.value.trim().toUpperCase();
  if(!nama){toast('⚠️ Isi nama project');return;}
  if(ABH.projects.indexOf(nama)>-1){toast('Project sudah ada');inp.value='';return;}
  ABH.projects.push(nama);
  if(!ABH.assign[nama])ABH.assign[nama]=[];
  inp.value='';
  abh_renderProjList();
}

function abh_renderProjList(){
  var el=document.getElementById('abh_proj_list');
  /* Daftar anggota yang hadir */
  var hadir=ABH.anggotaCache.filter(function(a){
    var s=(ABH.kehadiran[a.id]||{}).status||'Masuk';
    return s!=='Libur';
  });
  if(!ABH.projects.length){
    el.innerHTML='<div class="card" style="margin-bottom:10px"><div class="card-body">'+
      '<div class="empty" style="padding:20px 0"><div class="ei">🏗️</div>'+
      '<p>Tambahkan project di atas,<br>lalu assign anggota ke masing-masing project.</p></div></div></div>';
    return;
  }
  el.innerHTML=ABH.projects.map(function(proj,pi){
    var assigned=ABH.assign[proj]||[];
    var ct=assigned.length;
    return '<div class="proj-assign-row">'+
      '<div class="proj-assign-hdr" onclick="abh_toggleProj('+pi+')">'+
        '<div>'+
          '<div class="proj-assign-name">'+proj+'</div>'+
          '<div class="proj-assign-ct" id="proj-ct-'+pi+'">'+ct+' anggota dipilih</div>'+
        '</div>'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<button class="btn btn-d btn-sm" onclick="event.stopPropagation();abh_removeProject(\''+proj+'\')">✕</button>'+
          '<span style="color:var(--muted-fg);font-size:18px" id="proj-arr-'+pi+'">›</span>'+
        '</div>'+
      '</div>'+
      '<div class="proj-assign-body" id="proj-body-'+pi+'">'+
        hadir.map(function(a){
          var checked=assigned.indexOf(a.id)>-1;
          var st=ABH.kehadiran[a.id].status;
          var stCls=st==='Lembur'?'as-lembur':st==='Setengah Hari'?'as-setengah':'as-masuk';
          return '<label class="assign-member">'+
            '<input type="checkbox" class="assign-cb"'+(checked?' checked':'')+
              ' onchange="abh_toggleAssign(this,\''+proj+'\',\''+a.id+'\','+pi+')"/>'+
            '<span class="assign-name">'+(a.nama||'—')+'</span>'+
            '<span class="assign-status '+stCls+'">'+st+'</span>'+
          '</label>';
        }).join('')+
        '<div style="padding:8px 4px;display:flex;gap:6px">'+
          '<button class="btn btn-sm btn-o" onclick="abh_selectAll(\''+proj+'\','+pi+')">Pilih Semua</button>'+
          '<button class="btn btn-sm btn-g" onclick="abh_clearAll(\''+proj+'\','+pi+')">Hapus Semua</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
}

function abh_toggleProj(pi){
  var body=document.getElementById('proj-body-'+pi);
  var arr=document.getElementById('proj-arr-'+pi);
  var open=body.classList.toggle('open');
  if(arr)arr.textContent=open?'⌄':'›';
}

function abh_toggleAssign(cb,proj,id,pi){
  if(!ABH.assign[proj])ABH.assign[proj]=[];
  if(cb.checked){
    if(ABH.assign[proj].indexOf(id)<0)ABH.assign[proj].push(id);
  } else {
    ABH.assign[proj]=ABH.assign[proj].filter(function(x){return x!==id;});
  }
  var ct=document.getElementById('proj-ct-'+pi);
  if(ct)ct.textContent=ABH.assign[proj].length+' anggota dipilih';
}

function abh_selectAll(proj,pi){
  var hadir=ABH.anggotaCache.filter(function(a){
    return (ABH.kehadiran[a.id]||{}).status!=='Libur';
  });
  ABH.assign[proj]=hadir.map(function(a){return a.id;});
  abh_renderProjList();
  /* Buka accordion setelah render ulang */
  setTimeout(function(){abh_toggleProj(pi);},50);
}

function abh_clearAll(proj,pi){
  ABH.assign[proj]=[];
  abh_renderProjList();
  setTimeout(function(){abh_toggleProj(pi);},50);
}

function abh_removeProject(proj){
  ABH.projects=ABH.projects.filter(function(p){return p!==proj;});
  delete ABH.assign[proj];
  abh_renderProjList();
}

/* ── STEP 3 → 4 ── */
function abh_toStep4(){
  /* Validasi: minimal 1 project dengan anggota */
  var ok=ABH.projects.some(function(p){return (ABH.assign[p]||[]).length>0;});
  if(!ABH.projects.length){toast('⚠️ Tambahkan minimal 1 project');return;}
  if(!ok){toast('⚠️ Pilih minimal 1 anggota untuk project');return;}
  abh_updateStepUI(4);
  abh_buildOutput();
}

/* ── BANGUN OUTPUT WA ── */
function abh_buildOutput(){
  /* Helper: ambil nama dari id */
  function namaById(id){
    var a=ABH.anggotaCache.find(function(x){return x.id===id;});
    return a?a.nama:id;
  }

  /* === OUTPUT 1: List Manpower per Project === */
  var tglFmt=abh_fmtTglWA(ABH.tgl);
  var lines1=[];
  lines1.push('*_UPDATE LIST MANPOWER_*');
  lines1.push('_*PT. SUMBER HAYATI MANDIRI*_');
  lines1.push('');

  ABH.projects.forEach(function(proj){
    var ids=ABH.assign[proj]||[];
    if(!ids.length)return;
    /* Urutkan nama A-Z */
    var namaList=ids.map(function(id){return namaById(id);});
    namaList.sort(function(a,b){return a.localeCompare(b,'id');});
    lines1.push('\u2022 _*'+proj+'*_');
    namaList.forEach(function(nm,i){
      lines1.push((i+1)+'. '+nm);
    });
    lines1.push('');
  });

  document.getElementById('abh_out_list').textContent=lines1.join('\n').trimEnd();

  /* === OUTPUT 2: Rekap Jumlah Manpower === */
  var total=0;
  var lines2=[];
  lines2.push('*PT. SUMBER HAYATI MANDIRI*');
  lines2.push('Tanggal: *'+tglFmt+'*');
  lines2.push('Project:');
  lines2.push('');

  ABH.projects.forEach(function(proj){
    var ct=(ABH.assign[proj]||[]).length;
    if(!ct)return;
    total+=ct;
    lines2.push('- '+proj);
    lines2.push(' *'+ct+'* Manpower');
    lines2.push('');
  });

  lines2.push('Total Manpower yg Masuk *'+total+' Orang*');

  document.getElementById('abh_out_rekap').textContent=lines2.join('\n').trimEnd();
}

/* ── COPY ── */
function abh_copyList(){
  var txt=document.getElementById('abh_out_list').textContent;
  navigator.clipboard.writeText(txt).then(function(){toast('✅ List Manpower disalin');});
}
function abh_copyRekap(){
  var txt=document.getElementById('abh_out_rekap').textContent;
  navigator.clipboard.writeText(txt).then(function(){toast('✅ Rekap Jumlah disalin');});
}

/* ── SIMPAN KE SPREADSHEET ── */
function abh_saveAll(){
  var rows=[];
  ABH.projects.forEach(function(proj){
    var ids=ABH.assign[proj]||[];
    ids.forEach(function(id){
      var kh=ABH.kehadiran[id]||{};
      rows.push({
        tanggal:ABH.tgl,
        nama:kh.nama||id,
        posisi:kh.posisi||'—',
        status:kh.status||'Masuk',
        jam_pulang:kh.jam||'-',
        project:proj
      });
    });
  });
  /* Anggota Libur (tidak diassign ke manapun) */
  ABH.anggotaCache.forEach(function(a){
    var kh=ABH.kehadiran[a.id]||{};
    if(kh.status==='Libur'){
      rows.push({tanggal:ABH.tgl,nama:a.nama,posisi:a.posisi||'—',
        status:'Libur',jam_pulang:'-',project:'-'});
    }
  });
  if(!rows.length){toast('⚠️ Tidak ada data untuk disimpan');return;}
  toast('⏳ Menyimpan...');
  var saved=0;
  rows.forEach(function(row){
    gasPost('add','absensi_harian',row,'',function(r){
      saved++;
      if(saved===rows.length){
        if(r.status==='success'||saved>0){
          toast('✅ '+rows.length+' data absensi tersimpan');
          logAct('create','Absensi Harian',abh_fmtTglWA(ABH.tgl)+' — '+rows.length+' anggota');
        } else {
          toast('❌ '+(r.message||'Gagal menyimpan'));
        }
      }
    });
  });
}

/* ACTIVITY LOG */
var ACT_ICO={create:'\u270F\uFE0F',update:'\uD83D\uDD04',delete:'\uD83D\uDDD1\uFE0F',export:'\uD83D\uDCE4',login:'\uD83D\uDD10'};
var ACT_CLS={create:'ad-c',update:'ad-u',delete:'ad-x',export:'ad-e',login:'ad-l'};
function loadActLog(){
  var logs=[];
  try{logs=JSON.parse(localStorage.getItem('shm_logs')||'[]');}catch(e){}
  var el=document.getElementById('act_log');
  if(!logs.length){el.innerHTML='<div class="empty"><div class="ei">\uD83D\uDCCB</div><p>Belum ada aktivitas tercatat.</p></div>';return;}
  var groups={};
  logs.forEach(function(l){
    var day=new Date(l.ts).toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long'});
    if(!groups[day])groups[day]=[];
    groups[day].push(l);
  });
  el.innerHTML=Object.keys(groups).map(function(day){
    return '<div class="act-day">'+day+'</div>'+
      '<div class="act-tl"><ul class="act-list">'+
      groups[day].map(function(a){
        return '<li class="act-item">'+
          '<span class="act-dot '+(ACT_CLS[a.type]||'ad-l')+'">'+(ACT_ICO[a.type]||'\uD83D\uDCCC')+'</span>'+
          '<div class="act-card">'+
            '<div class="act-top"><div class="act-ttl">'+a.title+'</div><div class="act-time">'+fmtTs(a.ts)+'</div></div>'+
            '<div class="act-desc">'+a.desc+'</div>'+
          '</div></li>';
      }).join('')+
      '</ul></div>';
  }).join('');
}
