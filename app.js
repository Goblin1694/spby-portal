import {API} from './config.js';
const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('id-ID');
const labels={nama:'Nama pegawai',spby:'Pengajuan SPBY',kegiatan:'Kegiatan',kode:'Kode kegiatan',user:'Pengguna',spby_checklist:'Checklist',spby_display:'Display'};
const chartLabels={nama:'Pegawai',spby:'SPBY',kegiatan:'Kegiatan',kode:'Kode',user:'Pengguna',spby_checklist:'Checklist',spby_display:'Display'};
const titles={dashboard:['Ringkasan dokumen','Semua yang perlu Anda pantau, dalam satu tampilan.'],documents:['Seluruh dokumen','Telusuri pengajuan dan kelola bukti serah terima.'],ppk:['Pengalihan PPK','Pilih dokumen untuk mencatat penyerahan kepada PPK.'],bendahara:['Pengalihan bendahara','Lanjutkan penyerahan setelah pengalihan PPK selesai.'],media:['Arsip media','Bukti dan lampiran dalam penyimpanan privat.']};
const S={admin:false,owner:false,token:sessionStorage.getItem('spby.portal.session')||'',view:'dashboard',page:1,source:'spby',q:'',overview:null,syncing:false,mediaBusy:false,mediaUrl:null,active:null,stopped:false};
const messages={INVALID_EXPORT_FILTER:'Periksa ID dokumen, rentang tanggal, atau tahun yang dipilih.',ZIP_TOO_LARGE:'Arsip terlalu besar untuk satu berkas ZIP.',INVALID_DELEGATE:'Masukkan username SPBY tambahan yang valid.',SOURCE_EDIT_REQUIRED:'Akun SPBY ini tidak memiliki aksi Edit untuk dokumen tersebut.',OWNER_ACCESS_REQUIRED:'Buka daftar Pengajuan SPBY untuk melihat bukti dan pengalihan dokumen yang Anda akses.',SOURCE_ACCESS_UNVERIFIED:'Sumber resmi belum memberikan akses yang dapat diverifikasi untuk menu ini.',SOURCE_LOGIN_TIMEOUT:'Situs SPBY resmi belum merespons verifikasi akun. Silakan coba masuk kembali.',STORAGE_INITIALIZING:'Penyimpanan bukti masih dalam pemulihan. Anda tetap bisa membuka menu Media dan menghubungkan akun Google.',LOCATION_REQUIRED:'Lokasi perangkat wajib dilengkapi.',EVIDENCE_REQUIRED:'Bukti belum lengkap. Unggah file lalu konfirmasi kembali.',FREE_DAILY_WRITE_LIMIT:'Kuota tulis D1 habis. Sinkronisasi dan penyimpanan D1 menunggu reset pukul 07.00 WIB berikutnya. Menu Media dan otorisasi Google tetap bisa dibuka.',UNAUTHORIZED:'Sesi Anda telah berakhir. Silakan masuk kembali.',LOGIN_DENIED:'Username atau password tidak sesuai.',LOGIN_RATE_LIMIT:'Terlalu banyak percobaan. Coba kembali dalam 15 menit.',MEDIA_FILE_TOO_LARGE:'Bukti melebihi batas gratis 32 MB per file.',MEDIA_FREE_QUOTA_FULL:'Penyimpanan gratis penuh. Tidak ada biaya atau peningkatan paket otomatis.',INVALID_RANGE:'Bagian berkas yang diminta tidak valid.',STORAGE_NOT_ENABLED:'Penyimpanan media privat belum diaktifkan.',SOURCE_SYNC_FAILED:'Koneksi sumber sedang terganggu. Data terakhir tetap tersedia.',SOURCE_HTTP_403:'Sumber menolak koneksi. Sinkronisasi akan dicoba kembali.',SERVER_ERROR:'Layanan belum dapat memproses permintaan. Silakan coba kembali.',PPK_REQUIRED:'Selesaikan pengalihan PPK terlebih dahulu.',HANDOVER_CONFLICT:'Pengalihan sudah tercatat atau sedang diproses.',SOURCE_CHANGED_RETRY:'Sumber berubah saat dibaca. Pengambilan data diulang dengan aman.',DUPLICATE_SOURCE_RETRY:'Halaman sumber berubah. Pengambilan data diulang.',MEDIA_NOT_FOUND:'Bukti belum tersedia.',INVALID_HANDOVER:'Periksa tanggal, jenis, dan ukuran file bukti.'};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;}
function friendly(error){return messages[error?.message]||'Koneksi belum berhasil. Silakan coba kembali.';}
function notice(message){$('alert').textContent=message;$('alert').hidden=!message;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4000);}
function clearSession(){$('mediaExportPanel').hidden=true;$('mediaExportStatus').textContent='';$('delegatePanel').hidden=true;$('delegateList').replaceChildren();$('delegateStatus').textContent='';S.admin=false;S.owner=false;S.overview=null;S.stopped=true;S.token='';sessionStorage.removeItem('spby.portal.session');$('app').hidden=true;$('loginBackdrop').hidden=false;$('tableBody').replaceChildren();$('sourceChart').replaceChildren();$('sourceStatus').replaceChildren();if(S.mediaUrl)URL.revokeObjectURL(S.mediaUrl);for(const d of document.querySelectorAll('dialog[open]'))d.close();$('loginDialog').showModal();}
async function request(path,options={}){const sessionToken=S.token;const headers=new Headers(options.headers);if(sessionToken)headers.set('Authorization','Bearer '+sessionToken);if(options.json!==undefined){headers.set('Content-Type','application/json');options.body=JSON.stringify(options.json);}let r;try{r=await fetch(API+path,{method:options.method||'GET',headers,body:options.body,cache:'no-store',credentials:'omit',signal:options.signal});}catch(e){if(options.signal?.aborted)throw new Error('SOURCE_LOGIN_TIMEOUT');throw e;}if(!r.ok){let code='SERVER_ERROR';try{code=(await r.json()).error||code;}catch{}if(r.status===401&&path!=='/auth/login'&&S.token===sessionToken)clearSession();throw new Error(code);}const payload=await (options.blob?r.blob():r.json());if(S.token!==sessionToken)throw new Error('SESSION_CHANGED');return payload;}
function dateTime(s){if(!s)return 'Belum ada siklus selesai';return new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(s))+' WIB';}
async function refreshOverview(){const o=await request('/overview');const previousReady=S.overview?.mediaStorageReady;const previousUpdate=S.overview?.sources.find(s=>s.name===S.source)?.updated;S.overview=o;$('statDocuments').textContent=fmt(o.totalDocuments);$('statSources').textContent=fmt(o.sources.length);const media=Object.fromEntries(o.media.map(m=>[m.status,m.n]));$('statStored').textContent=fmt(media.STORED);$('statPending').textContent=fmt((media.PENDING||0)+(media.ERROR||0));$('lastSync').textContent=dateTime(o.lastComplete);const running=!!o.job;$('syncTitle').textContent=o.error?'Mencoba kembali':running?'Sinkronisasi berjalan':o.lastComplete?'Data tersinkron':S.admin?'Menyiapkan data':'Sesi SPBY resmi aktif';$('syncDescription').textContent=o.error?friendly({message:o.error}):running?(labels[o.job.source]||o.job.source)+' · '+fmt(o.job.read)+(o.job.total!==null?' dari '+fmt(o.job.total):'')+' record':o.lastComplete?'Seluruh menu sumber telah selesai divalidasi.':S.admin?'Data sedang diambil dari SPBY resmi.':'Dokumen dibaca dari SPBY dengan hak akses akun Anda.';$('connectionBadge').replaceChildren(el('i'),document.createTextNode(running?'Menyinkronkan':'Terhubung'));
 const chart=$('sourceChart'),status=$('sourceStatus');chart.replaceChildren();status.replaceChildren();const max=Math.max(1,...o.sources.map(s=>s.total||0));for(const s of o.sources){const c=el('div',undefined,'chart-column'),bar=el('div',undefined,'chart-bar');bar.style.setProperty('--height',Math.max(2,(s.total||0)/max*75)+'%');c.append(el('strong',fmt(s.total)),bar,el('span',chartLabels[s.name]||s.name));chart.append(c);const row=el('div',undefined,'source-item'),label=el('span');label.append(el('i'),document.createTextNode(labels[s.name]||s.name));row.append(label,el('b',fmt(s.total)+' · '+(s.status==='SUCCESS'?'Selesai':'Menunggu')));status.append(row);}
 const select=$('sourceSelect');select.replaceChildren(...o.sources.map(s=>{const opt=el('option',labels[s.name]||s.name);opt.value=s.name;return opt;}));if(!o.sources.length){const opt=el('option','Pengajuan SPBY');opt.value='spby';select.append(opt);}select.value=S.source;$('mediaReadiness').textContent=o.mediaStorageReady?(o.mediaStorage?'Penyimpanan privat gratis · '+(o.mediaStorage.used/1048576).toFixed(1)+' dari '+Math.round(o.mediaStorage.capacity/1048576)+' MB. Maksimal 32 MB per file. Tidak ada langganan atau peningkatan otomatis.'+(o.mediaError?' '+friendly({message:o.mediaError}):''):'Penyimpanan privat aktif. Arsip yang selesai disimpan dapat dibuka dari setiap dokumen.'):(o.writeUnavailableReason?messages[o.writeUnavailableReason]:'Penyimpanan privat belum aktif. Indeks lampiran sudah didata.');if(previousUpdate&&(previousUpdate!==o.sources.find(s=>s.name===S.source)?.updated||previousReady!==o.mediaStorageReady)&&['documents','ppk','bendahara'].includes(S.view))await loadRecords();if(S.admin&&o.writeUnavailableReason)notice(messages[o.writeUnavailableReason]);if(S.active&&!S.active.busy)$('handoverSave').disabled=!o.mediaStorageReady;return o;}
function button(text,action,disabled=false){const b=el('button',text);b.type='button';b.disabled=disabled;b.addEventListener('click',action);return b;}
async function loadRecords(){const params=new URLSearchParams({source:S.source,page:String(S.page),q:S.q});const data=await request('/records?'+params);$('resultCount').textContent=fmt(data.total)+' record · '+(labels[S.source]||S.source);$('tableTitle').textContent=S.view==='ppk'?'Dokumen untuk PPK':S.view==='bendahara'?'Dokumen untuk bendahara':labels[S.source]||'Daftar dokumen';const head=$('tableHead'),body=$('tableBody');head.replaceChildren();body.replaceChildren();const documents=S.source==='spby'||S.source==='spby_checklist'||S.source==='spby_display';let cols;if(documents)cols=['ID / No. SPBY','Penerima / uraian','Tanggal','Nilai',...(S.source==='spby_checklist'?['Kuitansi','Pajak']:['Verifikator']),'Hasil Checklist','PPK','Bendahara','Aksi'];else cols=['ID',...new Set(data.rows.flatMap(r=>Object.keys(r.fields).filter(k=>!/^id(?:\s|$)/i.test(k)&&k!=='_links')))].slice(0,7);const tr=el('tr');cols.forEach(c=>tr.append(el('th',c)));head.append(tr);if(!data.rows.length){const empty=el('td','Belum ada data yang cocok. Sinkronisasi akan mengisi tabel secara otomatis.');empty.colSpan=cols.length;const row=el('tr');row.append(empty);body.append(row);}for(const row of data.rows){const f=row.fields,tr=el('tr');if(documents){const id=el('td');id.append(el('strong',f['No. SPBY']||'SPBY #'+row.id),el('span','ID '+row.id,'muted'));const desc=el('td');desc.append(el('strong',f.Penerima||f.Account||'Dokumen SPBY'),el('span',f.Untuk||'—','description'));tr.append(id,desc,el('td',f['Tgl. Aju']||'—'),el('td',f['(Rp)']||'—'));for(const key of (S.source==='spby_checklist'?['Kuitansi','Pajak','Hasil Checklist']:['Verifikator','Hasil Checklist'])){const cell=el('td',f[key]||'Belum diisi di sumber');cell.className='verification-cell';tr.append(cell);}for(const v of [row.ppk,row.bendahara]){const cell=el('td');cell.append(el('span',(S.admin||row.canViewEvidence)?(v?'Tercatat':'Belum'):'Terbatas',v?'pill done':'pill'));tr.append(cell);}const actions=el('td'),wrap=el('div',undefined,'table-actions');if(!S.admin){for(const action of row.officialActions||[]){const link=el('a',action.kind==='edit'?'Edit di SPBY resmi':'Lihat di SPBY resmi','secondary');link.href=action.url;link.target='_blank';link.rel='noopener noreferrer';wrap.append(link);}if(!wrap.childNodes.length)wrap.append(el('small','Aksi mengikuti akses SPBY resmi','muted'));}if(S.admin||row.canViewEvidence)wrap.append(button('Lihat bukti',()=>openMedia(row.id,data.page)));if((S.admin||row.canHandover)&&S.source==='spby'){wrap.append(button(row.ppk?'PPK tercatat':'Alihkan ke PPK',()=>openHandover(row.id,'ppk',data.page),row.ppk),button(row.bendahara?'Bendahara tercatat':'Alihkan ke Bendahara',()=>openHandover(row.id,'bendahara',data.page),row.bendahara||!row.ppk));}if((S.admin||row.canHandover)&&S.source==='spby'&&!row.ppk){const hint=el('small',S.overview?.writeUnavailableReason?messages[S.overview.writeUnavailableReason]:'Bendahara tersedia setelah PPK tercatat.','handover-hint');wrap.append(hint);}actions.append(wrap);tr.append(actions);}else{tr.append(el('td',row.id));for(const key of cols.slice(1))tr.append(el('td',f[key]||'—'));}body.append(tr);}$('pageLabel').textContent='Halaman '+data.page+' dari '+Math.max(1,Math.ceil(data.total/25));$('prev').disabled=S.page<=1;$('next').disabled=S.page*25>=data.total;}
async function navigate(view){if(!titles[view])view='dashboard';S.view=view;document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$('dashboardView').hidden=view!=='dashboard';$('documentsView').hidden=!['documents','ppk','bendahara'].includes(view);$('mediaView').hidden=view!=='media';$('pageTitle').textContent=titles[view][0];$('pageSubtitle').textContent=titles[view][1];$('breadcrumb').textContent=({dashboard:'RINGKASAN',documents:'DOKUMEN',ppk:'PPK',bendahara:'BENDAHARA',media:'MEDIA'})[view];notice('');if(view==='media'){if(S.owner)await Promise.all([refreshGoogleAuthorization(),refreshDelegates()]);else $('googleAuthorizationStatus').textContent=S.admin?'Sambungan Google dikelola pemilik akun.':'Buka daftar Pengajuan SPBY untuk melihat bukti dokumen yang dapat Anda akses.';}if(['ppk','bendahara'].includes(view)){S.source='spby';S.page=1;$('sourceSelect').value='spby';}if(['documents','ppk','bendahara'].includes(view))try{await loadRecords();}catch(e){notice(friendly(e));}}
async function pumpSync(){if(!S.admin||S.syncing||!S.token)return;S.syncing=true;S.stopped=false;$('syncNow').disabled=true;try{for(let i=0;i<130&&!S.stopped&&S.token;i++){const result=await request('/sync/step',{method:'POST'});await refreshOverview();if(result.status==='COMPLETED')break;await new Promise(r=>setTimeout(r,result.status==='BUSY'?2500:600));}if(['documents','ppk','bendahara'].includes(S.view))await loadRecords();}catch(e){notice(friendly(e));}finally{S.syncing=false;$('syncNow').disabled=false;}}
async function mediaPump(){if(!S.admin||!S.token||S.mediaBusy||!S.overview?.mediaStorageReady)return;S.mediaBusy=true;try{for(let i=0;i<5;i++){const out=await request('/media/step',{method:'POST'});if(['IDLE','BUSY','STORAGE_NOT_ENABLED','MEDIA_FREE_QUOTA_FULL'].includes(out.status))break;}await refreshOverview();}catch{}finally{S.mediaBusy=false;}}
async function enter(username,admin,owner){S.admin=admin===true;$('mediaExportPanel').hidden=!S.admin;S.owner=owner===true;$('delegatePanel').hidden=!S.owner;$('syncNow').hidden=!S.admin;$('googleAuthorize').hidden=!S.owner;$('query').placeholder=S.admin?'Cari dokumen…':'Cari di halaman ini…';$('loginDialog').close();$('loginBackdrop').hidden=true;$('app').hidden=false;$('accountName').textContent=username;S.stopped=false;notice('');void navigate(new URLSearchParams(location.search).has('google')?'media':'dashboard');void refreshOverview().then(()=>pumpSync()).catch(e=>notice(friendly(e)));}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginSubmit').disabled=true;$('loginSubmit').textContent='Memverifikasi akun…';$('loginError').hidden=true;try{const out=await request('/auth/login',{method:'POST',signal:AbortSignal.timeout(20000),json:{username:$('username').value.trim(),password:$('password').value}});S.token=out.token;sessionStorage.setItem('spby.portal.session',S.token);$('password').value='';await enter(out.username,out.admin,out.owner);}catch(e){$('loginError').textContent=friendly(e);$('loginError').hidden=false;}finally{$('loginSubmit').disabled=false;$('loginSubmit').replaceChildren(document.createTextNode('Masuk ke dashboard '),el('span','→'));}});
$('showPassword').addEventListener('click',()=>{const hidden=$('password').type==='password';$('password').type=hidden?'text':'password';$('showPassword').textContent=hidden?'Sembunyi':'Lihat';});
async function logout(){try{await request('/auth/logout',{method:'POST'});}finally{clearSession();}}
$('logout').onclick=$('mobileLogout').onclick=logout;document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));$('syncNow').onclick=()=>pumpSync();$('refresh').onclick=async()=>{try{await refreshOverview();if(['documents','ppk','bendahara'].includes(S.view))await loadRecords();toast('Data diperbarui.');}catch(e){notice(friendly(e));}};
document.querySelectorAll('[data-source-jump]').forEach(b=>b.addEventListener('click',()=>{S.source=b.dataset.sourceJump;S.page=1;$('sourceSelect').value=S.source;navigate('documents');}));
let searchTimer;$('query').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{S.q=$('query').value;S.page=1;loadRecords().catch(e=>notice(friendly(e)));},400);});$('sourceSelect').onchange=()=>{S.source=$('sourceSelect').value;S.page=1;loadRecords().catch(e=>notice(friendly(e)));};$('prev').onclick=()=>{S.page--;loadRecords().catch(e=>notice(friendly(e)));};$('next').onclick=()=>{S.page++;loadRecords().catch(e=>notice(friendly(e)));};
function uploadTime(value){return value?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'medium',timeZone:'Asia/Jakarta'}).format(new Date(value))+' WIB':'Waktu belum tersedia';}
async function openMedia(id,page){
 $('mediaFiles').replaceChildren(el('p','Memuat arsip privat…','muted'));$('mediaPreview').replaceChildren();$('mediaDialog').showModal();
 try{const result=await request('/media/list?'+new URLSearchParams({source:S.source,id,page:String(page)}));$('mediaFiles').replaceChildren();
  function appendFile(parent,f){const row=el('div',undefined,'media-file'),name=el('div',f.filename);name.append(el('small',f.status==='STORED'?'Diunggah '+uploadTime(f.created):f.status==='ERROR'?'Arsip memerlukan pemeriksaan':'Menunggu pengarsipan'));const btn=button('Buka',async()=>{btn.disabled=true;try{const blob=await request('/media/'+f.id+'?'+new URLSearchParams({recordId:id,page:String(page)}),{blob:true});if(S.mediaUrl)URL.revokeObjectURL(S.mediaUrl);S.mediaUrl=URL.createObjectURL(blob);const wrapper=el('div');if((f.mime||'').startsWith('image/')){const img=el('img');img.alt='Bukti dokumen';img.src=S.mediaUrl;wrapper.append(img);}else if((f.mime||'').startsWith('video/')){const video=el('video');video.controls=true;video.src=S.mediaUrl;wrapper.append(video);}const download=el('a','Unduh berkas');download.href=S.mediaUrl;download.download=f.filename;download.className='secondary';wrapper.append(download);$('mediaPreview').replaceChildren(wrapper);}catch(e){$('mediaPreview').replaceChildren(el('p',friendly(e),'error'));}finally{btn.disabled=false;}},f.status!=='STORED');btn.className='secondary';row.append(name,btn);parent.append(row);}
  for(const kind of ['ppk','bendahara']){const group=(result.handovers||[]).find(g=>g.kind===kind),section=el('section',undefined,'evidence-group');section.append(el('h3',kind==='ppk'?'Bukti pengalihan ke PPK':'Bukti pengalihan ke Bendahara'));if(!group)section.append(el('p','Belum ada pengalihan tercatat.','muted'));else{section.append(el('p','Dikonfirmasi '+uploadTime(group.created),'muted'));if(group.notes)section.append(el('p',group.notes,'evidence-notes'));if(group.location){const location=group.location,a=el('a','Buka lokasi Maps ↗');a.href='https://www.google.com/maps?q='+encodeURIComponent(location.latitude+','+location.longitude);a.target='_blank';a.rel='noopener noreferrer';a.className='map-link';section.append(a,el('small','Akurasi perangkat ±'+Math.round(location.accuracy)+' m','muted'));}else section.append(el('p','Lokasi tidak tersedia pada bukti lama.','muted'));group.files.forEach(f=>appendFile(section,f));}$('mediaFiles').append(section);}
  if(result.files.length){const source=el('section',undefined,'evidence-group');source.append(el('h3','Lampiran situs resmi'));result.files.forEach(f=>appendFile(source,f));$('mediaFiles').append(source);}
 }catch(e){$('mediaFiles').replaceChildren(el('p',friendly(e),'error'));}
}
$('mediaDialog').addEventListener('close',()=>{if(S.mediaUrl)URL.revokeObjectURL(S.mediaUrl);S.mediaUrl=null;$('mediaPreview').replaceChildren();});
function handoverError(message){$('handoverError').textContent=message;$('handoverError').hidden=!message;}
function closeHandover(){if(S.active?.busy)return;S.active=null;$('handoverDialog').close();}
function renderSelected(){const box=$('selectedFiles');box.replaceChildren();for(const entry of S.active?.files||[]){const row=el('div',undefined,'selected-file'),copy=el('div',entry.file.name);copy.append(el('small',(entry.file.size/1048576).toFixed(2)+' MB'+(entry.error?' · '+entry.error:'')));const remove=button('Hapus',()=>{S.active.files=S.active.files.filter(f=>f.key!==entry.key);renderSelected();});remove.className='text-button';remove.disabled=!!S.active.started;row.append(copy,remove);box.append(row);}$('selectedCount').textContent=(S.active?.files.length||0)+' file dipilih · tidak ada batas jumlah file';}
function openHandover(id,kind,page){$('handoverFile').disabled=false;S.active={id,kind,page,requestId:crypto.randomUUID(),files:[],location:null,busy:false};$('handoverTitle').textContent=kind==='ppk'?'Alihkan ke PPK':'Alihkan ke Bendahara';$('handoverRecord').textContent='Dokumen SPBY #'+id;$('handoverForm').reset();$('handoverDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('handoverConfirm').hidden=true;$('uploadProgress').hidden=true;$('locationStatus').textContent='Lokasi belum diambil. Izinkan akses lokasi untuk melengkapi bukti.';$('handoverSave').textContent='Confirm';$('handoverSave').disabled=!S.overview?.mediaStorageReady;handoverError(S.overview?.writeUnavailableReason?messages[S.overview.writeUnavailableReason]:'');renderSelected();$('handoverDialog').showModal();}
$('handoverDialog').addEventListener('cancel',e=>{if(S.active?.busy)e.preventDefault();});
$('handoverDialog').addEventListener('close',()=>{if(!S.active?.busy)S.active=null;});
$('closeHandover').onclick=closeHandover;
const uploadTypes=['image/jpeg','image/png','image/webp','image/gif','image/avif','image/heic','image/heif','video/mp4','video/webm','video/quicktime','video/mpeg','video/x-matroska','video/3gpp','video/ogg'];
$('handoverFile').addEventListener('change',()=>{if(!S.active)return;for(const file of $('handoverFile').files){if(S.active.files.some(e=>e.file.name===file.name&&e.file.size===file.size&&e.file.lastModified===file.lastModified))continue;const error=file.size>32*1024*1024?'Melebihi 32 MB':!uploadTypes.includes(file.type)?'Format belum didukung':null;S.active.files.push({key:crypto.randomUUID(),file,error});}$('handoverFile').value='';renderSelected();});
$('captureLocation').onclick=()=>{if(!S.active)return;if(!navigator.geolocation){$('locationStatus').textContent='Perangkat tidak menyediakan lokasi.';return;}$('captureLocation').disabled=true;$('locationStatus').textContent='Mengambil lokasi perangkat…';navigator.geolocation.getCurrentPosition(position=>{if(S.active){S.active.location={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy};$('locationStatus').textContent='Lokasi siap · akurasi ±'+Math.round(position.coords.accuracy)+' m.';}$('captureLocation').disabled=false;},()=>{$('locationStatus').textContent='Lokasi belum diizinkan atau belum tersedia. Izinkan lokasi lalu coba kembali.';$('captureLocation').disabled=false;},{enableHighAccuracy:true,timeout:20000,maximumAge:60000});};
$('handoverForm').addEventListener('submit',e=>{e.preventDefault();if(!S.active)return;if(!S.overview?.mediaStorageReady){handoverError(messages[S.overview?.writeUnavailableReason]||messages.STORAGE_NOT_ENABLED);return;}if(!S.active.files.length||S.active.files.some(f=>f.error)){handoverError('Pilih setidaknya satu foto/video dan hapus file yang tidak valid.');return;}if(!S.active.location){handoverError('Ambil dan izinkan lokasi perangkat terlebih dahulu.');return;}const storage=S.overview?.mediaStorage;if(storage&&!S.active.started&&S.active.files.reduce((n,e)=>n+e.file.size,0)>storage.capacity-storage.used){handoverError(messages.MEDIA_FREE_QUOTA_FULL);return;}handoverError('');$('confirmationCopy').textContent='Yakin menyimpan '+S.active.files.length+' bukti pengalihan ke '+(S.active.kind==='ppk'?'PPK':'Bendahara')+' beserta lokasi perangkat?';$('handoverConfirm').hidden=false;$('confirmYes').focus();});
$('confirmNo').onclick=()=>{$('handoverConfirm').hidden=true;$('handoverSave').focus();};
$('confirmYes').onclick=async()=>{const active=S.active;if(!active||active.busy)return;active.busy=true;active.started=true;$('handoverConfirm').hidden=true;$('uploadProgress').hidden=false;$('handoverSave').disabled=true;$('closeHandover').disabled=true;$('handoverFile').disabled=true;$('captureLocation').disabled=true;renderSelected();const date=$('handoverDate').value,notes=$('handoverNotes').value;try{for(let i=0;i<active.files.length;i++){const entry=active.files[i];if(entry.staged)continue;$('uploadProgress').textContent='Mengunggah bukti '+(i+1)+' dari '+active.files.length+'…';const params=new URLSearchParams({id:active.id,kind:active.kind,page:String(active.page),requestId:active.requestId,fileKey:entry.key,filename:entry.file.name});await request('/handover/evidence?'+params,{method:'POST',headers:{'Content-Type':entry.file.type},body:entry.file});entry.staged=true;}$('uploadProgress').textContent='Mengonfirmasi seluruh bukti…';await request('/handover/confirm?'+new URLSearchParams({page:String(active.page)}),{method:'POST',json:{id:active.id,kind:active.kind,requestId:active.requestId,date,notes,location:active.location}});active.busy=false;S.active=null;$('handoverDialog').close();toast('Pengalihan dan seluruh bukti tersimpan.');await loadRecords();await refreshOverview();}catch(e){active.busy=false;handoverError(friendly(e));$('uploadProgress').textContent='Belum dikonfirmasi. Coba kembali untuk melanjutkan unggahan yang sama.';}finally{if(S.active)S.active.busy=false;$('handoverSave').disabled=!S.overview?.mediaStorageReady;$('closeHandover').disabled=false;$('handoverFile').disabled=!!S.active?.started;$('captureLocation').disabled=false;renderSelected();}};
$('today').textContent=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());$('loginDialog').addEventListener('cancel',e=>e.preventDefault());
(async()=>{if(S.token)try{const session=await request('/auth/session');await enter(session.username,session.admin,session.owner);return;}catch{sessionStorage.removeItem('spby.portal.session');S.token='';}if(!$('loginDialog').open)$('loginDialog').showModal();})();
setInterval(()=>{if(S.admin&&S.token&&!document.hidden)refreshOverview().then(()=>mediaPump()).catch(()=>{});},15000);
setInterval(()=>{if(!S.admin&&S.token&&!document.hidden&&['documents','ppk','bendahara'].includes(S.view))loadRecords().catch(e=>notice(friendly(e)));},60000);

async function refreshGoogleAuthorization(){
 const status=$('googleAuthorizationStatus');
 const callback=new URLSearchParams(location.search).get('google');
 const details={GOOGLE_OAUTH_NETWORK:'Worker belum bisa menghubungi server Google. Coba hubungkan lagi.',GOOGLE_OAUTH_CLIENT_INVALID:'Google menolak konfigurasi OAuth client. Periksa Client secret pada Worker.',GOOGLE_OAUTH_CODE_EXPIRED:'Kode izin Google kedaluwarsa atau sudah digunakan. Mulai lagi dari tombol Hubungkan akun Google.',GOOGLE_OAUTH_SAVE_FAILED:'Izin diterima dari Google, tetapi Worker gagal menyimpannya. Coba hubungkan lagi.',GOOGLE_OAUTH_SESSION_EXPIRED:'Sesi SPBY kedaluwarsa. Masuk kembali lalu hubungkan akun Google.'};
 try{
  const info=await request('/auth/google/status');
  $('googleAuthorize').disabled=!info.configured;
  status.textContent=info.authorized?'Izin Google tercatat. Akses folder dan spreadsheet masih perlu diverifikasi.':(details[callback]||(callback?.startsWith('GOOGLE_OAUTH_')?'Izin Google belum tercatat ('+callback+'). Coba hubungkan ulang.':'Hubungkan akun Google pemilik folder bukti SPBY.'));
 }catch(e){status.textContent=friendly(e);}
}
$('googleAuthorize').onclick=async()=>{
 const button=$('googleAuthorize');
 button.disabled=true;
 try{const data=await request('/auth/google/start',{method:'POST'});location.assign(data.url);}
 catch(e){$('googleAuthorizationStatus').textContent=friendly(e);button.disabled=false;}
};


function renderDelegates(delegates){
 const list=$('delegateList');
 list.replaceChildren();
 for(const {username} of delegates){
  const item=el('li',username+' ');
  item.append(button('Cabut akses',()=>updateDelegate(username,false)));
  list.append(item);
 }
 if(!delegates.length)list.append(el('li','Belum ada akun tambahan dengan akses kelola.'));
}
async function refreshDelegates(){
 try{const data=await request('/admin/access');renderDelegates(data.delegates);}
 catch(e){$('delegateStatus').textContent=friendly(e);}
}
async function updateDelegate(username,enabled){
 if(!S.owner)return;
 const prompt=enabled?'Berikan akses seluruh arsip dan pengalihan kepada '+username+'?':'Cabut akses kelola dari '+username+'?';
 if(!confirm(prompt))return;
 try{
  const data=await request('/admin/access',{method:'POST',json:{username,enabled}});
  renderDelegates(data.delegates);
  $('delegateStatus').textContent=enabled?'Akses kelola diberikan kepada '+username+'.':'Akses kelola dicabut dari '+username+'.';
  if(enabled)$('delegateForm').reset();
 }catch(e){$('delegateStatus').textContent=friendly(e);}
}
$('delegateForm').onsubmit=e=>{
 e.preventDefault();
 const username=$('delegateUsername').value.trim();
 if(username)void updateDelegate(username,true);
};

$('exportPeriod').onchange=()=>{
 const period=$('exportPeriod').value;
 $('exportRange').hidden=period!=='range';
 $('exportYearLabel').hidden=period!=='year';
};
$('mediaExport').onclick=async()=>{
 if(!S.admin)return;
 const session=S.token, control=$('mediaExport'), status=$('mediaExportStatus');
 control.disabled=true;
 status.textContent='Menyiapkan daftar bukti…';
 try{
  const filters=new URLSearchParams(), period=$('exportPeriod').value;
  const id=$('exportId').value.trim();
  if(id)filters.set('id',id);
  if(period==='range'){
   const from=$('exportFrom').value,to=$('exportTo').value;
   if(!from||!to||from>to)throw new Error('INVALID_EXPORT_FILTER');
   filters.set('from',from);
   filters.set('to',to);
  }
  if(period==='year'){
   const year=$('exportYear').value;
   if(!/^(?:19|20)\d{2}$/.test(year))throw new Error('INVALID_EXPORT_FILTER');
   filters.set('year',year);
  }
  const {ZipArchive}=await import('./zip.mjs');
  const files=[];
  let cursor='';
  do{
   if(S.token!==session)return;
   filters.set('after',cursor);
   const page=await request('/media/export?'+filters);
   files.push(...page.files);
   cursor=page.next;
  }while(cursor);
  if(!files.length){status.textContent='Tidak ada bukti tersimpan yang cocok dengan filter ini.';return;}
  const zip=new ZipArchive();
  for(const [index,file] of files.entries()){
   if(S.token!==session)return;
   status.textContent='Menyiapkan '+(index+1)+' dari '+files.length+' berkas…';
   const blob=await request('/media/'+encodeURIComponent(file.id),{blob:true});
   const filename=String(file.filename||'bukti').replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').slice(0,150);
   await zip.add(file.folder+'/'+file.id+'-'+filename,blob);
  }
  if(S.token!==session)return;
  const url=URL.createObjectURL(zip.finish());
  const link=el('a');
  link.href=url;
  link.download='SPBY-bukti-'+new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta'}).format(new Date())+'.zip';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
  status.textContent='Unduhan ZIP dimulai · '+files.length+' berkas.';
 }catch(e){if(S.token===session)status.textContent='ZIP belum selesai. '+friendly(e);}
 finally{control.disabled=false;}
};
