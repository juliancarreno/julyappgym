(function(){
'use strict';

/* ================= Constantes y utilidades ================= */
var APP_TAG='entreno-familiar';
var LS_PERSON='entreno_person_v1';
var COLORS=['#1E8A57','#2D5BE3','#C2661B','#8A4FD3','#B8342A'];
var MONTHS=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
var MONTHS_S=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
var UNITS={lb:'lb',kg:'kg',placas:'placas',sin:'sin peso'};
var GROUP_LABEL={composicion:'Composición corporal',perimetros:'Perímetros (cm)'};

var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function clone(o){return JSON.parse(JSON.stringify(o));}
function strip(o){var c=clone(o);delete c.id;return c;}
function pad(n){return String(n).padStart(2,'0');}
function todayISO(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function addDays(iso,n){var p=iso.split('-');var d=new Date(+p[0],+p[1]-1,+p[2]+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function fmtDate(iso){if(!iso)return '—';var p=iso.split('-');return p[2]+'/'+p[1]+'/'+p[0];}
function fmtShort(iso){if(!iso)return '—';var p=iso.split('-');return p[2]+'/'+p[1];}
function monthLabel(iso){var p=iso.split('-');return MONTHS[+p[1]-1]+' '+p[0];}
function dayMs(iso){var p=iso.split('-');return Date.UTC(+p[0],+p[1]-1,+p[2]);}
function num(v,dec){if(v==null||v===''||isNaN(v))return '—';return Number(v).toFixed(dec==null?1:dec).replace('.',',');}
function numTrim(v){if(v==null||v==='')return '';return String(+(+v).toFixed(2)).replace('.',',');}
function signed(v,dec){var a=Math.abs(v);var s=num(a,dec);if(v>0&&+a.toFixed(dec)!==0)return '+'+s;if(v<0&&+a.toFixed(dec)!==0)return '−'+s;return s;}
function parseNum(s){if(s==null)return null;s=String(s).trim().replace(',','.');if(s==='')return null;var v=parseFloat(s);return isNaN(v)?null:v;}
function norm(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ');}
function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function plural(n,a,b){return n===1?a:b;}
function isHttps(u){return /^https:\/\//i.test(u||'')||/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(u||'');}

var ICONS={
  home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  train:'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  routines:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  measures:'<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  progress:'<path d="M4 20V4M4 20h16"/><path d="M8 15l4-5 3 3 5-7"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  profile:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  up:'<path d="M6 15l6-6 6 6"/>',
  down:'<path d="M6 9l6 6 6-6"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  data:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'
};
function ic(n,cls){return '<svg class="i '+(cls||'')+'" viewBox="0 0 24 24" aria-hidden="true">'+ICONS[n]+'</svg>';}

/* ================= Almacenamiento =================
   Modo 'sheet': los datos viven en una hoja de Google (vía Apps Script). La app guarda una copia
   local (caché), aplica los cambios al instante y los envía en orden a la hoja (outbox).
   Cada 20 s (y al volver a la app) trae los cambios de los demás.
   Modo 'local': sin URL configurada; todo queda solo en este navegador (pruebas). */
var LS_URL='julyapp_url_v1', LS_KEY='julyapp_key_v1', LS_CACHE='julyapp_cache_v1', LS_BOX='julyapp_outbox_v1';
var Store={
  mode:'boot', _mem:{}, _subs:{}, persistFail:false, _chains:{},
  url:'', key:'', synced:false, hasCache:false, pullError:null, outbox:[], writeGen:0, _flushing:null, _pulling:false, onStatus:null, _statusKey:'|0',
  init:async function(){
    var cfg=window.JULYAPP_CONFIG||{};
    this.url=String(cfg.scriptUrl||lsGet(LS_URL)||'').trim();
    this.key=String(cfg.appKey||lsGet(LS_KEY)||'').trim();
    this.mode=this.url?'sheet':'local';
    try{var raw=localStorage.getItem(this._ck());if(raw)this._mem=JSON.parse(raw)||{};}catch(e){this.persistFail=true;}
    if(this.mode==='sheet'){
      try{var b=localStorage.getItem(LS_BOX);if(b)this.outbox=JSON.parse(b)||[];}catch(e){}
      this.hasCache=Object.keys(this._mem).length>0;
      var self=this;
      setTimeout(function(){self.pull();},0);
      setInterval(function(){if(document.visibilityState==='visible')self.pull();},20000);
    }
  },
  _ck:function(){return this.url?LS_CACHE:LS_CACHE+'_local';},
  _persist:function(){try{localStorage.setItem(this._ck(),JSON.stringify(this._mem));}catch(e){this.persistFail=true;}},
  _saveBox:function(){try{localStorage.setItem(LS_BOX,JSON.stringify(this.outbox));}catch(e){}},
  _parent:function(p){return p.slice(0,p.lastIndexOf('/'));},
  _list:function(col){
    var out=[];
    for(var p in this._mem){if(this._parent(p)===col){out.push(Object.assign({id:p.slice(p.lastIndexOf('/')+1)},clone(this._mem[p])));}}
    return out;
  },
  _fromCache:function(){return this.mode==='sheet'&&!this.synced&&!this.hasCache;},
  _notify:function(col){
    var s=this._subs[col];if(!s)return;
    var l=this._list(col),fc=this._fromCache();
    s.forEach(function(cb){cb(l,{fromCache:fc});});
  },
  sub:function(col,cb,onErr){
    var self=this;
    var set=this._subs[col]||(this._subs[col]=new Set());
    set.add(cb);
    setTimeout(function(){cb(self._list(col),{fromCache:self._fromCache()});},0);
    return function(){set.delete(cb);};
  },
  getCol:async function(col){return this._list(col);},
  /* ---- red ---- */
  _call:async function(payload){
    payload.key=this.key;
    var ctrl=new AbortController(),t=setTimeout(function(){ctrl.abort();},28000);
    try{
      var r=await fetch(this.url,{method:'POST',body:JSON.stringify(payload),signal:ctrl.signal,redirect:'follow'});
      var j;
      try{j=await r.json();}catch(e){throw {code:'bad_response',message:'La respuesta del script no es válida. Revisa la URL y que el acceso sea "Cualquier usuario".'};}
      if(!j||!j.ok){var er={code:(j&&j.error)||'server',message:(j&&j.message)||'Error del script'};er.fatal=(er.code==='too_large'||er.code==='bad_request');throw er;}
      return j;
    }finally{clearTimeout(t);}
  },
  _flush:function(){
    var self=this;
    var p=(this._flushing||Promise.resolve()).then(async function(){
      while(self.outbox.length){
        var op=self.outbox[0];
        try{await self._call({action:op.op,path:op.path,data:op.data});}
        catch(e){if(e&&e.fatal){self.outbox.shift();self._saveBox();}throw e;}
        self.outbox.shift();self._saveBox();
      }
    });
    this._flushing=p.catch(function(){});
    return p;
  },
  pull:async function(){
    if(this.mode!=='sheet'||this._pulling)return;
    this._pulling=true;
    var self=this,gen=this.writeGen;
    try{
      if(this.outbox.length){await this._flush();S.writeFail=false;}
      var j=await this._call({action:'all'});
      if(this.writeGen!==gen){this._pulling=false;setTimeout(function(){self.pull();},400);return;}
      var remote={},changed={},p;
      (j.docs||[]).forEach(function(d){if(d&&d.p&&d.d&&typeof d.d==='object')remote[d.p]=d.d;});
      for(p in remote){if(JSON.stringify(self._mem[p])!==JSON.stringify(remote[p])){self._mem[p]=remote[p];changed[self._parent(p)]=1;}}
      for(p in this._mem){if(!(p in remote)){delete this._mem[p];changed[this._parent(p)]=1;}}
      this._persist();
      var first=!this.synced;
      this.synced=true;this.pullError=null;
      if(first)Object.keys(this._subs).forEach(function(c){changed[c]=1;});
      Object.keys(changed).forEach(function(c){self._notify(c);});
      if(first||S.offlineNote){S.offlineNote=false;}
    }catch(e){
      this.pullError=e;
      if(this.outbox.length)S.writeFail=true;
    }finally{
      this._pulling=false;
      /* solo se re-dibuja si cambió el estado de conexión (no cada 20 s, para no borrar lo que se está escribiendo) */
      var sk=(this.pullError?(this.pullError.code||'e')+(this.pullError.message||''):'')+'|'+this.outbox.length;
      if(sk!==this._statusKey){this._statusKey=sk;if(this.onStatus)this.onStatus();}
    }
  },
  /* ---- escritura (optimista) ---- */
  set:async function(path,data){
    data=clone(data);
    this._mem[path]=data;this._persist();this._notify(this._parent(path));
    if(this.mode!=='sheet')return;
    this.writeGen++;
    this.outbox.push({op:'set',path:path,data:data});this._saveBox();
    await this._flush();
  },
  del:async function(path){
    delete this._mem[path];this._persist();this._notify(this._parent(path));
    if(this.mode!=='sheet')return;
    this.writeGen++;
    this.outbox.push({op:'del',path:path});this._saveBox();
    await this._flush();
  },
  /* un solo write a la vez por documento */
  setQ:function(path,data){
    var self=this;
    var prev=this._chains[path]||Promise.resolve();
    var p=prev.catch(function(){}).then(function(){return self.set(path,data);});
    this._chains[path]=p;
    return p;
  }
};

/* ================= Estado ================= */
var S={
  view:'home',params:{},ready:false,offlineNote:false,
  people:[],pid:null,pendingPid:null,
  measurements:[],exercises:[],programs:[],cycles:[],sessions:[],
  live:null,prev:{},det:{},
  sync:'ok',writeFail:false,subs:[],
  programId:null,
  prog:{tab:'body',a:'',b:'',ex:'',metric:'max'}
};
function P(){return S.people.find(function(p){return p.id===S.pid;})||null;}
function setSync(st){
  S.sync=st;
  var d=$('#syncdot');
  if(d){d.className='sync '+(st==='busy'?'busy':st==='error'?'error':'');d.title=st==='busy'?'Guardando…':st==='error'?'No se pudo guardar':'Guardado';}
}
function track(promise){
  setSync('busy');
  return promise.then(function(r){S.writeFail=false;setSync('ok');return r;},function(e){S.writeFail=true;setSync('error');toast('No se pudo guardar en la hoja. Se reintentará solo cuando haya conexión.');throw e;});
}

/* ================= Tipos de medición ================= */
function defaultTypes(){
  var T=function(key,name,group,unit,dec,better){return {key:key,name:name,group:group,unit:unit,dec:dec,better:better,active:true};};
  return [
    T('peso','Peso','composicion','kg',1,'neutral'),
    T('imc','IMC','composicion','',1,'neutral'),
    T('grasa_pct','Grasa corporal','composicion','%',1,'down'),
    T('masa_grasa','Masa grasa','composicion','kg',1,'down'),
    T('musculo_kg','Masa muscular','composicion','kg',1,'up'),
    T('musculo_pct','Masa muscular','composicion','%',1,'up'),
    T('musculo_esq','Músculo esquelético','composicion','kg',1,'up'),
    T('grasa_visceral','Grasa visceral','composicion','nivel',0,'down'),
    T('agua_pct','Agua corporal','composicion','%',1,'neutral'),
    T('metabolismo','Metabolismo basal','composicion','kcal',0,'neutral'),
    T('biceps_izq','Bíceps izquierdo','perimetros','cm',1,'neutral'),
    T('biceps_der','Bíceps derecho','perimetros','cm',1,'neutral'),
    T('pecho','Pecho','perimetros','cm',1,'neutral'),
    T('abdomen','Abdomen / cintura','perimetros','cm',1,'down'),
    T('muslo_izq','Muslo izquierdo','perimetros','cm',1,'neutral'),
    T('muslo_der','Muslo derecho','perimetros','cm',1,'neutral'),
    T('pantorrilla_izq','Pantorrilla izquierda','perimetros','cm',1,'neutral'),
    T('pantorrilla_der','Pantorrilla derecha','perimetros','cm',1,'neutral')
  ];
}
function types(all){var p=P();var t=(p&&p.types)||[];return all?t:t.filter(function(x){return x.active!==false;});}
function typeByKey(k){return types(true).find(function(t){return t.key===k;});}
function typeLabel(t){return t.unit&&t.unit!=='nivel'?t.name+' ('+t.unit+')':t.name;}
function groupLabel(g){return GROUP_LABEL[g]||g;}
function measSorted(){
  return S.measurements.slice().sort(function(a,b){
    if(a.date!==b.date)return a.date<b.date?-1:1;
    return (a.createdAt||'')<(b.createdAt||'')?-1:1;
  });
}
function series(key){
  return measSorted().filter(function(m){return m.values&&m.values[key]!=null;}).map(function(m){return {t:m.date,v:m.values[key],id:m.id};});
}
function deltaClass(t,d){
  if(!d||Math.abs(d)<1e-9)return 'flat';
  if(!t||t.better==='neutral'||!t.better)return 'neutral';
  if(t.better==='down')return d<0?'good':'bad';
  return d>0?'good':'bad';
}

/* ================= Rutinas y sesiones: helpers ================= */
function activeCycle(){
  var act=S.cycles.filter(function(c){return c.status==='active';}).sort(function(a,b){return (b.start||'').localeCompare(a.start||'');});
  if(act.length)return act[0];
  return S.cycles.slice().sort(function(a,b){return (b.start||'').localeCompare(a.start||'');})[0]||null;
}
function exDone(ex){
  if(ex.track==='check')return !!ex.done;
  return ex.sets&&ex.sets.length>0&&ex.sets.every(function(s){return s.done;});
}
function toUnit(w,from,to){
  if(w==null)return null;
  if(from===to||(from!=='lb'&&from!=='kg')||(to!=='lb'&&to!=='kg'))return w;
  return from==='lb'?w/2.20462:w*2.20462;
}
function sessionStats(s,unitOv){
  var exs=s.exercises||[];var done=exs.filter(exDone).length;
  var p=P();var unit=unitOv||(p&&p.gymUnit)||'lb';var vol=0,volSets=0;
  exs.forEach(function(ex){
    if(ex.track==='check'||(ex.unit!=='lb'&&ex.unit!=='kg'))return;
    (ex.sets||[]).forEach(function(st){
      if(st.done&&st.weight!=null&&st.reps!=null){vol+=toUnit(st.weight,ex.unit,unit)*st.reps;volSets++;}
    });
  });
  return {total:exs.length,done:done,pct:exs.length?Math.round(done/exs.length*100):0,volume:vol,volUnit:unit,volSets:volSets};
}
function sessionsSorted(){
  return S.sessions.slice().sort(function(a,b){return (b.startedAt||b.date||'').localeCompare(a.startedAt||a.date||'');});
}
function suggestNext(){
  var c=activeCycle();
  if(!c||!c.days||!c.days.length)return null;
  var last=sessionsSorted().find(function(s){return s.status==='done'&&s.cycleId===c.id;});
  var idx=0;
  if(last){var i=c.days.findIndex(function(d){return d.id===last.dayId;});if(i>=0)idx=(i+1)%c.days.length;}
  return {cycle:c,day:c.days[idx],index:idx};
}
function e1rm(w,r){if(w==null||r==null||r<1||r>12)return null;return r===1?w:w*(1+r/30);}

/* ================= Modal, toast, confirm ================= */
var modalActions=[];
function openModal(o){
  closeModal(true);
  var root=$('#modal');
  var acts=o.actions||[];
  modalActions=acts;
  root.innerHTML='<div class="scrim" data-act="closeModal"></div>'+
    '<div class="sheet" role="dialog" aria-modal="true" aria-label="'+esc(o.title)+'">'+
    '<div class="sheet-h"><h2>'+esc(o.title)+'</h2><button class="icon-btn" data-act="closeModal" aria-label="Cerrar">×</button></div>'+
    '<div class="sheet-b">'+o.html+'</div>'+
    (acts.length?'<div class="sheet-f">'+acts.map(function(a,i){return '<button class="btn '+(a.cls||'')+'" data-mact="'+i+'">'+esc(a.label)+'</button>';}).join('')+'</div>':'')+
    '</div>';
  root.hidden=false;
  document.body.classList.add('noscroll');
  if(o.onMount)o.onMount(root);
}
function closeModal(silent){
  var root=$('#modal');
  if(!root)return;
  root.hidden=true;root.innerHTML='';modalActions=[];
  document.body.classList.remove('noscroll');
}
function confirmBox(o){
  return new Promise(function(resolve){
    openModal({title:o.title,html:'<p>'+o.text+'</p>',actions:[
      {label:o.cancel||'Cancelar',onClick:function(){resolve(false);}},
      {label:o.ok||'Confirmar',cls:o.danger?'danger':'primary',onClick:function(){resolve(true);}}
    ]});
  });
}
var toastT=null;
function toast(msg){
  var old=$('.toast');if(old)old.remove();
  var d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.textContent=msg;
  document.body.appendChild(d);
  clearTimeout(toastT);toastT=setTimeout(function(){d.remove();},3200);
}
function fv(id){var e=document.getElementById(id);return e?e.value:'';}

/* ================= Gráfica de líneas (SVG a escala) ================= */
function niceTicks(min,max,n){
  n=n||4;
  if(min===max){var d=Math.abs(min)*0.05||1;min-=d;max+=d;}
  var span=max-min,step0=span/n,mag=Math.pow(10,Math.floor(Math.log10(step0)));
  var nr=step0/mag;var step=(nr<1.5?1:nr<3?2:nr<7?5:10)*mag;
  var lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step,t=[];
  for(var v=lo;v<=hi+step/2;v+=step)t.push(+v.toFixed(10));
  return t;
}
function tickFmt(ticks){
  var step=ticks.length>1?Math.abs(ticks[1]-ticks[0]):1;
  var dec=step>=1?0:Math.min(3,Math.ceil(-Math.log10(step)+0.0001));
  return function(v){return num(v,dec);};
}
function dateTickLabel(ms,span){
  var d=new Date(ms);
  if(span<90*86400000)return d.getUTCDate()+' '+MONTHS_S[d.getUTCMonth()];
  return MONTHS_S[d.getUTCMonth()]+' '+String(d.getUTCFullYear()).slice(2);
}
/* seriesList: [{label,cls:1|2,axis:'left'|'right',dec,unit,pts:[{t:'YYYY-MM-DD',v}]}] */
function lineChart(seriesList){
  var W=360,H=230,mT=18,mB=30,hasR=seriesList.some(function(s){return s.axis==='right';});
  var mL=46,mR=hasR?46:16;
  var all=[];seriesList.forEach(function(s){s.pts.forEach(function(p){all.push(dayMs(p.t));});});
  if(!all.length)return '';
  var tmin=Math.min.apply(null,all),tmax=Math.max.apply(null,all);
  var iw=W-mL-mR,ih=H-mT-mB;
  var X=function(ms){return mL+(tmax===tmin?iw/2:(ms-tmin)/(tmax-tmin)*iw);};
  var axes={};
  ['left','right'].forEach(function(a){
    var ss=seriesList.filter(function(s){return (s.axis||'left')===a;});
    if(!ss.length)return;
    var vs=[];ss.forEach(function(s){s.pts.forEach(function(p){vs.push(p.v);});});
    var ticks=niceTicks(Math.min.apply(null,vs),Math.max.apply(null,vs));
    axes[a]={ticks:ticks,lo:ticks[0],hi:ticks[ticks.length-1],fmt:tickFmt(ticks),cls:ss[0].cls};
  });
  var Y=function(a,v){var ax=axes[a];return mT+ih*(1-(v-ax.lo)/((ax.hi-ax.lo)||1));};
  var out='<svg class="chart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Gráfica de evolución">';
  var first=axes.left||axes.right;
  var fa=axes.left?'left':'right';
  first.ticks.forEach(function(t){
    var y=Y(fa,t);
    out+='<line class="gl" x1="'+mL+'" x2="'+(W-mR)+'" y1="'+y.toFixed(1)+'" y2="'+y.toFixed(1)+'"/>';
  });
  if(axes.left)axes.left.ticks.forEach(function(t){out+='<text class="ct" x="'+(mL-6)+'" y="'+(Y('left',t)+3.5).toFixed(1)+'" text-anchor="end">'+axes.left.fmt(t)+'</text>';});
  if(axes.right)axes.right.ticks.forEach(function(t){out+='<text class="ct" x="'+(W-mR+6)+'" y="'+(Y('right',t)+3.5).toFixed(1)+'" text-anchor="start">'+axes.right.fmt(t)+'</text>';});
  var nT=tmax===tmin?1:Math.min(4,Math.max(2,Math.round((tmax-tmin)/86400000/20)+1));
  for(var i=0;i<nT;i++){
    var ms=nT===1?tmin:tmin+(tmax-tmin)*i/(nT-1);
    var anchor=nT===1?'middle':i===0?'start':i===nT-1?'end':'middle';
    out+='<text class="ct" x="'+X(ms).toFixed(1)+'" y="'+(H-10)+'" text-anchor="'+anchor+'">'+dateTickLabel(ms,tmax-tmin)+'</text>';
  }
  seriesList.forEach(function(s){
    var a=s.axis||'left';
    var pts=s.pts.slice().sort(function(p,q){return dayMs(p.t)-dayMs(q.t);});
    if(pts.length>1){
      out+='<path class="ln'+s.cls+'" d="'+pts.map(function(p,i){return (i?'L':'M')+X(dayMs(p.t)).toFixed(1)+' '+Y(a,p.v).toFixed(1);}).join(' ')+'"/>';
    }
    pts.forEach(function(p,i){
      var last=i===pts.length-1;
      var x=X(dayMs(p.t)),y=Y(a,p.v);
      out+='<circle class="pt'+s.cls+(last?' last':'')+'" cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+(last?5:3.5)+'"><title>'+esc(fmtDate(p.t)+': '+num(p.v,s.dec)+(s.unit?' '+s.unit:''))+'</title></circle>';
      if(last){
        var below=s.cls===2&&seriesList.length>1;
        var ty=below?y+17:y-9;
        if(ty<mT-2)ty=y+17;
        if(ty>H-mB+4)ty=y-9;
        var tx=Math.min(Math.max(x,mL+14),W-mR-14);
        out+='<text class="cl'+s.cls+'" x="'+tx.toFixed(1)+'" y="'+ty.toFixed(1)+'" text-anchor="middle">'+num(p.v,s.dec)+'</text>';
      }
    });
  });
  return out+'</svg>';
}

/* ================= Descargas ================= */
function textFallback(filename,text){
  openModal({title:'Copia manual',html:'<p class="muted">No se pudo descargar el archivo. Copia este contenido y guárdalo como <b>'+esc(filename)+'</b>.</p><div class="fld"><textarea id="fb-text" class="mono" readonly></textarea></div>',
    actions:[{label:'Cerrar'},{label:'Copiar',cls:'primary',onClick:function(){
      var t=$('#fb-text');t.select();
      try{navigator.clipboard.writeText(t.value).then(function(){toast('Copiado');},function(){document.execCommand&&document.execCommand('copy');});}catch(e){try{document.execCommand('copy');}catch(e2){}}
      return false;}}],
    onMount:function(){$('#fb-text').value=text;}});
}
async function saveFile(filename,data,mime){
  try{
    var blob=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(a.href);},4000);
    toast('Descarga iniciada');return true;
  }catch(e){
    if(typeof data==='string')textFallback(filename,data);
    return false;
  }
}

/* ================= Router y render ================= */
var A={};
var TAB_OF={home:'home',profile:'home',data:'home',train:'train',session:'train',sessionview:'train',history:'train',routines:'routines',cycle:'routines',measures:'measures',progress:'progress'};
var TITLE={train:'Entrenar',routines:'Rutinas',measures:'Medidas',progress:'Progreso',profile:'Perfil',data:'Datos y respaldo',history:'Historial'};
var BACK={session:'train',sessionview:'history',history:'train',cycle:'routines',profile:'home',data:'home'};
var TABS=[['home','Inicio','home'],['train','Entrenar','train'],['routines','Rutinas','routines'],['measures','Medidas','measures'],['progress','Progreso','progress']];

function go(view,params){closeModal();S.view=view;S.params=params||{};render();window.scrollTo(0,0);}
function renderKeep(){var y=window.scrollY;render();window.scrollTo(0,y);}
var rq=0;
function scheduleRender(){if(S.view==='session')return;cancelAnimationFrame(rq);rq=requestAnimationFrame(render);}
function initial(n){return String(n||'?').trim().charAt(0).toUpperCase()||'?';}
function viewTitle(){
  if(S.view==='session'&&S.live)return S.live.dayName;
  if(S.view==='sessionview'){var s=S.sessions.find(function(x){return x.id===S.params.id;});return s?s.dayName:'Sesión';}
  if(S.view==='cycle'){var c=S.cycles.find(function(x){return x.id===S.params.id;});return c?c.name:'Ciclo';}
  return TITLE[S.view]||'';
}
function header(){
  var p=P(),sub=BACK[S.view];
  var who=p?'<button class="who" data-act="people" aria-label="Cambiar de persona"><span class="av" style="background:'+COLORS[(p.color||0)%COLORS.length]+'">'+esc(initial(p.name))+'</span><b>'+esc(p.name)+'</b><span class="sync '+(S.sync==='busy'?'busy':S.sync==='error'?'error':'')+'" id="syncdot"></span></button>':'';
  var left=sub?'<button class="icon-btn" data-act="back" aria-label="Volver">'+ic('back')+'</button><h1>'+esc(viewTitle())+'</h1>':'<div class="brand">JulyAppGym</div>';
  return '<header class="top"><div class="wrap">'+left+who+'</div></header>';
}
function nav(){
  var cur=TAB_OF[S.view];
  return '<nav class="nav" aria-label="Secciones"><div class="wrap">'+TABS.map(function(t){
    return '<button class="'+(cur===t[0]?'on':'')+'" data-act="go" data-v="'+t[0]+'" aria-label="'+t[1]+'"'+(cur===t[0]?' aria-current="page"':'')+'>'+ic(t[2])+'<span>'+t[1]+'</span></button>';
  }).join('')+'</div></nav>';
}
function banners(){
  var h='';
  if(Store.mode==='local')h+='<div class="banner">Modo local: no hay hoja de Google conectada, los datos se guardan solo en este navegador. Conéctala en Datos y respaldo.</div>';
  if(Store.mode==='local'&&Store.persistFail)h+='<div class="banner">Este navegador no permite guardar datos. Lo que escribas se perderá al cerrar. Usa Datos y respaldo para exportar.</div>';
  if(Store.mode==='sheet'&&Store.pullError)h+='<div class="banner">No hay conexión con la hoja de Google ('+esc(Store.pullError.message||Store.pullError.code||'error')+'). Lo que ves puede estar desactualizado; los cambios se enviarán al reconectar'+(Store.outbox.length?' ('+Store.outbox.length+' pendientes)':'')+'.</div>';
  else if(S.offlineNote)h+='<div class="banner">La hoja aún no responde. Lo que ves puede estar desactualizado.</div>';
  return h;
}
function body(){
  if(!S.ready&&S.view!=='data'){
    if(Store.pullError)return '<div class="card empty"><h3>Sin conexión con la hoja</h3><p>'+esc(Store.pullError.message||Store.pullError.code||'No se pudo conectar')+'</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="retry">Reintentar</button><button class="btn" data-act="go" data-v="data">Revisar conexión</button></div></div>';
    return '<div class="empty"><h3>Cargando</h3>Conectando con tus datos…</div>';
  }
  var p=P();
  var noP=['home','train','routines','measures','progress','history','profile'];
  if(!p&&noP.indexOf(S.view)>=0)return viewNoPerson();
  switch(S.view){
    case 'home':return viewHome();
    case 'train':return viewTrain();
    case 'session':return viewSession();
    case 'sessionview':return viewSessionDetail();
    case 'history':return viewHistory();
    case 'routines':return viewRoutines();
    case 'cycle':return viewCycle();
    case 'measures':return viewMeasures();
    case 'progress':return viewProgress();
    case 'profile':return viewProfile();
    case 'data':return viewData();
  }
  return '';
}
function render(){
  var app=$('#app');if(!app)return;
  var y=window.scrollY;
  app.innerHTML=header()+'<main class="wrap" id="view">'+banners()+body()+'</main>'+(S.view==='session'?'':nav());
  if(S.view==='session'||S.view==='cycle')window.scrollTo(0,y);
}

/* ================= Sin persona ================= */
function viewNoPerson(){
  return '<div class="card empty"><h3>Crea el primer perfil</h3><p>Cada persona tiene sus propias mediciones, rutinas y sesiones.</p><div class="row" style="justify-content:center"><button class="btn primary" data-act="newPerson">'+ic('plus')+' Agregar persona</button><button class="btn" data-act="go" data-v="data">Importar un respaldo</button></div></div>';
}

/* ================= Inicio ================= */
function greeting(){var h=new Date().getHours();return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';}
function dispName(t){
  var dup=types().filter(function(x){return x.name===t.name&&x.key!==t.key;}).length>0;
  return dup&&t.unit?t.name+' ('+t.unit+')':t.name;
}
function arrow(d){return d>0?'↑':d<0?'↓':'→';}
function unitTxt(t){return t.unit&&t.unit!=='nivel'?' '+t.unit:'';}
function dchip(t,d){
  if(d==null)return '<span class="muted">—</span>';
  return '<span class="delta '+deltaClass(t,d)+'">'+arrow(d)+' '+signed(d,t.dec)+esc(unitTxt(t))+'</span>';
}
function mrowHtml(t,full){
  var s=series(t.key);if(!s.length)return '';
  var cur=s[s.length-1],pr=s.length>1?s[s.length-2]:null,fi=s[0];
  var l2='';
  if(pr)l2+='<span>Anterior '+num(pr.v,t.dec)+' ('+fmtShort(pr.t)+') · '+dchip(t,cur.v-pr.v)+'</span>';
  else l2+='<span>Primera medición</span>';
  if(full&&s.length>1)l2+='<span>Desde '+fmtDate(fi.t)+': '+dchip(t,cur.v-fi.v)+'</span>';
  return '<div class="mrow"><div class="l1"><span class="nm">'+esc(dispName(t))+'</span><span class="val tn">'+num(cur.v,t.dec)+'<small>'+esc(t.unit||'')+'</small></span></div><div class="l2">'+l2+(full?'<span>Medido el '+fmtDate(cur.t)+'</span>':'')+'</div></div>';
}
function viewHome(){
  var p=P();
  var act=S.sessions.find(function(s){return s.status==='in_progress';});
  var nxt=suggestNext();
  var h='<div class="hello"><small>'+greeting()+'</small>'+esc(p.name)+'</div>';
  if(act){
    var st=sessionStats(act);
    h+='<div class="card nextc"><div class="row sb"><div><b>Sesión en curso</b><div class="muted">'+esc(act.dayName)+' · '+fmtDate(act.date)+' · '+st.done+' de '+st.total+'</div></div><button class="btn good" data-act="openSession" data-id="'+act.id+'">Continuar</button></div></div>';
  }else if(nxt){
    h+='<button class="btn primary big block" data-act="startDay" data-day="'+nxt.day.id+'">Iniciar · '+esc(nxt.day.name)+'</button>'+
       '<div class="row sb" style="margin:8px 0 4px"><span class="muted">Siguiente en «'+esc(nxt.cycle.name)+'»</span><button class="btn sm" data-act="go" data-v="train">Elegir otro día</button></div>';
  }else{
    h+='<div class="card"><h2>Aún no tienes rutina</h2><p class="muted">Crea tu ciclo con los días que te asignó el entrenador.</p><button class="btn primary" data-act="go" data-v="routines">Crear rutina</button></div>';
  }
  var ms=measSorted();
  if(!ms.length){
    h+='<div class="card"><h2>Mediciones</h2><p class="muted">Aún no hay valoraciones.</p><button class="btn" data-act="newMeas">'+ic('plus')+' Nueva valoración</button></div>';
  }else{
    var rows=['peso','grasa_pct','musculo_kg'].map(function(k){var t=typeByKey(k);return t?mrowHtml(t,false):'';}).join('');
    h+='<div class="sect"><h2>Última medición</h2><span class="chip">'+fmtDate(ms[ms.length-1].date)+'</span></div><div class="card">'+(rows||'<p class="muted">Sin datos de peso, grasa o músculo.</p>')+'<div style="margin-top:8px"><button class="btn sm" data-act="go" data-v="measures">Ver mediciones</button></div></div>';
  }
  var rec=sessionsSorted().filter(function(s){return s.status==='done';}).slice(0,4);
  h+='<div class="sect"><h2>Entrenamientos recientes</h2></div>';
  if(!rec.length)h+='<div class="card muted">Todavía no has terminado ninguna sesión.</div>';
  else h+='<div class="card" style="padding:4px 14px">'+rec.map(sessionItem).join('')+'</div>';
  h+='<div class="sect"><h2>Accesos</h2></div><div class="tiles">'+
    [['measures','Mediciones','measures'],['train','Entrenar','train'],['routines','Rutinas','routines'],['progress','Progreso','progress'],['history','Historial','history'],['profile','Perfil','profile']].map(function(t){
      return '<button class="tile" data-act="go" data-v="'+t[0]+'">'+ic(t[2])+t[1]+'</button>';}).join('')+'</div>';
  return h;
}
function sessionItem(s){
  var st=sessionStats(s);
  return '<button class="item" data-act="openDetail" data-id="'+s.id+'"><span class="tick '+(s.status==='done'?'':'off')+'">'+ic('check')+'</span><span class="grow"><b>'+fmtShort(s.date)+' · '+esc(s.dayName)+'</b><span class="muted">'+st.done+' de '+st.total+' ejercicios'+(s.status==='done'?'':' · en curso')+'</span></span></button>';
}

/* ================= Entrenar ================= */
function viewTrain(){
  var c=activeCycle();
  var act=S.sessions.find(function(s){return s.status==='in_progress';});
  var h='';
  if(act){
    var st=sessionStats(act);
    h+='<div class="card nextc"><div class="row sb"><div><b>Sesión en curso</b><div class="muted">'+esc(act.dayName)+' · '+fmtDate(act.date)+' · '+st.done+' de '+st.total+'</div></div><button class="btn good" data-act="openSession" data-id="'+act.id+'">Continuar</button></div></div>';
  }
  if(!c||!(c.days||[]).length){
    h+='<div class="card empty"><h3>Aún no hay rutina</h3><p>Crea un ciclo con los días de entrenamiento para poder iniciar sesiones.</p><button class="btn primary" data-act="go" data-v="routines">Ir a Rutinas</button></div>';
  }else{
    var nxt=suggestNext();
    h+='<div class="sect"><h2>'+esc(c.name)+'</h2><span class="muted">'+fmtShort(c.start)+(c.end?' – '+fmtShort(c.end):'')+'</span></div>';
    c.days.forEach(function(d,i){
      var isNext=nxt&&nxt.day.id===d.id;
      h+='<div class="card '+(isNext?'nextc':'')+'"><div class="row sb"><div style="min-width:0"><h2 style="margin:0">Día '+(i+1)+' · '+esc(d.name)+'</h2><div class="muted">'+(d.exercises||[]).length+' '+plural((d.exercises||[]).length,'ejercicio','ejercicios')+(isNext?' · <b>Siguiente</b>':'')+'</div></div><button class="btn primary" data-act="startDay" data-day="'+d.id+'">Iniciar</button></div></div>';
    });
  }
  var rec=sessionsSorted().slice(0,5);
  h+='<div class="sect"><h2>Últimas sesiones</h2><button class="btn sm" data-act="go" data-v="history">Ver historial</button></div>';
  h+=rec.length?'<div class="card" style="padding:4px 14px">'+rec.map(sessionItem).join('')+'</div>':'<div class="card muted">Aún no hay sesiones registradas.</div>';
  return h;
}
function viewHistory(){
  var list=sessionsSorted();
  if(!list.length)return '<div class="card empty"><h3>Sin historial</h3>Cuando termines tu primera sesión aparecerá aquí.</div>';
  var h='',cur='';
  list.forEach(function(s){
    var m=monthLabel(s.date);
    if(m!==cur){cur=m;h+='<div class="month">'+m+'</div>';}
    h+='<div class="card" style="padding:0 14px;margin-bottom:8px">'+sessionItem(s)+'</div>';
  });
  return h;
}

/* ================= Sesión en vivo ================= */
function sessPath(id){return 'people/'+S.pid+'/sessions/'+id;}
var liveTimer=null;
function persistLive(){
  liveTimer=null;
  if(!S.live)return;
  var i=S.sessions.findIndex(function(x){return x.id===S.live.id;});
  if(i>=0)S.sessions[i]=clone(S.live);else S.sessions.push(clone(S.live));
  return track(Store.setQ(sessPath(S.live.id),strip(S.live))).catch(function(){});
}
function saveLive(now){
  clearTimeout(liveTimer);
  if(now)return persistLive();
  liveTimer=setTimeout(persistLive,450);
}
function flushLive(){if(liveTimer){clearTimeout(liveTimer);return persistLive();}return Promise.resolve();}
function computePrev(sess){
  var prev={};
  var others=sessionsSorted().filter(function(o){return o.id!==sess.id&&(o.startedAt||'')<(sess.startedAt||'~');});
  sess.exercises.forEach(function(ex){
    if(ex.track==='check')return;
    for(var k=0;k<others.length;k++){
      var o=others[k];
      var m=(o.exercises||[]).find(function(e){return (ex.eid&&e.eid===ex.eid)||(!ex.eid&&norm(e.name)===norm(ex.name));});
      if(!m||m.track==='check')continue;
      if((m.sets||[]).some(function(s){return s.done;})){
        prev[ex.rid]={date:o.date,unit:m.unit,sets:(m.sets||[]).map(function(s){return {weight:s.weight,reps:s.reps,done:s.done};})};
        break;
      }
    }
  });
  return prev;
}
function openSession(id){
  var s=S.sessions.find(function(x){return x.id===id;});
  if(!s){toast('No se encontró la sesión');return;}
  S.live=clone(s);S.live.id=s.id;S.prev=computePrev(S.live);S.det={};
  go('session',{id:id});
}
A.openSession=function(t){openSession(t.dataset.id);};
A.openDetail=function(t){go('sessionview',{id:t.dataset.id,back:S.view==='history'?'history':'train'});};
A.startDay=async function(t){
  var c=activeCycle();if(!c)return;
  var day=(c.days||[]).find(function(d){return d.id===t.dataset.day;});
  if(!day)return;
  var act=S.sessions.find(function(s){return s.status==='in_progress';});
  if(act){
    var ok=await confirmBox({title:'Ya tienes una sesión en curso',text:'«'+esc(act.dayName)+'» del '+fmtDate(act.date)+' sigue abierta. Puedes continuarla o iniciar una nueva.',ok:'Iniciar nueva',cancel:'Continuar la anterior'});
    if(!ok){openSession(act.id);return;}
  }
  var s={date:todayISO(),startedAt:new Date().toISOString(),endedAt:null,status:'in_progress',cycleId:c.id,cycleName:c.name,dayId:day.id,dayName:day.name,notes:'',
    exercises:(day.exercises||[]).map(function(ex){
      var tr=ex.unit==='sin'?'check':'sets';var n=Math.max(1,ex.sets||1);
      return {rid:ex.id,eid:ex.eid||null,name:ex.name,unit:ex.unit,track:tr,section:ex.section||'main',plannedSets:ex.sets,plannedReps:ex.reps,targetWeight:ex.targetWeight==null?null:ex.targetWeight,rest:ex.rest||null,notes:ex.notes||'',link:ex.link||'',done:false,note:'',
        sets:tr==='sets'?Array.from({length:n},function(_,i){return {n:i+1,weight:null,reps:null,done:false,rpe:null,rir:null};}):[]};
    })};
  if(!s.exercises.length){toast('Este día no tiene ejercicios. Agrégalos en Rutinas.');return;}
  s.id=uid();
  S.live=s;S.prev=computePrev(s);S.det={};
  S.sessions.push(clone(s));
  persistLive();
  go('session',{id:s.id});
};
function exMeta(ex){
  var parts=[ex.plannedSets+'×'+ex.plannedReps];
  if(ex.unit&&ex.unit!=='sin')parts.push(UNITS[ex.unit]||ex.unit);
  if(ex.targetWeight!=null)parts.push('objetivo '+numTrim(ex.targetWeight));
  if(ex.rest)parts.push('descanso '+ex.rest+' s');
  return parts.join(' · ');
}
function prevText(pv){
  if(!pv)return '';
  return pv.sets.filter(function(s){return s.weight!=null||s.reps!=null;}).map(function(s){return (s.weight!=null?numTrim(s.weight):'?')+'×'+(s.reps!=null?s.reps:'?');}).join(' · ');
}
function setRow(ex,i){
  var s=ex.sets[i],pv=S.prev[ex.rid],ps=pv&&pv.sets[i];
  var prevTxt=ps&&ps.weight!=null?numTrim(ps.weight)+'×'+(ps.reps!=null?ps.reps:'?'):'—';
  return '<div class="set '+(s.done?'done':'')+'" data-ex="'+esc(ex.rid)+'" data-i="'+i+'">'+
    '<span class="sn">'+s.n+'</span><span class="sp">'+prevTxt+'</span>'+
    '<input class="in" inputmode="decimal" autocomplete="off" aria-label="Peso, serie '+s.n+'" data-bind="w" value="'+esc(numTrim(s.weight))+'" placeholder="'+esc(ps&&ps.weight!=null?numTrim(ps.weight):'')+'">'+
    '<input class="in" inputmode="numeric" autocomplete="off" aria-label="Repeticiones, serie '+s.n+'" data-bind="r" value="'+esc(s.reps==null?'':s.reps)+'" placeholder="'+esc(ps&&ps.reps!=null?ps.reps:ex.plannedReps)+'">'+
    '<button class="chk '+(s.done?'on':'')+'" data-act="toggleSet" aria-pressed="'+(s.done?'true':'false')+'" aria-label="Serie '+s.n+' completada">'+ic('check')+'</button></div>';
}
function exCard(ex){
  var done=exDone(ex),pv=S.prev[ex.rid];
  var head='<div style="min-width:0"><div class="ex-name">'+esc(ex.name)+'</div><div class="ex-meta">'+esc(exMeta(ex))+'</div>'+
    (ex.notes?'<div class="ex-meta">'+esc(ex.notes)+'</div>':'')+
    (isHttps(ex.link)?'<div class="ex-meta"><a href="'+esc(ex.link)+'" target="_blank" rel="noopener">Ver técnica ↗</a></div>':'')+'</div>';
  if(ex.track==='check'){
    return '<div class="ex '+(done?'done':'')+'" data-ex="'+esc(ex.rid)+'"><div class="ex-h" style="align-items:center">'+head+
      '<button class="chk '+(done?'on':'')+'" data-act="toggleCheck" aria-pressed="'+(done?'true':'false')+'" aria-label="'+esc(ex.name)+' completado">'+ic('check')+'</button></div></div>';
  }
  var u=UNITS[ex.unit]||'';
  var h='<div class="ex '+(done?'done':'')+'" data-ex="'+esc(ex.rid)+'"><div class="ex-h">'+head+(done?'<span class="badge-done">Completado</span>':'')+'</div>';
  if(pv)h+='<div class="lastline"><span><b>Última vez ('+fmtShort(pv.date)+'):</b> '+esc(prevText(pv))+'</span><button class="btn sm" data-act="copyPrev">Copiar</button></div>';
  h+='<div class="set hd"><span>#</span><span>Anterior</span><span>Peso ('+esc(u)+')</span><span>Reps</span><span>✓</span></div>';
  ex.sets.forEach(function(_,i){h+=setRow(ex,i);});
  h+='<div class="row" style="margin-top:8px"><button class="btn sm" data-act="addSet">'+ic('plus')+' Serie</button>'+(ex.sets.length>1?'<button class="btn sm" data-act="delSet">Quitar serie</button>':'')+'<button class="btn sm" data-act="toggleDet" aria-expanded="'+(S.det[ex.rid]?'true':'false')+'">Detalles</button></div>';
  if(S.det[ex.rid]){
    h+='<div style="margin-top:8px">';
    ex.sets.forEach(function(s,i){
      h+='<div class="mini" data-ex="'+esc(ex.rid)+'" data-i="'+i+'"><span>Serie '+s.n+'</span><input inputmode="decimal" placeholder="RPE (1-10)" aria-label="RPE serie '+s.n+'" data-bind="rpe" value="'+esc(numTrim(s.rpe))+'"><input inputmode="numeric" placeholder="RIR" aria-label="RIR serie '+s.n+'" data-bind="rir" value="'+esc(s.rir==null?'':s.rir)+'"></div>';
    });
    h+='<div class="fld" style="margin-top:8px"><label for="note-'+esc(ex.rid)+'">Notas del ejercicio</label><textarea id="note-'+esc(ex.rid)+'" data-bind="exnote">'+esc(ex.note||'')+'</textarea></div></div>';
  }
  return h+'</div>';
}
function viewSession(){
  var s=S.live;
  if(!s)return '<div class="card empty"><h3>No hay sesión abierta</h3><button class="btn primary" data-act="go" data-v="train">Volver</button></div>';
  var st=sessionStats(s);
  var h='<div class="sess-prog"><div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+st.pct+'"><i style="width:'+st.pct+'%"></i></div><div class="meta"><span>'+st.done+' de '+st.total+' ejercicios completados</span><span>'+st.pct+' %</span></div></div>';
  var groups=[['warmup','Calentamiento'],['main','Entrenamiento']];
  groups.forEach(function(g){
    var list=s.exercises.filter(function(e){return (e.section==='warmup'?'warmup':'main')===g[0];});
    if(!list.length)return;
    if(groups[0][0]==='warmup'&&(s.exercises.some(function(e){return e.section==='warmup';})))h+='<div class="grouphead"><h2>'+g[1]+'</h2></div>';
    list.forEach(function(ex){h+=exCard(ex);});
  });
  h+='<div class="card"><div class="fld"><label for="sess-notes">Notas de la sesión</label><textarea id="sess-notes" data-bind="snote">'+esc(s.notes||'')+'</textarea></div>';
  if(s.status==='done'){
    h+='<button class="btn good block big" data-act="saveEdit">Guardar cambios</button><button class="btn danger block" style="margin-top:8px" data-act="deleteSession" data-id="'+s.id+'">Eliminar sesión</button>';
  }else{
    h+='<button class="btn good block big" data-act="finishSession">Terminar entrenamiento</button><button class="btn danger block" style="margin-top:8px" data-act="cancelSession">Descartar sesión</button>';
  }
  return h+'</div>';
}
function liveEx(rid){return S.live&&S.live.exercises.find(function(e){return e.rid===rid;});}
function rowCtx(el){
  var row=el.closest('[data-ex]');if(!row)return null;
  var ex=liveEx(row.dataset.ex);if(!ex)return null;
  var i=row.dataset.i!=null?+row.dataset.i:null;
  return {ex:ex,i:i,s:i!=null?ex.sets[i]:null};
}
A.toggleSet=function(t){
  var c=rowCtx(t);if(!c)return;
  var s=c.s,ex=c.ex;
  if(!s.done){
    var pv=S.prev[ex.rid],ps=pv&&pv.sets[c.i];
    if(s.weight==null){
      var w=ps&&ps.weight!=null?ps.weight:(c.i>0&&ex.sets[c.i-1].weight!=null?ex.sets[c.i-1].weight:ex.targetWeight);
      s.weight=w==null?null:w;
    }
    if(s.reps==null){
      var r=ps&&ps.reps!=null?ps.reps:ex.plannedReps;
      s.reps=r==null?null:r;
    }
  }
  s.done=!s.done;
  saveLive();renderKeep();
};
A.toggleCheck=function(t){var c=rowCtx(t);if(!c)return;c.ex.done=!c.ex.done;saveLive();renderKeep();};
A.copyPrev=function(t){
  var c=rowCtx(t);if(!c)return;
  var pv=S.prev[c.ex.rid];if(!pv)return;
  c.ex.sets.forEach(function(s,i){
    var p=pv.sets[i];if(!p)return;
    var w=p.weight==null?null:+toUnit(p.weight,pv.unit,c.ex.unit).toFixed(1);
    s.weight=w;s.reps=p.reps;
  });
  saveLive();renderKeep();
};
A.addSet=function(t){var c=rowCtx(t);if(!c)return;c.ex.sets.push({n:c.ex.sets.length+1,weight:null,reps:null,done:false,rpe:null,rir:null});saveLive();renderKeep();};
A.delSet=function(t){var c=rowCtx(t);if(!c||c.ex.sets.length<2)return;c.ex.sets.pop();saveLive();renderKeep();};
A.toggleDet=function(t){var c=rowCtx(t);if(!c)return;S.det[c.ex.rid]=!S.det[c.ex.rid];renderKeep();};
function onLiveInput(el){
  var b=el.dataset.bind;
  if(b==='snote'){S.live.notes=el.value;saveLive();return;}
  var c=rowCtx(el);if(!c)return;
  if(b==='exnote'){c.ex.note=el.value;saveLive();return;}
  if(!c.s)return;
  if(b==='w')c.s.weight=parseNum(el.value);
  else if(b==='r'){var v=parseNum(el.value);c.s.reps=v==null?null:Math.round(v);}
  else if(b==='rpe')c.s.rpe=parseNum(el.value);
  else if(b==='rir'){var q=parseNum(el.value);c.s.rir=q==null?null:Math.round(q);}
  saveLive();
}
A.finishSession=async function(){
  if(!S.live)return;
  var st=sessionStats(S.live),pend=st.total-st.done;
  if(pend>0){
    var ok=await confirmBox({title:'Faltan ejercicios',text:'Quedan '+pend+' '+plural(pend,'ejercicio','ejercicios')+' sin completar. Se guardarán como no completados.',ok:'Terminar igual',cancel:'Seguir entrenando'});
    if(!ok)return;
  }
  S.live.status='done';S.live.endedAt=new Date().toISOString();
  var id=S.live.id;
  await saveLive(true);
  S.live=null;
  toast('Entrenamiento guardado');
  go('sessionview',{id:id,back:'train'});
};
A.saveEdit=async function(){
  var id=S.live.id;
  await saveLive(true);
  S.live=null;toast('Cambios guardados');
  go('sessionview',{id:id,back:'history'});
};
A.cancelSession=async function(){
  var ok=await confirmBox({title:'Descartar sesión',text:'Se borrará esta sesión y lo que registraste en ella. Esta acción no se puede deshacer.',ok:'Descartar',danger:true});
  if(!ok)return;
  var id=S.live.id;clearTimeout(liveTimer);liveTimer=null;
  S.live=null;S.sessions=S.sessions.filter(function(x){return x.id!==id;});
  try{await track(Store.del(sessPath(id)));}catch(e){}
  go('train');
};
A.deleteSession=async function(t){
  var id=t.dataset.id;
  var ok=await confirmBox({title:'Eliminar sesión',text:'Se eliminará esta sesión del historial. Esta acción no se puede deshacer.',ok:'Eliminar',danger:true});
  if(!ok)return;
  clearTimeout(liveTimer);liveTimer=null;
  S.live=null;S.sessions=S.sessions.filter(function(x){return x.id!==id;});
  try{await track(Store.del(sessPath(id)));}catch(e){}
  toast('Sesión eliminada');go('history');
};

/* ================= Detalle de sesión ================= */
function viewSessionDetail(){
  var s=S.sessions.find(function(x){return x.id===S.params.id;});
  if(!s)return '<div class="card empty"><h3>No se encontró la sesión</h3><button class="btn" data-act="go" data-v="history">Ir al historial</button></div>';
  var st=sessionStats(s);
  var dur='—';
  if(s.startedAt&&s.endedAt){var m=Math.round((new Date(s.endedAt)-new Date(s.startedAt))/60000);if(m>=0&&m<600)dur=m+' min';}
  var h='<div class="card"><div class="row sb"><div><h2 style="margin:0">'+esc(s.dayName)+'</h2><div class="muted">'+fmtDate(s.date)+' · '+esc(s.cycleName||'')+'</div></div><span class="chip '+(s.status==='done'?'good':'warn')+'">'+(s.status==='done'?'Terminada':'En curso')+'</span></div></div>';
  h+='<div class="bsum"><div><b>'+st.done+'/'+st.total+'</b><span>Ejercicios</span></div><div><b>'+(st.volSets?Math.round(st.volume).toLocaleString('es-CO'):'—')+'</b><span>Volumen ('+esc(st.volUnit)+')</span></div><div><b>'+dur+'</b><span>Duración</span></div></div>';
  s.exercises.forEach(function(ex){
    var done=exDone(ex);
    h+='<div class="ex '+(done?'done':'')+'"><div class="ex-h"><div style="min-width:0"><div class="ex-name">'+esc(ex.name)+'</div><div class="ex-meta">'+esc(exMeta(ex))+'</div></div>'+(done?'<span class="badge-done">Completado</span>':'<span class="chip">Pendiente</span>')+'</div>';
    if(ex.track==='check'){h+='<div class="setline '+(done?'':'pend')+'"><span class="t">'+(done?'Hecho':'No marcado')+'</span></div>';}
    else{
      var u=UNITS[ex.unit]||'';
      h+=ex.sets.map(function(x){
        var line='Serie '+x.n+': '+(x.weight!=null?numTrim(x.weight)+' '+u:'sin peso')+' × '+(x.reps!=null?x.reps:'—');
        var extra=[];if(x.rpe!=null)extra.push('RPE '+numTrim(x.rpe));if(x.rir!=null)extra.push('RIR '+x.rir);
        return '<div class="setline '+(x.done?'':'pend')+'"><span class="t">'+esc(line)+(extra.length?' · '+esc(extra.join(' · ')):'')+'</span><span>'+(x.done?'✓':'○')+'</span></div>';
      }).join('');
    }
    if(ex.note)h+='<div class="ex-meta" style="margin-top:6px">Nota: '+esc(ex.note)+'</div>';
    h+='</div>';
  });
  if(s.notes)h+='<div class="card"><b>Notas de la sesión</b><p style="margin:6px 0 0">'+esc(s.notes)+'</p></div>';
  h+='<div class="row"><button class="btn" data-act="openSession" data-id="'+s.id+'">'+ic('edit')+' Editar</button><button class="btn danger" data-act="deleteSession" data-id="'+s.id+'">'+ic('trash')+' Eliminar</button></div>';
  return h;
}

/* ================= Personas ================= */
function personForm(p){
  return '<div class="fld"><label for="pf-name">Nombre</label><input id="pf-name" value="'+esc(p.name||'')+'" autocomplete="off"></div>'+
    '<div class="two"><div class="fld"><label for="pf-h">Estatura (cm)</label><input id="pf-h" inputmode="decimal" value="'+esc(p.heightCm||'')+'"></div>'+
    '<div class="fld"><label for="pf-u">Unidad de pesas</label><select id="pf-u"><option value="lb">Libras (lb)</option><option value="kg">Kilos (kg)</option></select></div></div>';
}
A.people=function(){
  var h=S.people.map(function(x){
    return '<button class="item" data-act="switchPerson" data-id="'+x.id+'"><span class="av" style="background:'+COLORS[(x.color||0)%COLORS.length]+'">'+esc(initial(x.name))+'</span><span class="grow"><b>'+esc(x.name)+'</b></span>'+(x.id===S.pid?'<span class="chip good">Activa</span>':'')+'</button>';
  }).join('');
  openModal({title:'Personas',html:(h||'<p class="muted">Aún no hay personas.</p>')+'<div class="row" style="margin-top:14px"><button class="btn" data-act="newPerson">'+ic('plus')+' Agregar persona</button><button class="btn" data-act="go" data-v="profile">Perfil</button><button class="btn" data-act="go" data-v="data">Datos</button></div>'});
};
A.switchPerson=function(t){attachPerson(t.dataset.id);go('home');};
A.newPerson=function(){
  openModal({title:'Nueva persona',html:personForm({}),actions:[
    {label:'Cancelar'},
    {label:'Crear',cls:'primary',onClick:async function(){
      var name=fv('pf-name').trim();
      if(!name){toast('Escribe un nombre');return false;}
      var id=uid();
      var doc={name:name,heightCm:parseNum(fv('pf-h')),gymUnit:fv('pf-u')||'lb',color:S.people.length%COLORS.length,types:defaultTypes(),createdAt:new Date().toISOString()};
      S.pendingPid=id;
      try{await track(Store.set('people/'+id,doc));}catch(e){S.pendingPid=null;return false;}
      S.people.push(Object.assign({id:id},doc));
      attachPerson(id);
      toast('Perfil creado');
      go('home');
    }}]});
};

/* ================= Rutinas: programas y ciclos ================= */
function cyPath(id){return 'people/'+S.pid+'/cycles/'+id;}
function curPrograms(){return S.programs.slice().sort(function(a,b){return (a.createdAt||'').localeCompare(b.createdAt||'');});}
async function ensureProgram(){
  if(S.programId&&S.programs.find(function(p){return p.id===S.programId;}))return S.programId;
  if(S.programs.length){S.programId=curPrograms()[0].id;return S.programId;}
  var id=uid(),doc={name:'Programa principal',goal:'',createdAt:new Date().toISOString()};
  await track(Store.set('people/'+S.pid+'/programs/'+id,doc));
  S.programs.push(Object.assign({id:id},doc));S.programId=id;return id;
}
function mutateCycle(id,fn){
  var i=S.cycles.findIndex(function(c){return c.id===id;});if(i<0)return;
  var c=clone(S.cycles[i]);fn(c);S.cycles[i]=c;renderKeep();
  track(Store.setQ(cyPath(id),strip(c))).catch(function(){});
}
async function resolveEid(name){
  var f=S.exercises.find(function(e){return norm(e.name)===norm(name);});
  if(f)return f.id;
  var id=uid(),doc={name:name.trim(),group:'',createdAt:new Date().toISOString()};
  S.exercises.push(Object.assign({id:id},doc));
  try{await track(Store.set('people/'+S.pid+'/exercises/'+id,doc));}catch(e){}
  return id;
}
function viewRoutines(){
  var progs=curPrograms();
  if(!S.programId||!progs.find(function(p){return p.id===S.programId;}))S.programId=progs[0]?progs[0].id:null;
  var h='';
  if(progs.length>1){
    h+='<div class="seg" style="margin-bottom:12px">'+progs.map(function(p){return '<button class="'+(p.id===S.programId?'on':'')+'" data-act="pickProgram" data-id="'+p.id+'">'+esc(p.name)+'</button>';}).join('')+'</div>';
  }
  var cycles=S.cycles.filter(function(c){return !S.programId||c.programId===S.programId;}).sort(function(a,b){return (b.start||'').localeCompare(a.start||'');});
  if(!cycles.length){
    h+='<div class="card empty"><h3>Crea tu primer ciclo</h3><p>Un ciclo es la rutina que te da el entrenador por unos meses. Defines cuántos días tiene y qué ejercicios hay en cada uno.</p><button class="btn primary" data-act="newCycle">'+ic('plus')+' Nuevo ciclo</button></div>';
  }else{
    h+='<div class="row" style="margin-bottom:12px"><button class="btn primary" data-act="newCycle">'+ic('plus')+' Nuevo ciclo</button></div>';
    cycles.forEach(function(c){
      var n=S.sessions.filter(function(s){return s.cycleId===c.id;}).length;
      var act=c.status==='active';
      h+='<div class="card '+(act?'nextc':'')+'"><div class="row sb"><div style="min-width:0"><h2 style="margin:0">'+esc(c.name)+'</h2><div class="muted">'+fmtDate(c.start)+(c.end?' – '+fmtDate(c.end):' – sin fecha de fin')+'</div><div class="muted">'+(c.days||[]).length+' '+plural((c.days||[]).length,'día','días')+' · '+n+' '+plural(n,'sesión','sesiones')+'</div></div><span class="chip '+(act?'good':'')+'">'+(act?'Activo':'Archivado')+'</span></div>'+
        '<div class="row" style="margin-top:10px"><button class="btn primary sm" data-act="openCycle" data-id="'+c.id+'">Abrir</button><button class="btn sm" data-act="newCycle" data-from="'+c.id+'">Duplicar como nuevo ciclo</button></div></div>';
    });
  }
  h+='<div class="row" style="margin-top:8px"><button class="btn sm" data-act="newProgram">'+ic('plus')+' Nuevo programa</button></div>';
  h+='<p class="muted" style="font-size:12.5px;margin-top:14px">Cada sesión guarda su propia copia de la rutina. Cambiar o archivar un ciclo no altera lo que ya entrenaste.</p>';
  return h;
}
A.pickProgram=function(t){S.programId=t.dataset.id;render();};
A.openCycle=function(t){go('cycle',{id:t.dataset.id});};
A.newProgram=function(){
  openModal({title:'Nuevo programa',html:'<div class="fld"><label for="pg-name">Nombre</label><input id="pg-name" placeholder="Hipertrofia 2027" autocomplete="off"></div>',actions:[
    {label:'Cancelar'},
    {label:'Crear',cls:'primary',onClick:async function(){
      var name=fv('pg-name').trim();if(!name){toast('Escribe un nombre');return false;}
      var id=uid(),doc={name:name,goal:'',createdAt:new Date().toISOString()};
      try{await track(Store.set('people/'+S.pid+'/programs/'+id,doc));}catch(e){return false;}
      S.programs.push(Object.assign({id:id},doc));S.programId=id;render();
    }}]});
};
A.newCycle=function(t){
  var from=(t&&t.dataset&&t.dataset.from)||'';
  var cyc=S.cycles.slice().sort(function(a,b){return (b.start||'').localeCompare(a.start||'');});
  var src=from?S.cycles.find(function(c){return c.id===from;}):null;
  var html='<div class="fld"><label for="pc-name">Nombre del ciclo</label><input id="pc-name" value="'+esc(src?'':'Ciclo '+(S.cycles.length+1))+'" placeholder="Ciclo 2" autocomplete="off"></div>'+
    '<div class="two"><div class="fld"><label for="pc-start">Inicio</label><input id="pc-start" type="date" value="'+todayISO()+'"></div><div class="fld"><label for="pc-end">Fin (opcional)</label><input id="pc-end" type="date"></div></div>'+
    '<div class="two"><div class="fld"><label for="pc-days">Días del ciclo</label><input id="pc-days" type="number" inputmode="numeric" min="1" max="7" value="3"><span class="hint">Cuántos días entrenas por semana. Puedes cambiarlo después.</span></div>'+
    '<div class="fld"><label for="pc-copy">Copiar de</label><select id="pc-copy"><option value="">Ciclo vacío</option>'+cyc.map(function(c){return '<option value="'+c.id+'"'+(c.id===from?' selected':'')+'>'+esc(c.name)+'</option>';}).join('')+'</select></div></div>'+
    '<p class="muted" style="font-size:13px">El nuevo ciclo pasa a ser el activo. El ciclo activo actual se archiva y sus sesiones se conservan.</p>';
  openModal({title:'Nuevo ciclo',html:html,actions:[
    {label:'Cancelar'},
    {label:'Crear ciclo',cls:'primary',onClick:createCycle}],onMount:function(){
      var sel=$('#pc-copy'),d=$('#pc-days');
      var sync=function(){d.disabled=!!sel.value;};
      sel.addEventListener('change',sync);sync();
    }});
};
async function createCycle(){
  var name=fv('pc-name').trim();if(!name){toast('Escribe un nombre');return false;}
  var start=fv('pc-start')||todayISO(),end=fv('pc-end')||'';
  var copy=fv('pc-copy'),nd=Math.max(1,Math.min(7,parseInt(fv('pc-days'),10)||3));
  try{
    var progId=await ensureProgram();
    var days;
    if(copy){
      var src=S.cycles.find(function(c){return c.id===copy;});
      days=clone(src.days||[]).map(function(d){d.id=uid();d.exercises=(d.exercises||[]).map(function(e){e.id=uid();return e;});return d;});
    }else{
      days=Array.from({length:nd},function(_,i){return {id:uid(),name:'Día '+(i+1),exercises:[]};});
    }
    var actives=S.cycles.filter(function(c){return c.programId===progId&&c.status==='active';});
    for(var k=0;k<actives.length;k++){
      var cc=clone(actives[k]);cc.status='archived';if(!cc.end)cc.end=addDays(start,-1);
      var ix=S.cycles.findIndex(function(x){return x.id===cc.id;});S.cycles[ix]=cc;
      await track(Store.setQ(cyPath(cc.id),strip(cc)));
    }
    var id=uid(),doc={programId:progId,name:name,start:start,end:end,status:'active',days:days,createdAt:new Date().toISOString()};
    await track(Store.setQ(cyPath(id),doc));
    S.cycles.push(Object.assign({id:id},doc));
    go('cycle',{id:id});
  }catch(e){return false;}
}

/* ---- editor de ciclo ---- */
function cycleById(){return S.cycles.find(function(x){return x.id===S.params.id;});}
function viewCycle(){
  var c=cycleById();
  if(!c)return '<div class="card empty"><h3>No se encontró el ciclo</h3><button class="btn" data-act="go" data-v="routines">Volver</button></div>';
  var n=S.sessions.filter(function(s){return s.cycleId===c.id;}).length;
  var h='<div class="card"><div class="row sb"><div><h2 style="margin:0">'+esc(c.name)+'</h2><div class="muted">'+fmtDate(c.start)+(c.end?' – '+fmtDate(c.end):'')+' · '+n+' '+plural(n,'sesión','sesiones')+'</div></div><span class="chip '+(c.status==='active'?'good':'')+'">'+(c.status==='active'?'Activo':'Archivado')+'</span></div>'+
    '<div class="row" style="margin-top:10px"><button class="btn sm" data-act="editCycle">'+ic('edit')+' Datos del ciclo</button><button class="btn sm danger" data-act="delCycle">'+ic('trash')+' Eliminar</button></div></div>';
  (c.days||[]).forEach(function(d,i){
    h+='<div class="dayc"><div class="h"><b>Día '+(i+1)+' · '+esc(d.name)+'</b>'+
      '<button class="mini-btn" data-act="moveDay" data-d="'+i+'" data-dir="-1" aria-label="Subir día"'+(i===0?' disabled':'')+'>'+ic('up')+'</button>'+
      '<button class="mini-btn" data-act="moveDay" data-d="'+i+'" data-dir="1" aria-label="Bajar día"'+(i===c.days.length-1?' disabled':'')+'>'+ic('down')+'</button>'+
      '<button class="mini-btn" data-act="renameDay" data-d="'+i+'" aria-label="Renombrar día">'+ic('edit')+'</button>'+
      '<button class="mini-btn" data-act="delDay" data-d="'+i+'" aria-label="Eliminar día">'+ic('trash')+'</button></div>';
    var exs=d.exercises||[];
    if(!exs.length)h+='<div class="exr muted">Sin ejercicios todavía.</div>';
    exs.forEach(function(e,j){
      h+='<div class="exr"><div class="grow"><div class="n">'+esc(e.name)+'</div><div class="m">'+e.sets+'×'+e.reps+' · '+esc(UNITS[e.unit]||e.unit)+(e.section==='warmup'?' · Calentamiento':'')+(e.targetWeight!=null?' · objetivo '+numTrim(e.targetWeight):'')+'</div></div>'+
        '<button class="mini-btn" data-act="moveEx" data-d="'+i+'" data-e="'+j+'" data-dir="-1" aria-label="Subir ejercicio"'+(j===0?' disabled':'')+'>'+ic('up')+'</button>'+
        '<button class="mini-btn" data-act="moveEx" data-d="'+i+'" data-e="'+j+'" data-dir="1" aria-label="Bajar ejercicio"'+(j===exs.length-1?' disabled':'')+'>'+ic('down')+'</button>'+
        '<button class="mini-btn" data-act="editEx" data-d="'+i+'" data-e="'+j+'" aria-label="Editar ejercicio">'+ic('edit')+'</button>'+
        '<button class="mini-btn" data-act="delEx" data-d="'+i+'" data-e="'+j+'" aria-label="Quitar ejercicio">'+ic('trash')+'</button></div>';
    });
    h+='<div class="row" style="padding:10px 12px;border-top:1px solid var(--line)"><button class="btn sm" data-act="addEx" data-d="'+i+'">'+ic('plus')+' Ejercicio</button><button class="btn sm" data-act="pasteEx" data-d="'+i+'">Pegar rutina</button></div></div>';
  });
  h+='<button class="btn block" data-act="addDay">'+ic('plus')+' Agregar día</button>';
  h+='<p class="muted" style="font-size:12.5px;margin-top:14px">Los cambios aquí no alteran sesiones ya realizadas: cada sesión conserva su propia copia de los ejercicios.</p>';
  return h;
}
A.addDay=function(){mutateCycle(S.params.id,function(c){c.days.push({id:uid(),name:'Día '+(c.days.length+1),exercises:[]});});};
A.moveDay=function(t){var d=+t.dataset.d,dir=+t.dataset.dir;mutateCycle(S.params.id,function(c){var j=d+dir;if(j<0||j>=c.days.length)return;var x=c.days[d];c.days[d]=c.days[j];c.days[j]=x;});};
A.renameDay=function(t){
  var d=+t.dataset.d,c=cycleById();
  openModal({title:'Nombre del día',html:'<div class="fld"><label for="dn-name">Nombre</label><input id="dn-name" value="'+esc(c.days[d].name)+'" placeholder="Torso, Pierna, Cuerpo completo" autocomplete="off"></div>',actions:[
    {label:'Cancelar'},{label:'Guardar',cls:'primary',onClick:function(){
      var v=fv('dn-name').trim();if(!v){toast('Escribe un nombre');return false;}
      mutateCycle(S.params.id,function(cc){cc.days[d].name=v;});}}]});
};
A.delDay=async function(t){
  var d=+t.dataset.d,c=cycleById(),day=c.days[d];
  var ok=await confirmBox({title:'Eliminar día',text:'Se quitará «'+esc(day.name)+'» y sus '+(day.exercises||[]).length+' ejercicios de este ciclo. Las sesiones ya realizadas no cambian.',ok:'Eliminar',danger:true});
  if(!ok)return;
  mutateCycle(S.params.id,function(cc){cc.days.splice(d,1);});
};
A.moveEx=function(t){
  var d=+t.dataset.d,e=+t.dataset.e,dir=+t.dataset.dir;
  mutateCycle(S.params.id,function(c){var l=c.days[d].exercises,j=e+dir;if(j<0||j>=l.length)return;var x=l[e];l[e]=l[j];l[j]=x;});
};
A.delEx=function(t){var d=+t.dataset.d,e=+t.dataset.e;mutateCycle(S.params.id,function(c){c.days[d].exercises.splice(e,1);});};
function exForm(ex){
  ex=ex||{section:'main',sets:3,reps:12,unit:(P()&&P().gymUnit)||'lb'};
  var opt=function(v,l,cur){return '<option value="'+v+'"'+(cur===v?' selected':'')+'>'+l+'</option>';};
  return '<datalist id="exlib">'+S.exercises.map(function(e){return '<option value="'+esc(e.name)+'">';}).join('')+'</datalist>'+
    '<div class="fld"><label for="ex-name">Ejercicio</label><input id="ex-name" list="exlib" value="'+esc(ex.name||'')+'" placeholder="Press pecho sentado en máquina" autocomplete="off"><span class="hint">Si cambias el nombre, en Progreso se cuenta como otro ejercicio.</span></div>'+
    '<div class="two"><div class="fld"><label for="ex-sets">Series</label><input id="ex-sets" type="number" inputmode="numeric" min="1" value="'+(ex.sets||'')+'"></div><div class="fld"><label for="ex-reps">Repeticiones</label><input id="ex-reps" type="number" inputmode="numeric" min="1" value="'+(ex.reps||'')+'"></div></div>'+
    '<div class="two"><div class="fld"><label for="ex-unit">Se mide en</label><select id="ex-unit">'+opt('lb','Libras',ex.unit)+opt('kg','Kilos',ex.unit)+opt('placas','Placas de la máquina',ex.unit)+opt('sin','Sin peso (solo marcar)',ex.unit)+'</select></div>'+
    '<div class="fld"><label for="ex-sec">Parte de la sesión</label><select id="ex-sec">'+opt('main','Principal',ex.section||'main')+opt('warmup','Calentamiento',ex.section)+'</select></div></div>'+
    '<div class="two"><div class="fld"><label for="ex-tw">Peso objetivo (opcional)</label><input id="ex-tw" inputmode="decimal" value="'+esc(numTrim(ex.targetWeight))+'"></div><div class="fld"><label for="ex-rest">Descanso en segundos (opcional)</label><input id="ex-rest" type="number" inputmode="numeric" value="'+esc(ex.rest||'')+'"></div></div>'+
    '<div class="fld"><label for="ex-notes">Indicaciones del entrenador (opcional)</label><textarea id="ex-notes">'+esc(ex.notes||'')+'</textarea></div>'+
    '<div class="fld"><label for="ex-link">Enlace a técnica (opcional, https)</label><input id="ex-link" type="url" inputmode="url" value="'+esc(ex.link||'')+'"></div>';
}
async function saveEx(di,ei){
  var name=fv('ex-name').trim();if(!name){toast('Escribe el nombre del ejercicio');return false;}
  var link=fv('ex-link').trim();if(link&&!isHttps(link)){toast('El enlace debe empezar por https://');return false;}
  var old=ei==null?null:cycleById().days[di].exercises[ei];
  var eid=await resolveEid(name);
  var obj={id:old?old.id:uid(),eid:eid,name:name,section:fv('ex-sec')||'main',sets:Math.max(1,parseInt(fv('ex-sets'),10)||1),reps:Math.max(1,parseInt(fv('ex-reps'),10)||1),unit:fv('ex-unit')||'lb',targetWeight:parseNum(fv('ex-tw')),rest:parseInt(fv('ex-rest'),10)||null,notes:fv('ex-notes').trim(),link:link};
  mutateCycle(S.params.id,function(c){if(ei==null)c.days[di].exercises.push(obj);else c.days[di].exercises[ei]=obj;});
}
A.addEx=function(t){var d=+t.dataset.d;openModal({title:'Nuevo ejercicio',html:exForm(null),actions:[{label:'Cancelar'},{label:'Agregar',cls:'primary',onClick:function(){return saveEx(d,null);}}]});};
A.editEx=function(t){
  var d=+t.dataset.d,e=+t.dataset.e;
  openModal({title:'Editar ejercicio',html:exForm(cycleById().days[d].exercises[e]),actions:[{label:'Cancelar'},{label:'Guardar',cls:'primary',onClick:function(){return saveEx(d,e);}}]});
};
A.editCycle=function(){
  var c=cycleById();
  openModal({title:'Datos del ciclo',html:'<div class="fld"><label for="ce-name">Nombre</label><input id="ce-name" value="'+esc(c.name)+'" autocomplete="off"></div><div class="two"><div class="fld"><label for="ce-start">Inicio</label><input id="ce-start" type="date" value="'+esc(c.start||'')+'"></div><div class="fld"><label for="ce-end">Fin</label><input id="ce-end" type="date" value="'+esc(c.end||'')+'"></div></div><div class="fld"><label for="ce-st">Estado</label><select id="ce-st"><option value="active"'+(c.status==='active'?' selected':'')+'>Activo</option><option value="archived"'+(c.status!=='active'?' selected':'')+'>Archivado</option></select></div>',actions:[
    {label:'Cancelar'},{label:'Guardar',cls:'primary',onClick:async function(){
      var name=fv('ce-name').trim();if(!name){toast('Escribe un nombre');return false;}
      var st=fv('ce-st');
      if(st==='active'&&c.status!=='active'){
        var others=S.cycles.filter(function(x){return x.programId===c.programId&&x.status==='active'&&x.id!==c.id;});
        for(var k=0;k<others.length;k++){var o=clone(others[k]);o.status='archived';if(!o.end)o.end=addDays(fv('ce-start')||todayISO(),-1);var ix=S.cycles.findIndex(function(z){return z.id===o.id;});S.cycles[ix]=o;try{await track(Store.setQ(cyPath(o.id),strip(o)));}catch(e){return false;}}
      }
      mutateCycle(c.id,function(cc){cc.name=name;cc.start=fv('ce-start')||cc.start;cc.end=fv('ce-end')||'';cc.status=st;});
    }}]});
};
A.delCycle=async function(){
  var c=cycleById();var n=S.sessions.filter(function(s){return s.cycleId===c.id;}).length;
  var ok=await confirmBox({title:'Eliminar ciclo',text:'Se eliminará «'+esc(c.name)+'». '+(n?'Las '+n+' sesiones realizadas se conservan en el historial con su propia copia de la rutina.':'No tiene sesiones realizadas.'),ok:'Eliminar ciclo',danger:true});
  if(!ok)return;
  S.cycles=S.cycles.filter(function(x){return x.id!==c.id;});
  try{await track(Store.del(cyPath(c.id)));}catch(e){}
  go('routines');
};

/* ---- pegar rutina ---- */
function parseRoutineText(raw,defUnit){
  var lines=String(raw||'').replace(/\r/g,'').split('\n').map(function(l){return l.replace(/["\t]+/g,' ').trim();}).filter(Boolean);
  var days=[],cur=null,warm=false,count=0;
  var ensure=function(){if(!cur){cur={name:null,exercises:[]};days.push(cur);}return cur;};
  lines.forEach(function(line){
    var h=line.match(/^\*{2,}\s*(.+?)\s*\*{2,}$/);
    if(h){cur={name:h[1].trim(),exercises:[]};days.push(cur);warm=false;return;}
    if(/^calentamiento\s*:?\s*$/i.test(line)){warm=true;return;}
    var l=line;
    if(/^calentamiento\b/i.test(l)){warm=true;l=l.replace(/^calentamiento\s*:?\s*/i,'');}
    l=l.replace(/^[\*•\-–•\s]+/,'');
    var m=l.match(/(\d+)\s*[xX×]\s*(\d+)/);
    if(!m)return;
    var hasDash=/\s[-–]\s*$/.test(l.slice(0,m.index))||/[-–]\s*$/.test(l.slice(0,m.index).trim());
    var section='main';
    if(warm&&!hasDash)section='warmup';else if(hasDash)warm=false;
    var name=l.slice(0,m.index).replace(/[\s\-–:]+$/,'').trim();
    if(!name)return;
    var sets=+m[1],reps=+m[2],rest=l.slice(m.index+m[0].length).trim(),notes='';
    if(/^\d{4,}$/.test(rest)&&sets>0&&rest.length%sets===0){
      var sz=rest.length/sets,parts=[];
      for(var i=0;i<sets;i++)parts.push(rest.substr(i*sz,sz));
      notes='Ref. de la hoja: '+parts.join('/');
    }else if(rest){notes='Marca original: '+rest;}
    ensure().exercises.push({name:name,section:section,sets:sets,reps:reps,unit:section==='warmup'?'sin':defUnit,targetWeight:null,rest:null,notes:notes,link:''});
    count++;
  });
  return {days:days.filter(function(d){return d.exercises.length;}),count:count};
}
A.pasteEx=function(t){
  var d=+t.dataset.d;
  openModal({title:'Pegar rutina',html:'<p class="muted" style="margin-top:0">Pega aquí el texto de tu hoja. Cada ejercicio debe tener el formato «Nombre - 3X12». Los títulos entre *** crean un día, y las líneas bajo «Calentamiento» se marcan sin peso.</p><div class="fld"><label for="pr-text">Texto de la rutina</label><textarea id="pr-text" class="mono" placeholder="*** TORSO A1 ***&#10;Press pecho sent maq - 3X12&#10;Halon polea cerrado sent 3X12"></textarea></div><div id="pr-prev" class="muted"></div>',actions:[
    {label:'Cancelar'},{label:'Agregar',cls:'primary',onClick:async function(){
      var res=parseRoutineText(fv('pr-text'),(P()&&P().gymUnit)||'lb');
      if(!res.count){toast('No encontré ejercicios con el formato «Nombre - 3X12»');return false;}
      for(var i=0;i<res.days.length;i++)for(var j=0;j<res.days[i].exercises.length;j++){
        var e=res.days[i].exercises[j];e.eid=await resolveEid(e.name);e.id=uid();
      }
      mutateCycle(S.params.id,function(c){
        var used={};
        res.days.forEach(function(pd){
          if(pd.name){
            var k=c.days.findIndex(function(x,ix){return !(x.exercises||[]).length&&!used[ix];});
            if(k>=0){used[k]=true;c.days[k].name=pd.name;c.days[k].exercises=pd.exercises;}
            else c.days.push({id:uid(),name:pd.name,exercises:pd.exercises});
          }else{
            c.days[d].exercises=(c.days[d].exercises||[]).concat(pd.exercises);
          }
        });
      });
      toast(res.count+' '+plural(res.count,'ejercicio agregado','ejercicios agregados'));
    }}],onMount:function(){
      var ta=$('#pr-text'),pv=$('#pr-prev');
      ta.addEventListener('input',function(){
        var r=parseRoutineText(ta.value,'lb');
        pv.textContent=r.count?('Se detectaron '+r.count+' ejercicios'+(r.days.some(function(x){return x.name;})?' en '+r.days.length+' días (los días vacíos del ciclo se rellenan en orden)':'')+'.'):'';
      });
    }});
};

/* ================= Medidas ================= */
function mPath(id){return 'people/'+S.pid+'/measurements/'+id;}
function viewMeasures(){
  var ms=measSorted();
  var h='<div class="row" style="margin-bottom:12px"><button class="btn primary" data-act="newMeas">'+ic('plus')+' Nueva valoración</button><button class="btn" data-act="manageTypes">Tipos de medición</button></div>';
  if(!ms.length)return h+'<div class="card empty"><h3>Sin valoraciones</h3>Registra tu primera valoración con la fecha y los valores que tengas. Ningún campo es obligatorio.</div>';
  var groups=[];types().forEach(function(t){if(groups.indexOf(t.group)<0)groups.push(t.group);});
  groups.forEach(function(g){
    var rows=types().filter(function(t){return t.group===g;}).map(function(t){return mrowHtml(t,true);}).join('');
    if(rows)h+='<div class="sect"><h2>'+esc(groupLabel(g))+'</h2></div><div class="card" style="padding:4px 14px">'+rows+'</div>';
  });
  h+='<p class="muted" style="font-size:12.5px">Cada métrica se compara con su medición anterior que tenga ese valor, aunque sea de otra fecha.</p>';
  h+='<div class="sect"><h2>Histórico</h2></div><div class="card" style="padding:4px 14px">'+ms.slice().reverse().map(function(m){
    var n=Object.keys(m.values||{}).length;
    return '<button class="item" data-act="editMeas" data-id="'+m.id+'"><span class="grow"><b>'+fmtDate(m.date)+'</b><span class="muted">'+n+' '+plural(n,'valor','valores')+(m.notes?' · '+esc(m.notes.slice(0,40)):'')+'</span></span><span class="chip">Editar</span></button>';
  }).join('')+'</div>';
  h+='<details class="card"><summary style="min-height:44px;display:flex;align-items:center;font-weight:600">Tabla completa por fechas</summary>'+measTable(ms)+'</details>';
  return h;
}
function measTable(ms){
  var ts=types().filter(function(t){return ms.some(function(m){return m.values&&m.values[t.key]!=null;});});
  var h='<div class="tablewrap"><table class="tbl"><thead><tr><th>Medida</th>'+ms.map(function(m){return '<th>'+fmtDate(m.date)+'</th>';}).join('')+'</tr></thead><tbody>';
  ts.forEach(function(t){
    h+='<tr><td>'+esc(typeLabel(t))+'</td>'+ms.map(function(m){var v=m.values&&m.values[t.key];return '<td>'+(v==null?'':num(v,t.dec))+'</td>';}).join('')+'</tr>';
  });
  return h+'</tbody></table></div>';
}
function measForm(m){
  var vals=(m&&m.values)||{};
  var groups=[];
  var ts=types(true).filter(function(t){return t.active!==false||vals[t.key]!=null;});
  ts.forEach(function(t){if(groups.indexOf(t.group)<0)groups.push(t.group);});
  var h='<div class="fld"><label for="mv-date">Fecha</label><input id="mv-date" type="date" value="'+esc((m&&m.date)||todayISO())+'"></div>';
  groups.forEach(function(g){
    h+='<div class="grp">'+esc(groupLabel(g))+'</div><div class="mfields" style="margin-top:8px">'+ts.filter(function(t){return t.group===g;}).map(function(t){
      return '<div class="fld"><label for="mv-'+esc(t.key)+'">'+esc(t.name)+' <span>'+esc(t.unit||'')+'</span></label><input id="mv-'+esc(t.key)+'" data-key="'+esc(t.key)+'" inputmode="decimal" autocomplete="off" value="'+esc(vals[t.key]!=null?numTrim(vals[t.key]):'')+'"></div>';
    }).join('')+'</div>';
  });
  h+='<div class="fld"><label for="mv-notes">Observaciones (opcional)</label><textarea id="mv-notes">'+esc((m&&m.notes)||'')+'</textarea></div>';
  return h;
}
function measMount(){
  var peso=$('#mv-peso'),imc=$('#mv-imc'),p=P();
  if(peso&&imc&&p&&p.heightCm){
    var auto=!imc.value;
    imc.addEventListener('input',function(){auto=false;});
    peso.addEventListener('input',function(){
      var w=parseNum(peso.value);
      if(auto||!imc.value){if(w){imc.value=numTrim(+(w/Math.pow(p.heightCm/100,2)).toFixed(1));auto=true;}else if(auto)imc.value='';}
    });
  }
}
async function saveMeas(id){
  var vals={};
  $$('#modal [data-key]').forEach(function(el){var v=parseNum(el.value);if(v!=null)vals[el.dataset.key]=v;});
  if(!Object.keys(vals).length){toast('Escribe al menos un valor');return false;}
  var date=fv('mv-date');if(!date){toast('Elige la fecha');return false;}
  var old=id?S.measurements.find(function(x){return x.id===id;}):null;
  var doc={date:date,values:vals,notes:fv('mv-notes').trim(),createdAt:old?old.createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  var nid=id||uid();
  try{await track(Store.setQ(mPath(nid),doc));}catch(e){return false;}
  var i=S.measurements.findIndex(function(x){return x.id===nid;});
  if(i>=0)S.measurements[i]=Object.assign({id:nid},doc);else S.measurements.push(Object.assign({id:nid},doc));
  toast(id?'Valoración actualizada':'Valoración guardada');
  render();
}
A.newMeas=function(){
  openModal({title:'Nueva valoración',html:measForm(null),actions:[{label:'Cancelar'},{label:'Guardar',cls:'primary',onClick:function(){return saveMeas(null);}}],onMount:measMount});
};
A.editMeas=function(t){
  var m=S.measurements.find(function(x){return x.id===t.dataset.id;});if(!m)return;
  openModal({title:'Editar valoración',html:measForm(m),actions:[
    {label:'Eliminar',cls:'danger',onClick:async function(){
      var ok=await confirmBox({title:'Eliminar valoración',text:'Se eliminará la valoración del '+fmtDate(m.date)+'. No se puede deshacer.',ok:'Eliminar',danger:true});
      if(!ok)return false;
      S.measurements=S.measurements.filter(function(x){return x.id!==m.id;});
      try{await track(Store.del(mPath(m.id)));}catch(e){}
      render();
    }},
    {label:'Guardar',cls:'primary',onClick:function(){return saveMeas(m.id);}}],onMount:measMount});
};
function savePersonDoc(p){
  var i=S.people.findIndex(function(x){return x.id===p.id;});
  if(i>=0)S.people[i]=p;
  return track(Store.setQ('people/'+p.id,strip(p)));
}
A.manageTypes=function(){
  var h='<p class="muted" style="margin-top:0">Activa o desactiva las medidas que usas. Lo ya registrado se conserva aunque desactives un tipo.</p>'+types(true).map(function(t){
    return '<div class="item" style="min-height:52px"><span class="grow"><b>'+esc(dispName(t))+'</b><span class="muted">'+esc(groupLabel(t.group))+(t.unit?' · '+esc(t.unit):'')+'</span></span><button class="btn sm" data-act="editType" data-k="'+esc(t.key)+'">Editar</button><button class="btn sm" data-act="toggleType" data-k="'+esc(t.key)+'" aria-pressed="'+(t.active!==false?'true':'false')+'">'+(t.active!==false?'Activo':'Oculto')+'</button></div>';
  }).join('')+'<div style="margin-top:12px"><button class="btn" data-act="newType">'+ic('plus')+' Nuevo tipo de medición</button></div>';
  openModal({title:'Tipos de medición',html:h,actions:[{label:'Listo',cls:'primary'}]});
};
A.toggleType=function(t){
  var p=clone(P());var ty=p.types.find(function(x){return x.key===t.dataset.k;});if(!ty)return;
  ty.active=ty.active===false;savePersonDoc(p).catch(function(){});A.manageTypes();
};
function typeForm(t){
  t=t||{name:'',unit:'cm',group:'otras',dec:1,better:'neutral'};
  var o=function(v,l,c){return '<option value="'+v+'"'+(String(c)===String(v)?' selected':'')+'>'+l+'</option>';};
  return '<div class="fld"><label for="tp-name">Nombre</label><input id="tp-name" value="'+esc(t.name)+'" placeholder="Cuello" autocomplete="off"></div>'+
    '<div class="two"><div class="fld"><label for="tp-unit">Unidad</label><input id="tp-unit" value="'+esc(t.unit)+'" placeholder="cm, kg, %"></div><div class="fld"><label for="tp-dec">Decimales</label><select id="tp-dec">'+o(0,'0',t.dec)+o(1,'1',t.dec)+o(2,'2',t.dec)+'</select></div></div>'+
    '<div class="fld"><label for="tp-group">Grupo</label><select id="tp-group">'+o('composicion','Composición corporal',t.group)+o('perimetros','Perímetros (cm)',t.group)+o('otras','Otras medidas',t.group)+'</select></div>'+
    '<div class="fld"><label for="tp-better">¿Qué cambio es positivo?</label><select id="tp-better">'+o('neutral','Ninguno en particular',t.better)+o('down','Que baje',t.better)+o('up','Que suba',t.better)+'</select></div>';
}
A.newType=function(){
  openModal({title:'Nuevo tipo de medición',html:typeForm(null),actions:[{label:'Cancelar'},{label:'Crear',cls:'primary',onClick:async function(){
    var name=fv('tp-name').trim();if(!name){toast('Escribe un nombre');return false;}
    var p=clone(P());
    p.types.push({key:'k_'+uid(),name:name,group:fv('tp-group'),unit:fv('tp-unit').trim(),dec:+fv('tp-dec'),better:fv('tp-better'),active:true});
    try{await savePersonDoc(p);}catch(e){return false;}
    A.manageTypes();return false;
  }}]});
};
A.editType=function(t){
  var ty=typeByKey(t.dataset.k);if(!ty)return;
  openModal({title:'Editar tipo',html:typeForm(ty),actions:[{label:'Cancelar',onClick:function(){setTimeout(A.manageTypes,0);}},{label:'Guardar',cls:'primary',onClick:async function(){
    var name=fv('tp-name').trim();if(!name){toast('Escribe un nombre');return false;}
    var p=clone(P());var x=p.types.find(function(z){return z.key===ty.key;});
    x.name=name;x.unit=fv('tp-unit').trim();x.dec=+fv('tp-dec');x.group=fv('tp-group');x.better=fv('tp-better');
    try{await savePersonDoc(p);}catch(e){return false;}
    setTimeout(A.manageTypes,0);
  }}]});
};

/* ================= Progreso ================= */
function viewProgress(){
  var h='<div class="seg" style="margin-bottom:14px"><button class="'+(S.prog.tab==='body'?'on':'')+'" data-act="progTab" data-t="body">Cuerpo</button><button class="'+(S.prog.tab==='ex'?'on':'')+'" data-act="progTab" data-t="ex">Ejercicios</button></div>';
  return h+(S.prog.tab==='body'?progBody():progEx());
}
A.progTab=function(t){S.prog.tab=t.dataset.t;render();};
function trendText(pts,t){
  if(pts.length<3)return null;
  var x=pts.map(function(p){return dayMs(p.t)/86400000;}),y=pts.map(function(p){return p.v;});
  var span=Math.max.apply(null,x)-Math.min.apply(null,x);if(span<14)return null;
  var n=x.length,mx=x.reduce(function(a,b){return a+b;},0)/n,my=y.reduce(function(a,b){return a+b;},0)/n;
  var num_=0,den=0;for(var i=0;i<n;i++){num_+=(x[i]-mx)*(y[i]-my);den+=(x[i]-mx)*(x[i]-mx);}
  if(!den)return null;
  var perMonth=num_/den*30;
  return signed(perMonth,t.dec+1>2?2:t.dec+1)+(t.unit&&t.unit!=='nivel'?' '+t.unit:'')+' por mes (estimado, regresión lineal)';
}
function progBody(){
  var withData=types().filter(function(t){return series(t.key).length>0;});
  if(!withData.length)return '<div class="card empty"><h3>Sin datos todavía</h3>Registra al menos una valoración para ver la evolución.<div style="margin-top:12px"><button class="btn primary" data-act="newMeas">Nueva valoración</button></div></div>';
  if(!withData.find(function(t){return t.key===S.prog.a;}))S.prog.a=(withData.find(function(t){return t.key==='peso';})||withData[0]).key;
  if(S.prog.b&&(S.prog.b===S.prog.a||!withData.find(function(t){return t.key===S.prog.b;})))S.prog.b='';
  var ta=typeByKey(S.prog.a),tb=S.prog.b?typeByKey(S.prog.b):null;
  var sa=series(ta.key),sb=tb?series(tb.key):null;
  var opts=function(sel,none){return (none?'<option value="">Ninguna</option>':'')+withData.map(function(t){return '<option value="'+esc(t.key)+'"'+(t.key===sel?' selected':'')+'>'+esc(typeLabel(t))+'</option>';}).join('');};
  var h='<div class="two"><div class="fld"><label for="pg-a">Métrica</label><select id="pg-a" data-prog="a">'+opts(S.prog.a,false)+'</select></div><div class="fld"><label for="pg-b">Comparar con</label><select id="pg-b" data-prog="b">'+opts(S.prog.b,true)+'</select></div></div>';
  var ser=[{label:typeLabel(ta),cls:1,axis:'left',dec:ta.dec,unit:ta.unit,pts:sa}];
  if(sb)ser.push({label:typeLabel(tb),cls:2,axis:'right',dec:tb.dec,unit:tb.unit,pts:sb});
  h+='<div class="card">'+lineChart(ser)+'<div class="legend"><span><i style="background:var(--data1)"></i>'+esc(typeLabel(ta))+'</span>'+(tb?'<span><i style="background:var(--data2)"></i>'+esc(typeLabel(tb))+'</span>':'')+'</div></div>';
  var st=function(t,s){
    var vs=s.map(function(p){return p.v;}),first=s[0],last=s[s.length-1];
    var tr=trendText(s,t);
    return '<div class="card"><h2>'+esc(typeLabel(t))+'</h2><div class="stats"><div>Inicio ('+fmtShort(first.t)+')<b>'+num(first.v,t.dec)+'</b></div><div>Actual ('+fmtShort(last.t)+')<b>'+num(last.v,t.dec)+'</b></div><div>Cambio total<b>'+(s.length>1?'<span class="delta '+deltaClass(t,last.v-first.v)+'">'+signed(last.v-first.v,t.dec)+esc(unitTxt(t))+'</span>':'—')+'</b></div><div>Mínimo / máximo<b>'+num(Math.min.apply(null,vs),t.dec)+' / '+num(Math.max.apply(null,vs),t.dec)+'</b></div></div>'+(tr?'<p class="muted" style="margin:10px 0 0;font-size:13px">Tendencia: '+esc(tr)+'</p>':'')+
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Valor</th><th>Cambio</th></tr></thead><tbody>'+s.slice().reverse().map(function(p,i,arr){var pr=arr[i+1];return '<tr><td>'+fmtDate(p.t)+'</td><td>'+num(p.v,t.dec)+'</td><td>'+(pr?'<span class="delta '+deltaClass(t,p.v-pr.v)+'">'+signed(p.v-pr.v,t.dec)+'</span>':'—')+'</td></tr>';}).join('')+'</tbody></table></div></div>';
  };
  h+=st(ta,sa);if(tb)h+=st(tb,sb);
  return h;
}
function exerciseList(){
  var map={};
  S.sessions.forEach(function(s){(s.exercises||[]).forEach(function(ex){
    if(ex.track==='check')return;
    if(!(ex.sets||[]).some(function(x){return x.done&&x.weight!=null;}))return;
    var k=ex.eid||('n:'+norm(ex.name));
    if(!map[k])map[k]={key:k,name:ex.name,unit:ex.unit};
  });});
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.name.localeCompare(b.name,'es');});
}
function exPoints(key){
  var unit=(P()&&P().gymUnit)||'lb';
  var out=[];
  S.sessions.slice().sort(function(a,b){return (a.startedAt||a.date).localeCompare(b.startedAt||b.date);}).forEach(function(s){
    var ex=(s.exercises||[]).find(function(e){return (e.eid||('n:'+norm(e.name)))===key;});
    if(!ex||ex.track==='check')return;
    var sets=(ex.sets||[]).filter(function(x){return x.done&&x.weight!=null;});
    if(!sets.length)return;
    var massy=ex.unit==='lb'||ex.unit==='kg';
    var cv=function(w){return massy?toUnit(w,ex.unit,unit):w;};
    var max=Math.max.apply(null,sets.map(function(x){return cv(x.weight);}));
    var vol=0,e1=null;
    sets.forEach(function(x){
      if(x.reps!=null){vol+=cv(x.weight)*x.reps;var e=e1rm(cv(x.weight),x.reps);if(e!=null&&(e1==null||e>e1))e1=e;}
    });
    out.push({t:s.date,max:max,vol:vol,e1:e1,massy:massy,unit:ex.unit,sets:sets.map(function(x){return numTrim(x.weight)+(x.reps!=null?'×'+x.reps:'');}).join(' / ')});
  });
  return out;
}
function progEx(){
  var list=exerciseList();
  if(!list.length)return '<div class="card empty"><h3>Sin ejercicios registrados</h3>Cuando completes series con peso, aquí verás la evolución de cada ejercicio.</div>';
  if(!list.find(function(e){return e.key===S.prog.ex;}))S.prog.ex=list[0].key;
  var cur=list.find(function(e){return e.key===S.prog.ex;});
  var pts=exPoints(cur.key);
  var massy=pts.length&&pts[pts.length-1].massy;
  var unit=(P()&&P().gymUnit)||'lb';
  var metric=S.prog.metric;
  if(!massy&&metric!=='max')metric='max';
  if(metric==='e1'&&!pts.some(function(p){return p.e1!=null;}))metric='max';
  var label=metric==='max'?'Peso máximo':metric==='vol'?'Volumen (peso × reps)':'1RM estimado';
  var uLabel=massy?unit:(UNITS[cur.unit]||'');
  var ptsM=pts.filter(function(p){return metric==='max'||(metric==='vol'?p.vol>0:p.e1!=null);}).map(function(p){return {t:p.t,v:metric==='max'?p.max:metric==='vol'?p.vol:p.e1};});
  var dec=metric==='e1'?1:(ptsM.every(function(p){return Math.abs(p.v-Math.round(p.v))<0.05;})?0:1);
  var h='<div class="fld"><label for="pe-ex">Ejercicio</label><select id="pe-ex" data-prog="ex">'+list.map(function(e){return '<option value="'+esc(e.key)+'"'+(e.key===cur.key?' selected':'')+'>'+esc(e.name)+'</option>';}).join('')+'</select></div>';
  if(massy)h+='<div class="seg" style="margin-bottom:12px"><button class="'+(metric==='max'?'on':'')+'" data-act="exMetric" data-m="max">Peso máx.</button><button class="'+(metric==='vol'?'on':'')+'" data-act="exMetric" data-m="vol">Volumen</button><button class="'+(metric==='e1'?'on':'')+'" data-act="exMetric" data-m="e1">1RM est.</button></div>';
  h+='<div class="card"><div class="row sb"><h2 style="margin:0">'+esc(label)+'</h2><span class="chip">'+esc(uLabel)+'</span></div>'+
    (ptsM.length?lineChart([{label:label,cls:1,axis:'left',dec:dec,unit:uLabel,pts:ptsM}]):'<p class="muted">Sin datos para esta métrica.</p>')+
    (metric==='e1'?'<p class="muted" style="font-size:12.5px;margin:8px 0 0"><b>ESTIMACIÓN</b> con la fórmula de Epley (hasta 12 repeticiones). No es un 1RM medido.</p>':'')+
    (!massy?'<p class="muted" style="font-size:12.5px;margin:8px 0 0">Este ejercicio se mide en '+esc(uLabel)+', por eso no se calcula volumen ni 1RM.</p>':'')+'</div>';
  h+='<div class="card"><h2>Sesiones</h2><div class="tablewrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Series (peso×reps)</th>'+(massy?'<th>Volumen</th><th>1RM est.</th>':'')+'</tr></thead><tbody>'+
    pts.slice().reverse().map(function(p){return '<tr><td>'+fmtDate(p.t)+'</td><td>'+esc(p.sets)+'</td>'+(massy?'<td>'+(p.vol?Math.round(p.vol).toLocaleString('es-CO'):'—')+'</td><td>'+(p.e1!=null?num(p.e1,1):'—')+'</td>':'')+'</tr>';}).join('')+'</tbody></table></div></div>';
  return h;
}
A.exMetric=function(t){S.prog.metric=t.dataset.m;render();};

/* ================= Perfil ================= */
function viewProfile(){
  var p=P();
  var h='<div class="card"><h2>Datos de '+esc(p.name)+'</h2>'+personForm(p)+'<button class="btn primary block" data-act="saveProfile">Guardar cambios</button></div>';
  h+='<div class="card"><h2>Personas</h2>'+S.people.map(function(x){
    return '<button class="item" data-act="switchPerson" data-id="'+x.id+'"><span class="av" style="background:'+COLORS[(x.color||0)%COLORS.length]+'">'+esc(initial(x.name))+'</span><span class="grow"><b>'+esc(x.name)+'</b></span>'+(x.id===S.pid?'<span class="chip good">Activa</span>':'')+'</button>';
  }).join('')+'<div style="margin-top:10px"><button class="btn" data-act="newPerson">'+ic('plus')+' Agregar persona</button></div></div>';
  h+='<div class="card"><h2>Zona de riesgo</h2><p class="muted">Eliminar a '+esc(p.name)+' borra su perfil, mediciones, rutinas y sesiones. Haz antes un respaldo en Datos y respaldo.</p><button class="btn danger" data-act="delPerson">'+ic('trash')+' Eliminar esta persona</button></div>';
  return h;
}
A.saveProfile=async function(){
  var name=fv('pf-name').trim();if(!name){toast('Escribe un nombre');return;}
  var p=clone(P());p.name=name;p.heightCm=parseNum(fv('pf-h'));p.gymUnit=fv('pf-u')||'lb';
  try{await savePersonDoc(p);toast('Perfil guardado');render();}catch(e){}
};
A.delPerson=function(){
  var p=P();
  openModal({title:'Eliminar persona',html:'<p>Se eliminarán todos los datos de <b>'+esc(p.name)+'</b>: '+S.measurements.length+' valoraciones, '+S.cycles.length+' ciclos y '+S.sessions.length+' sesiones. No se puede deshacer.</p><div class="fld"><label for="dp-name">Escribe «'+esc(p.name)+'» para confirmar</label><input id="dp-name" autocomplete="off"></div>',actions:[
    {label:'Cancelar'},{label:'Eliminar todo',cls:'danger',onClick:async function(){
      if(fv('dp-name').trim()!==p.name){toast('El nombre no coincide');return false;}
      var base='people/'+p.id+'/';
      var jobs=[];
      S.measurements.forEach(function(x){jobs.push(base+'measurements/'+x.id);});
      S.exercises.forEach(function(x){jobs.push(base+'exercises/'+x.id);});
      S.programs.forEach(function(x){jobs.push(base+'programs/'+x.id);});
      S.cycles.forEach(function(x){jobs.push(base+'cycles/'+x.id);});
      S.sessions.forEach(function(x){jobs.push(base+'sessions/'+x.id);});
      jobs.push('people/'+p.id);
      try{for(var i=0;i<jobs.length;i++){await Store.del(jobs[i]);}}catch(e){toast('No se pudo eliminar todo. Revisa tus permisos.');return false;}
      S.people=S.people.filter(function(x){return x.id!==p.id;});
      attachPerson((S.people[0]||{}).id||null);
      toast('Persona eliminada');go('home');
    }}]});
};

/* ================= Datos: exportar, importar, compartir ================= */
async function collectPerson(pid){
  var b='people/'+pid+'/';
  var r=await Promise.all(['measurements','exercises','programs','cycles','sessions'].map(function(c){return Store.getCol(b+c);}));
  var person=S.people.find(function(p){return p.id===pid;});
  return {id:pid,person:strip(person),measurements:r[0],exercises:r[1],programs:r[2],cycles:r[3],sessions:r[4]};
}
async function collectScope(scope){
  var ids=scope==='all'?S.people.map(function(p){return p.id;}):[S.pid];
  var out=[];for(var i=0;i<ids.length;i++)out.push(await collectPerson(ids[i]));
  return out;
}
function csvCell(v){
  if(v==null)return '';
  var s=String(v);if(typeof v==='number')s=s.replace('.',',');
  return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
}
function toCSV(rows){return '﻿'+rows.map(function(r){return r.map(csvCell).join(';');}).join('\r\n');}
function measRows(data){
  var rows=[['Persona','Fecha','Métrica','Unidad','Valor','Observaciones']];
  data.forEach(function(d){
    var ts={};(d.person.types||[]).forEach(function(t){ts[t.key]=t;});
    d.measurements.slice().sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(m){
      Object.keys(m.values||{}).forEach(function(k){var t=ts[k]||{name:k,unit:''};rows.push([d.person.name,m.date,t.name,t.unit||'',m.values[k],m.notes||'']);});
    });
  });
  return rows;
}
function setRows(data){
  var rows=[['Persona','Fecha','Ciclo','Día','Ejercicio','Sección','Serie','Peso','Unidad','Repeticiones','Completada','RPE','RIR','Nota del ejercicio','Notas de la sesión']];
  data.forEach(function(d){
    d.sessions.slice().sort(function(a,b){return (a.startedAt||a.date)<(b.startedAt||b.date)?-1:1;}).forEach(function(s){
      (s.exercises||[]).forEach(function(ex){
        if(ex.track==='check'){rows.push([d.person.name,s.date,s.cycleName||'',s.dayName||'',ex.name,ex.section==='warmup'?'Calentamiento':'Principal','','','','',ex.done?'Sí':'No','','',ex.note||'',s.notes||'']);return;}
        (ex.sets||[]).forEach(function(x){rows.push([d.person.name,s.date,s.cycleName||'',s.dayName||'',ex.name,ex.section==='warmup'?'Calentamiento':'Principal',x.n,x.weight,UNITS[ex.unit]||'',x.reps,x.done?'Sí':'No',x.rpe,x.rir,ex.note||'',s.notes||'']);});
      });
    });
  });
  return rows;
}
function sessRows(data){
  var rows=[['Persona','Fecha','Ciclo','Día','Estado','Ejercicios completados','Ejercicios totales','Volumen','Unidad del volumen','Duración (min)','Notas']];
  data.forEach(function(d){
    d.sessions.slice().sort(function(a,b){return (a.startedAt||a.date)<(b.startedAt||b.date)?-1:1;}).forEach(function(s){
      var st=sessionStats(s,d.person.gymUnit||'lb');
      var m=s.startedAt&&s.endedAt?Math.round((new Date(s.endedAt)-new Date(s.startedAt))/60000):'';
      rows.push([d.person.name,s.date,s.cycleName||'',s.dayName||'',s.status==='done'?'Terminada':'En curso',st.done,st.total,st.volSets?Math.round(st.volume):'',st.volUnit,m,s.notes||'']);
    });
  });
  return rows;
}
function wideRows(d){
  var ts=(d.person.types||[]).filter(function(t){return d.measurements.some(function(m){return m.values&&m.values[t.key]!=null;});});
  var rows=[['Fecha'].concat(ts.map(typeLabel)).concat(['Observaciones'])];
  d.measurements.slice().sort(function(a,b){return a.date<b.date?-1:1;}).forEach(function(m){
    rows.push([m.date].concat(ts.map(function(t){return m.values&&m.values[t.key]!=null?m.values[t.key]:'';})).concat([m.notes||'']));
  });
  return rows;
}
function stamp(){return todayISO();}
async function doExport(kind){
  var scope=fv('dx-scope')||'one';
  try{
    var data=await collectScope(scope);
    var who=scope==='all'?'familia':norm(data[0].person.name).replace(/\s+/g,'-');
    if(kind==='json'){
      var payload={app:APP_TAG,version:1,exportedAt:new Date().toISOString(),people:data};
      await saveFile('entreno-respaldo-'+who+'-'+stamp()+'.json',JSON.stringify(payload,null,1),'application/json');
    }else if(kind==='csv-meas'){
      await saveFile('entreno-mediciones-'+who+'-'+stamp()+'.csv',toCSV(measRows(data)),'text/csv');
    }else if(kind==='csv-sets'){
      await saveFile('entreno-series-'+who+'-'+stamp()+'.csv',toCSV(setRows(data)),'text/csv');
    }else if(kind==='xlsx'){
      var X=await loadSheetJS();
      var wb=X.utils.book_new();
      var add=function(name,rows){X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),name);};
      if(data.length===1)add('Mediciones (ancho)',wideRows(data[0]));
      add('Mediciones',measRows(data));add('Series',setRows(data));add('Sesiones',sessRows(data));
      var out=X.write(wb,{bookType:'xlsx',type:'array'});
      await saveFile('entreno-'+who+'-'+stamp()+'.xlsx',new Blob([out],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    }
  }catch(e){toast(kind==='xlsx'?'No se pudo generar el Excel. Usa los CSV.':'No se pudo exportar.');}
}
var sheetJSP=null;
function loadSheetJS(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(sheetJSP)return sheetJSP;
  sheetJSP=new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload=function(){window.XLSX?res(window.XLSX):rej(new Error('xlsx'));};
    s.onerror=function(){sheetJSP=null;rej(new Error('xlsx'));};
    document.head.appendChild(s);
  });
  return sheetJSP;
}
A.export=function(t){doExport(t.dataset.k);};

var importData=null;
function viewData(){
  var h='<div class="card"><h2>Exportar y respaldar</h2><p class="muted" style="margin-top:0">El archivo JSON es la copia completa y sirve para restaurar la app en otra cuenta. CSV y Excel son para abrir los datos en una hoja de cálculo.</p>'+
    '<div class="fld"><label for="dx-scope">¿De quién?</label><select id="dx-scope"><option value="one">Solo '+esc(P()?P().name:'la persona activa')+'</option><option value="all">Toda la familia</option></select></div>'+
    '<div class="stack"><button class="btn primary block" data-act="export" data-k="json">'+ic('data')+' Respaldo completo (JSON)</button>'+
    '<button class="btn block" data-act="export" data-k="xlsx">'+ic('data')+' Excel (.xlsx)</button>'+
    '<button class="btn block" data-act="export" data-k="csv-meas">'+ic('data')+' CSV de mediciones</button>'+
    '<button class="btn block" data-act="export" data-k="csv-sets">'+ic('data')+' CSV de series de entrenamiento</button></div>'+
    '<p class="muted" style="font-size:12.5px;margin-bottom:0">Los CSV usan punto y coma y coma decimal, como el Excel en español.</p></div>';
  h+='<div class="card"><h2>Importar respaldo</h2><p class="muted" style="margin-top:0">Carga un archivo JSON exportado desde esta app. Lo importado se suma a lo que ya tienes, y si un registro ya existe se actualiza. Nunca se borra nada.</p>'+
    '<div class="fld"><label for="im-file">Archivo JSON</label><input id="im-file" type="file" accept=".json,application/json"></div>'+
    '<div class="fld"><label for="im-text">O pega el contenido aquí</label><textarea id="im-text" class="mono" placeholder="{ &quot;app&quot;: &quot;entreno-familiar&quot; ... }"></textarea></div>'+
    '<button class="btn block" data-act="importReview">Revisar importación</button></div>';
  var cfgUrl=!!((window.JULYAPP_CONFIG||{}).scriptUrl);
  h+='<div class="card"><h2>Conexión con la hoja de Google</h2>'+
    (Store.mode==='sheet'?'<p style="margin-top:0">'+(Store.pullError?'<b>Sin conexión ahora.</b> ':'<b>Conectada.</b> ')+'Los datos se guardan en tu hoja de Drive y los tres perfiles comparten la misma base. Pendientes por enviar: '+Store.outbox.length+'.</p>':'<p style="margin-top:0"><b>Sin conectar.</b> Pega la URL del script (termina en /exec) para guardar en la hoja y compartir con la familia.</p>')+
    (cfgUrl?'<p class="muted">La URL viene del archivo config.js y tiene prioridad sobre lo que pegues aquí.</p>':'')+
    '<div class="fld"><label for="cn-url">URL del script</label><input id="cn-url" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/.../exec" value="'+esc(lsGet(LS_URL)||'')+'"></div>'+
    '<div class="fld"><label for="cn-key">Clave (opcional)</label><input id="cn-key" type="text" autocomplete="off" placeholder="Solo si la configuraste en el script" value="'+esc(lsGet(LS_KEY)||'')+'"></div>'+
    '<div class="stack"><button class="btn primary block" data-act="saveConn">Guardar y conectar</button><button class="btn block" data-act="testConn">Probar conexión</button></div><div id="cn-res" class="muted" style="margin-top:8px"></div></div>';
  h+='<div class="card"><h2>Compartir con la familia</h2><p style="margin-top:0">Cada persona abre el mismo enlace de la app en su celular, la instala en la pantalla de inicio y elige su perfil arriba a la derecha. Todos usan la misma hoja de Google.</p><p class="muted" style="margin-bottom:0">No hay contraseña por perfil. Quien tenga el enlace de la app y la URL del script puede leer y escribir los datos: no lo compartas fuera de la familia.</p></div>';
  return h;
}
A.saveConn=function(){
  var u=fv('cn-url').trim(),k=fv('cn-key').trim();
  if(u&&!isHttps(u)){toast('La URL debe empezar por https://');return;}
  try{if(u)localStorage.setItem(LS_URL,u);else localStorage.removeItem(LS_URL);if(k)localStorage.setItem(LS_KEY,k);else localStorage.removeItem(LS_KEY);}catch(e){toast('Este navegador no permite guardar la configuración');return;}
  toast(u?'Conectando…':'Desconectado: modo local');
  setTimeout(function(){location.reload();},500);
};
A.testConn=async function(){
  var u=fv('cn-url').trim()||Store.url,k=fv('cn-key').trim()||Store.key,res=$('#cn-res');
  if(!isHttps(u)){res.textContent='Pega primero la URL del script (https://…/exec).';return;}
  res.textContent='Probando…';
  try{
    var r=await fetch(u,{method:'POST',body:JSON.stringify({action:'ping',key:k}),redirect:'follow'});
    var j=await r.json();
    res.textContent=j&&j.ok?'Conexión correcta. Versión del script: '+(j.version||'?')+'.':'El script respondió con error: '+((j&&j.message)||(j&&j.error)||'desconocido');
  }catch(e){res.textContent='No se pudo conectar. Revisa la URL y que el acceso del despliegue sea "Cualquier usuario".';}
};
A.importReview=function(){
  var txt=fv('im-text').trim();
  if(!txt){toast('Elige un archivo o pega el contenido');return;}
  var obj;
  try{obj=JSON.parse(txt);}catch(e){toast('El texto no es un JSON válido');return;}
  if(!obj||obj.app!==APP_TAG||!Array.isArray(obj.people)){toast('Este archivo no es un respaldo de Entreno Familiar');return;}
  importData=obj;
  var lines=obj.people.map(function(d){
    return '<li><b>'+esc((d.person&&d.person.name)||'Sin nombre')+'</b>: '+(d.measurements||[]).length+' valoraciones, '+(d.cycles||[]).length+' ciclos, '+(d.sessions||[]).length+' sesiones</li>';
  }).join('');
  openModal({title:'Importar respaldo',html:'<p>Exportado el '+esc((obj.exportedAt||'').slice(0,10))+'. Se importarán:</p><ul>'+lines+'</ul><p class="muted">Si un registro ya existe, se actualiza con el del archivo. No se borra nada.</p><div id="im-prog" class="muted"></div>',actions:[
    {label:'Cancelar'},{label:'Importar',cls:'primary',onClick:runImport}]});
};
async function writeRetry(path,data){
  for(var k=0;k<4;k++){
    try{await Store.set(path,data);return;}
    catch(e){if(e&&e.code==='resource_exhausted'&&k<3){await sleep(1000*(k+1));continue;}throw e;}
  }
}
async function runImport(){
  var obj=importData;if(!obj)return;
  var jobs=[];
  obj.people.forEach(function(d){
    if(!d.id||!d.person)return;
    var b='people/'+d.id+'/';
    jobs.push([ 'people/'+d.id,d.person ]);
    [['measurements','measurements'],['exercises','exercises'],['programs','programs'],['cycles','cycles'],['sessions','sessions']].forEach(function(k){
      (d[k[1]]||[]).forEach(function(x){if(!x.id)return;jobs.push([b+k[0]+'/'+x.id,strip(x)]);});
    });
  });
  var prog=$('#im-prog');
  try{
    for(var i=0;i<jobs.length;i++){
      await writeRetry(jobs[i][0],jobs[i][1]);
      if(prog&&i%10===0)prog.textContent='Importando… '+(i+1)+' de '+jobs.length;
    }
  }catch(e){toast('La importación se detuvo. Revisa tus permisos y vuelve a intentarlo.');return false;}
  importData=null;
  toast('Importación terminada');
  if(!S.pid&&obj.people[0])attachPerson(obj.people[0].id);
  go('home');
}

/* ================= Conexión de datos y arranque ================= */
function attachPerson(pid){
  flushLive();
  S.subs.forEach(function(u){try{u();}catch(e){}});S.subs=[];
  S.pid=pid;S.measurements=[];S.exercises=[];S.programs=[];S.cycles=[];S.sessions=[];S.live=null;S.programId=null;S.prev={};S.det={};
  if(pid){
    lsSet(LS_PERSON,pid);
    var b='people/'+pid+'/';
    ['measurements','exercises','programs','cycles','sessions'].forEach(function(k){
      S.subs.push(Store.sub(b+k,function(list){S[k]=list;scheduleRender();},function(){toast('No se pudo leer '+k);}));
    });
  }
}
function onPeople(list,meta){
  S.people=list.slice().sort(function(a,b){return (a.createdAt||'').localeCompare(b.createdAt||'');});
  if(meta&&meta.fromCache===false){S.ready=true;S.offlineNote=false;clearTimeout(S.offT);}
  var pid=S.pid;
  if(S.pendingPid&&S.people.some(function(p){return p.id===S.pendingPid;}))S.pendingPid=null;
  if(!pid||(!S.people.some(function(p){return p.id===pid;})&&pid!==S.pendingPid)){
    var stored=lsGet(LS_PERSON);
    var pick=S.people.find(function(p){return p.id===stored;})||S.people[0];
    pid=pick?pick.id:null;
  }
  if(pid!==S.pid)attachPerson(pid);
  scheduleRender();
}
A.go=function(t){go(t.dataset.v);};
A.back=function(){
  flushLive();
  var target=S.params.back||BACK[S.view]||'home';
  if(S.view==='session')S.live=null;
  go(target);
};
A.closeModal=function(){closeModal();};

document.addEventListener('click',function(e){
  var m=e.target.closest('[data-mact]');
  if(m){
    var a=modalActions[+m.dataset.mact];
    if(!a)return;
    var r=a.onClick?a.onClick():undefined;
    if(r&&typeof r.then==='function'){r.then(function(v){if(v!==false)closeModal();});}
    else if(r!==false)closeModal();
    return;
  }
  var t=e.target.closest('[data-act]');
  if(!t)return;
  var fn=A[t.dataset.act];
  if(fn){e.preventDefault();fn(t,e);}
});
document.addEventListener('input',function(e){
  var el=e.target;
  if(S.view==='session'&&S.live&&el.dataset&&el.dataset.bind)onLiveInput(el);
});
document.addEventListener('change',function(e){
  var el=e.target;
  if(el.dataset&&el.dataset.prog){S.prog[el.dataset.prog]=el.value;render();return;}
  if(el.id==='im-file'&&el.files&&el.files[0]){
    var fr=new FileReader();
    fr.onload=function(){var ta=$('#im-text');if(ta)ta.value=String(fr.result||'');toast('Archivo leído. Pulsa Revisar importación.');};
    fr.onerror=function(){toast('No se pudo leer el archivo');};
    fr.readAsText(el.files[0]);
  }
});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!$('#modal').hidden)closeModal();});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flushLive();});
window.addEventListener('pagehide',function(){flushLive();});

A.retry=function(){Store.pull();};
async function boot(){
  render();
  await Store.init();
  Store.onStatus=function(){scheduleRender();};
  Store.sub('people',onPeople,function(){});
}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')Store.pull();});
window.addEventListener('online',function(){Store.pull();});
boot();
window.JulyApp={S:S,Store:Store,parseRoutineText:parseRoutineText};
})();
