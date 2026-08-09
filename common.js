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

var GAS='https://script.google.com/macros/s/AKfycbyxCw9WY7Euwr__z5Lws7hhi9TaaDCHVj6CcnjzjY_jtOgDbhIUWtilfNsvxQHBYYnzNA/exec';

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

/* MATERIAL */
function prevMaterial(){
  var d={tgl:g('m_tgl')||today(),proj:g('m_proj'),kat:g('m_kat'),kode:g('m_kode'),
    nama:g('m_nama'),qty:g('m_qty'),sat:g('m_sat'),val:g('m_val'),
    ukur:g('m_ukur')||'-',mark:g('m_mark')||'-'};
  document.getElementById('m_prev').textContent=
    '\uD83D\uDCE6 REQUEST MATERIAL \u2014 PT. SHM\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+
    'Tanggal   : '+d.tgl+'\nProject   : '+d.proj+'\nKategori  : '+d.kat+'\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'+
    'Kode      : '+d.kode+'\nMaterial  : '+d.nama+'\nJumlah    : '+d.qty+' '+d.sat+
    '\nValuation : '+d.val+'\nUkuran    : '+d.ukur+'\nMark      : '+d.mark+'\n'+
    '\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501';
  document.getElementById('m_prev_card').style.display='block';
}
function saveMaterial(){
  var data={tanggal:g('m_tgl')||today(),project_kapal:g('m_proj'),kode_material:g('m_kode'),
    nama_material:g('m_nama'),jumlah:g('m_qty'),satuan:g('m_sat'),valuation:g('m_val'),
    ukuran:g('m_ukur')||'-',mark:g('m_mark')||'-',kategori:g('m_kat')};
  if(!data.project_kapal||!data.nama_material||!data.jumlah){toast('\u26A0\uFE0F Lengkapi field wajib');return;}
  toast('\u23F3 Menyimpan...');
  gasPost('add','request_material',data,'',function(r){
    if(r.status==='success'){toast('\u2705 Request material tersimpan');logAct('create','Request Material',data.nama_material+' \u2014 '+data.project_kapal);}
    else toast('\u274C '+(r.message||'Gagal'));
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
