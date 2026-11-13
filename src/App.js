import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import {
  collection, doc, setDoc, getDoc, getDocs,
  deleteDoc, onSnapshot
} from 'firebase/firestore';
 

// ─── WhatsApp formatter ───────────────────────────────────────────────────────
function formatForWhatsApp(text, machineName, dateLabel) {
  const lines = text.split('\n');
  const out = [];
  out.push('🚧 *MACHINE HOURS REPORT*');
  if (machineName) out.push('🔧 Machine: *' + machineName + '*');
  if (dateLabel)   out.push('📅 Period: ' + dateLabel);
  out.push('');
  lines.forEach(line => {
    const t = line.trim();
    if (!t) { out.push(''); return; }
    if (/^1\.\s+Daily/i.test(t))   { out.push('━━━━━━━━━━━━━━━━━━━━'); out.push('📋 *DAILY REPORT*');  out.push('━━━━━━━━━━━━━━━━━━━━'); return; }
    if (/^2\.\s+Weekly/i.test(t))  { out.push(''); out.push('━━━━━━━━━━━━━━━━━━━━'); out.push('📊 *WEEKLY REPORT*'); out.push('━━━━━━━━━━━━━━━━━━━━'); return; }
    if (/^3\.\s+Overall/i.test(t)) { out.push(''); out.push('━━━━━━━━━━━━━━━━━━━━'); out.push('💬 *SUMMARY*');       out.push('━━━━━━━━━━━━━━━━━━━━'); return; }
    if (/^Week\s+\d+/i.test(t))    { out.push(''); out.push('📆 *' + t + '*'); return; }
    if (t.startsWith('####'))      { const l = t.replace(/^#+\s*/,''); const icon = l.toLowerCase().includes('night')?'🌙':l.toLowerCase().includes('total')?'📈':'☀️'; out.push(icon+' *'+l+'*'); return; }
    if (t.startsWith('•'))         { const isNW=t.includes('NO WORK'); out.push((isNW?'❌ ':'  · ')+t.replace('• ','').replace(/(\d+h)/g,'*$1*')); return; }
    if (/^Total Day Shift:/i.test(t))    { out.push('✅ *'+t+'*'); return; }
    if (/^Total Night Shift:/i.test(t))  { out.push('✅ *'+t+'*'); return; }
    if (/^Combined Week Total:/i.test(t)){ out.push('🏆 *'+t+'*'); return; }
    if (/^Total|^Combined/i.test(t))     { out.push('✅ *'+t+'*'); return; }
    if (t === '---') { out.push(''); return; }
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(t)) { out.push(''); out.push('📅 *'+t+'*'); return; }
    if (/^Day Shift:|^Night Shift:/.test(t)) { const icon=t.startsWith('Day')?'☀️':'🌙'; out.push(icon+' '+t.replace(/Billed:\s*(\d+h)/,'Billed: *$1*')); return; }
    if (/No Work/i.test(t)) { out.push('❌ '+t); return; }
    out.push(t);
  });
  out.push('');
  out.push('_Sent from Machine Hours Tracker_');
  return out.join('\n');
}

// ─── Report renderer ──────────────────────────────────────────────────────────
function ReportView({ text, C }) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]; const trim = line.trim();
    if (/^\d+\.\s+(Daily|Weekly|Overall)/i.test(trim)) {
      const num = trim.match(/^(\d+)/)[1];
      const accent = { '1': C.blue, '2': C.green, '3': C.amber }[num] || C.blue;
      elements.push(<div key={i} style={{ background: accent+'18', border: '1px solid '+accent+'44', borderRadius: 10, padding: '10px 14px', marginTop: 16, marginBottom: 8 }}><span style={{ fontSize: 16, fontWeight: 700, color: accent }}>{trim}</span></div>);
      i++; continue;
    }
    if (/^Week\s+\d+/i.test(trim)) {
      elements.push(<div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 12, marginBottom: 6 }}>{trim}</div>);
      i++; continue;
    }
    if (trim.startsWith('####')) {
      const label = trim.replace(/^#+\s*/,'');
      const isNight = label.toLowerCase().includes('night');
      elements.push(<div key={i} style={{ fontSize: 12, fontWeight: 700, color: isNight ? C.amber : C.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10, marginBottom: 4 }}>{isNight ? '🌙 ' : '☀️ '}{label}</div>);
      i++; continue;
    }
    if (trim.startsWith('•')) {
      const isNW = trim.includes('NO WORK');
      const parts = trim.replace('• ','').split(': ');
      const dayPart = parts[0]||''; const rest = parts.slice(1).join(': ');
      elements.push(<div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 10px', borderRadius:6, marginBottom:3, background:C.bg }}><span style={{ fontSize:13, color:C.muted, minWidth:90 }}>{dayPart}</span><span style={{ fontSize:13, fontWeight:600, color:isNW?C.red:C.text }}>{rest||'NO WORK'}</span></div>);
      i++; continue;
    }
    if (/^Total|^Combined/i.test(trim)) {
      const [label,val] = trim.split(': ');
      elements.push(<div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 10px', borderRadius:6, background:C.blue+'14', marginBottom:6, marginTop:2 }}><span style={{ fontSize:13, fontWeight:600, color:C.text }}>{label}</span><span style={{ fontSize:14, fontWeight:700, color:C.blue }}>{val}</span></div>);
      i++; continue;
    }
    if (trim === '---') { elements.push(<hr key={i} style={{ border:'none', borderTop:'1px solid '+C.border, margin:'12px 0' }} />); i++; continue; }
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(trim)) {
      elements.push(<div key={i} style={{ fontSize:13, fontWeight:700, color:C.text, marginTop:10, marginBottom:4, borderLeft:'3px solid '+C.blue, paddingLeft:8 }}>{trim}</div>);
      i++; continue;
    }
    if (/^\s*(Day Shift|Night Shift):/.test(line)) {
      const parts = trim.split('|');
      elements.push(<div key={i} style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'4px 8px 4px 12px', marginBottom:3 }}>{parts.map((p,pi)=>{ const [k,v]=p.trim().split(':'); const isBilled=k&&k.trim()==='Billed'; return <span key={pi} style={{ fontSize:12, color:isBilled?C.green:C.muted }}><strong style={{ color:isBilled?C.green:C.text }}>{k?k.trim():''}</strong>{v?': '+v.trim():''}</span>; })}</div>);
      i++; continue;
    }
    if (/No Work/i.test(trim) && trim.length > 0) { elements.push(<div key={i} style={{ fontSize:12, color:C.red, padding:'4px 8px 4px 12px', marginBottom:3 }}>{trim}</div>); i++; continue; }
    if (trim.length > 0) elements.push(<p key={i} style={{ fontSize:14, color:C.text, lineHeight:1.65, margin:'4px 0' }}>{trim}</p>);
    i++;
  }
  return <div style={{ padding:'4px 0' }}>{elements}</div>;
}

// ─── Theme colours ────────────────────────────────────────────────────────────
const DARK = { bg:'#0f172a', surface:'#1e293b', border:'#334155', text:'#e2e8f0', muted:'#94a3b8', dim:'#475569', blue:'#3b82f6', green:'#22c55e', red:'#ef4444', amber:'#f59e0b', badgeGreenBg:'#14532d', badgeGreenText:'#86efac', badgeRedBg:'#7f1d1d', badgeRedText:'#fca5a5', badgeBlueBg:'#1e3a5f', badgeBlueText:'#93c5fd', offlineBg:'#160f00' };
const LIGHT = { bg:'#f1f5f9', surface:'#ffffff', border:'#e2e8f0', text:'#0f172a', muted:'#475569', dim:'#94a3b8', blue:'#2563eb', green:'#16a34a', red:'#dc2626', amber:'#d97706', badgeGreenBg:'#dcfce7', badgeGreenText:'#166534', badgeRedBg:'#fee2e2', badgeRedText:'#991b1b', badgeBlueBg:'#dbeafe', badgeBlueText:'#1e40af', offlineBg:'#fef9c3' };

function makeStyles(C) {
  return {
    app:   { minHeight:'100vh', background:C.bg, color:C.text, fontFamily:"'Inter', system-ui, sans-serif", paddingBottom:88 },
    hdr:   { background:C.surface, borderBottom:'1px solid '+C.border, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 },
    nav:   { position:'fixed', bottom:0, left:0, right:0, background:C.surface, borderTop:'1px solid '+C.border, display:'flex', zIndex:100 },
    page:  { padding:'0 16px 16px' },
    card:  { background:C.surface, borderRadius:12, padding:16, marginBottom:12, border:'1px solid '+C.border },
    row:   { display:'flex', gap:8 },
    flex:  { display:'flex', alignItems:'center', justifyContent:'space-between' },
    label: { fontSize:12, color:C.muted, marginBottom:4, display:'block' },
    tag:   { fontSize:11, color:C.dim },
    input: { width:'100%', padding:'10px 12px', background:C.bg, border:'1px solid '+C.border, borderRadius:8, color:C.text, fontSize:14, boxSizing:'border-box', marginBottom:10, fontFamily:'inherit' },
    btn: function(v) {
      const bg = v==='primary'?C.blue:v==='danger'?C.red:v==='success'?C.green:C.border;
      return { padding:'12px 16px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, fontSize:14, background:bg, color:'#fff', width:'100%', marginBottom:8, fontFamily:'inherit' };
    },
    navBtn: function(active) {
      return { flex:1, padding:'10px 4px 8px', background:'none', border:'none', color:active?C.blue:C.dim, fontSize:10, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontFamily:'inherit' };
    },
    badge: function(color) {
      const bg   = color==='green'?C.badgeGreenBg :color==='red'?C.badgeRedBg :C.badgeBlueBg;
      const text = color==='green'?C.badgeGreenText:color==='red'?C.badgeRedText:C.badgeBlueText;
      return { display:'inline-block', padding:'3px 9px', borderRadius:99, fontSize:11, fontWeight:600, background:bg, color:text };
    },
    billedBox: { padding:'10px 12px', background:C.bg, border:'1px solid '+C.border, borderRadius:8, fontSize:14, color:C.green, marginBottom:10, textAlign:'center' },
  };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShort(dateStr) { const d=new Date(dateStr+'T00:00:00'); return DAY_ABBR[d.getDay()]+' '+d.getDate()+' '+MON_ABBR[d.getMonth()]; }
function fmtLong(dateStr)  { const d=new Date(dateStr+'T00:00:00'); return DAY_ABBR[d.getDay()]+', '+d.getDate()+' '+MON_ABBR[d.getMonth()]+' '+d.getFullYear(); }
function datesBetween(from, to) { const list=[]; const cur=new Date(from+'T00:00:00'); const end=new Date(to+'T00:00:00'); while(cur<=end){list.push(cur.toISOString().slice(0,10));cur.setDate(cur.getDate()+1);} return list; }
function todayStr() { return new Date().toISOString().slice(0,10); }
function calcBilled(start, end) { const diff=parseFloat(end)-parseFloat(start); if(!diff||diff<=0)return 0; return Math.round(diff); }
function addDays(dateStr, n) { const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

// ─── Quick week distributor ───────────────────────────────────────────────────
// Splits (endOdo - startOdo) equally across 12 shifts (6 days × 2 shifts).
// nightStart = true  → each day: Night first, then Day
// nightStart = false → each day: Day first, then Night
function buildQuickDays(startDate, startOdo, endOdo, nightStart) {
  const total = parseFloat(endOdo) - parseFloat(startOdo);
  const perShift = total / 12;
  let odo = parseFloat(startOdo);
  const days = [];
  for (let i = 0; i < 6; i++) {
    const date = addDays(startDate, i);
    let dayStart, dayEnd, nStart, nEnd;
    if (nightStart) {
      nStart   = odo.toFixed(1);           odo += perShift;
      nEnd     = odo.toFixed(1);
      dayStart = odo.toFixed(1);           odo += perShift;
      dayEnd   = odo.toFixed(1);
    } else {
      dayStart = odo.toFixed(1);           odo += perShift;
      dayEnd   = odo.toFixed(1);
      nStart   = odo.toFixed(1);           odo += perShift;
      nEnd     = odo.toFixed(1);
    }
    days.push({ date, dayStart, dayEnd, nightStart: nStart, nightEnd: nEnd, noWork: false, noWorkReason: '' });
  }
  return days;
}

// ─── Weekly section builder ───────────────────────────────────────────────────
// nightStart = true  → Night Shifts section appears before Day Shifts in each week
// nightStart = false → Day Shifts first (default)
function buildWeeklySection(entries, nightStart = false) {
  const sorted = [...entries].sort((a,b)=>a.date.localeCompare(b.date));
  const weeks = [];
  for (let i=0;i<sorted.length;i+=6) weeks.push(sorted.slice(i,i+6));
  let out = '2. Weekly Report\n\n';
  weeks.forEach((week,wi) => {
    out += 'Week '+(wi+1)+' ('+fmtShort(week[0].date)+' – '+fmtShort(week[week.length-1].date)+')\n\n';

    // Build both shift blocks independently first, so totals are always correct
    let dt = 0;
    let dayBlock = '#### Day Shifts\n';
    week.forEach(e=>{
      if(e.noWork){ dayBlock+='• '+fmtShort(e.date)+': NO WORK\n'; return; }
      const b=calcBilled(e.dayStart,e.dayEnd); dt+=b;
      dayBlock+='• '+fmtShort(e.date)+': '+b+'h ('+e.dayStart+' → '+e.dayEnd+')\n';
    });
    dayBlock += '\nTotal Day Shift: '+dt+'h\n';

    let nt = 0;
    let nightBlock = '#### Night Shifts\n';
    week.forEach(e=>{
      if(e.noWork){ nightBlock+='• '+fmtShort(e.date)+': NO WORK\n'; return; }
      const b=calcBilled(e.nightStart,e.nightEnd); nt+=b;
      nightBlock+='• '+fmtShort(e.date)+': '+b+'h ('+e.nightStart+' → '+e.nightEnd+')\n';
    });
    nightBlock += '\nTotal Night Shift: '+nt+'h\n';

    // Order depends on how the week started
    if (nightStart) {
      out += nightBlock + dayBlock;
    } else {
      out += dayBlock + nightBlock;
    }

    out += '#### Weekly Totals\n• Day Shift: '+dt+'h\n• Night Shift: '+nt+'h\n• Combined Week Total: '+(dt+nt)+'h\n\n---\n\n';
  });
  return out;
}

function buildDailySection(entries) {
  const sorted=[...entries].sort((a,b)=>a.date.localeCompare(b.date));
  let out='1. Daily Report\n\n';
  sorted.forEach(e=>{
    out+=fmtLong(e.date)+'\n';
    if(e.noWork){out+='  No Work—'+(e.noWorkReason||'No reason given')+'\n\n';return;}
    const dA=((parseFloat(e.dayEnd)||0)-(parseFloat(e.dayStart)||0)).toFixed(1);
    const dB=calcBilled(e.dayStart,e.dayEnd);
    const nA=((parseFloat(e.nightEnd)||0)-(parseFloat(e.nightStart)||0)).toFixed(1);
    const nB=calcBilled(e.nightStart,e.nightEnd);
    out+='  Day Shift:   Start '+(e.dayStart||'—')+'  End '+(e.dayEnd||'—')+'  |  Actual: '+dA+'h  |  Billed: '+dB+'h\n';
    out+='  Night Shift: Start '+(e.nightStart||'—')+'  End '+(e.nightEnd||'—')+'  |  Actual: '+nA+'h  |  Billed: '+nB+'h\n\n';
  });
  return out;
}

async function generateReport(entries, machine, dateLabel, nightStart = false) {
  const dailySection  = buildDailySection(entries);
  const weeklySection = buildWeeklySection(entries, nightStart);
  const noWorkDays = entries.filter(e=>e.noWork).length;
  const totalDayH  = entries.reduce((s,e)=>s+calcBilled(e.dayStart,e.dayEnd),0);
  const totalNightH= entries.reduce((s,e)=>s+calcBilled(e.nightStart,e.nightEnd),0);
  const prompt =
    'You are generating a machine hours report for '+machine.name+'. Period: '+dateLabel+'.\n\n'+
    'Output the report in EXACTLY three numbered sections.\n\n'+
    'SECTION 1 and SECTION 2 are pre-built below — copy them character-for-character, do not alter any number, date, arrow, bullet or heading.\n\n'+
    dailySection+'\n'+weeklySection+
    '3. Overall Summary\n'+
    'Write exactly 2–3 sentences. Facts: total day hours = '+totalDayH+'h, total night hours = '+totalNightH+'h, combined = '+(totalDayH+totalNightH)+'h, no-work days = '+noWorkDays+'. Note patterns. Be concise and professional. Do not repeat section headings.';
  const res = await fetch('/api/generate',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ messages:[{role:'user',content:prompt}], max_tokens:2400 }) });
  if(!res.ok) throw new Error('API error '+res.status);
  const data = await res.json();
  const text = data.content?.[0]?.text||'';
  if(!text) throw new Error('Empty response from AI');
  return text;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {

  // ── Theme
  const [isDark, setIsDark] = useState(() => { try{return localStorage.getItem('mht_theme')!=='light';}catch(_){return true;} });
  const C = isDark ? DARK : LIGHT;
  const S = makeStyles(C);
  function toggleTheme() { const n=!isDark; setIsDark(n); try{localStorage.setItem('mht_theme',n?'dark':'light');}catch(_){} }

  // ── Auth state
  const [authUser,    setAuthUser]    = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode,    setAuthMode]    = useState('login');
  const [authName,    setAuthName]    = useState('');
  const [authEmail,   setAuthEmail]   = useState('');
  const [authPass,    setAuthPass]    = useState('');
  const [authError,   setAuthError]   = useState('');
  const [authBusy,    setAuthBusy]    = useState(false);

  // ── App state
  const [view,         setView]         = useState('home');
  const [machines,     setMachines]     = useState([]);
  const [entriesCache, setEntriesCache] = useState({});
  const [reports,      setReports]      = useState([]);
  const [isOnline,     setIsOnline]     = useState(navigator.onLine);
  const [notif,        setNotif]        = useState({ enabled:false, dayTime:'06:00', nightTime:'18:00' });

  // ── Entry flow
  const [eStep,         setEStep]         = useState(1);
  const [eMachine,      setEMachine]      = useState(null);
  const [eFrom,         setEFrom]         = useState(todayStr());
  const [eTo,           setETo]           = useState(todayStr());
  const [eDays,         setEDays]         = useState([]);
  const [eSaving,       setESaving]       = useState(false);
  // Quick week entry
  const [eMode,         setEMode]         = useState('manual');   // 'manual' | 'quick'
  const [eQuickDate,    setEQuickDate]    = useState(todayStr()); // week start date
  const [eQuickStartOdo,setEQuickStartOdo]= useState('');
  const [eQuickEndOdo,  setEQuickEndOdo]  = useState('');
  const [eNightStart,   setENightStart]   = useState(false);      // week starts with night shift

  // ── Machine form
  const [mForm,  setMForm]  = useState({ name:'', startDay:'', breakingDay:'' });
  const [mEdit,  setMEdit]  = useState(null);
  const [showMF, setShowMF] = useState(false);

  // ── Reports
  const [rType,       setRType]       = useState('weekly');
  const [rMachine,    setRMachine]    = useState('');
  const [rFrom,       setRFrom]       = useState(todayStr());
  const [rTo,         setRTo]         = useState(todayStr());
  const [rNightStart, setRNightStart] = useState(false); // show Night before Day in weekly section
  const [rResult,     setRResult]     = useState('');
  const [rLoading,    setRLoading]    = useState(false);
  const [rError,      setRError]      = useState('');

  // ── History
  const [viewingRpt, setViewingRpt] = useState(null);
  const [copied,     setCopied]     = useState(false);

  // ── Online/offline
  useEffect(() => {
    const on=()=>setIsOnline(true), off=()=>setIsOnline(false);
    window.addEventListener('online',on); window.addEventListener('offline',off);
    return ()=>{ window.removeEventListener('online',on); window.removeEventListener('offline',off); };
  },[]);

  // ── Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, user => { setAuthUser(user); setAuthLoading(false); });
  },[]);

  // ── Machines real-time listener (per user)
  useEffect(() => {
    if (!authUser) { setMachines([]); return; }
    const unsub = onSnapshot(collection(db,'users',authUser.uid,'machines'), snap => {
      const list = snap.docs.map(d=>d.data()).sort((a,b)=>a.createdAt-b.createdAt);
      setMachines(list);
    });
    return unsub;
  },[authUser]);

  // ── Load notif from localStorage (device-specific)
  useEffect(() => {
    try { const n=localStorage.getItem('mht_notif'); if(n) setNotif(JSON.parse(n)); } catch(_){}
  },[]);

  // ── Load today's entries when machines or user changes
  useEffect(() => {
    if (!authUser || machines.length===0) return;
    loadEntriesForDates(machines.map(m=>m.id),[todayStr()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser, machines.length]);

  // ─── Firebase helpers ───────────────────────────────────────────────────────

  async function handleSignUp() {
    if (!authName.trim())  { setAuthError('Enter your name.'); return; }
    if (!authEmail.trim()) { setAuthError('Enter your email.'); return; }
    if (authPass.length<6) { setAuthError('Password must be at least 6 characters.'); return; }
    setAuthBusy(true); setAuthError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPass);
      await updateProfile(cred.user, { displayName: authName.trim() });
    } catch(err) {
      setAuthError(friendlyAuthError(err.code));
    }
    setAuthBusy(false);
  }

  async function handleSignIn() {
    if (!authEmail.trim()) { setAuthError('Enter your email.'); return; }
    if (!authPass)         { setAuthError('Enter your password.'); return; }
    setAuthBusy(true); setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, authEmail.trim(), authPass);
    } catch(err) {
      setAuthError(friendlyAuthError(err.code));
    }
    setAuthBusy(false);
  }

  function friendlyAuthError(code) {
    if (code==='auth/user-not-found'||code==='auth/wrong-password'||code==='auth/invalid-credential') return 'Wrong email or password.';
    if (code==='auth/email-already-in-use') return 'An account with this email already exists.';
    if (code==='auth/invalid-email')        return 'That email address is not valid.';
    if (code==='auth/too-many-requests')    return 'Too many attempts. Try again later.';
    return 'Something went wrong. Please try again.';
  }

  async function handleSignOut() {
    await signOut(auth);
    setMachines([]); setEntriesCache({}); setReports([]); setView('home');
  }

  // ── Entry cache helpers
  function getEntry(machineId, date) {
    return entriesCache[machineId+'_'+date] || { dayStart:'', dayEnd:'', nightStart:'', nightEnd:'', noWork:false, noWorkReason:'' };
  }

  const loadEntriesForDates = useCallback(async (machineIds, dates) => {
    if (!authUser) return;
    const promises = [];
    machineIds.forEach(mid => {
      dates.forEach(date => {
        const key = mid+'_'+date;
        if (!entriesCache[key]) {
          promises.push(getDoc(doc(db,'users',authUser.uid,'entries',key)).then(snap=>({ key, data:snap.exists()?snap.data():null })));
        }
      });
    });
    if (promises.length===0) return;
    const results = await Promise.all(promises);
    const updates = {};
    results.forEach(r=>{ if(r.data) updates[r.key]=r.data; });
    if (Object.keys(updates).length>0) setEntriesCache(prev=>({...prev,...updates}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[authUser]);

  async function saveEntryDoc(machineId, date, entryData) {
    const key = machineId+'_'+date;
    const entry = { ...entryData, machineId, date };
    await setDoc(doc(db,'users',authUser.uid,'entries',key), entry);
    setEntriesCache(prev=>({...prev,[key]:entry}));
  }

  // ── Machine CRUD
  async function addMachine() {
    if (!mForm.name.trim()) return;
    const m = { id:Date.now().toString(), name:mForm.name.trim(), startDay:mForm.startDay, breakingDay:mForm.breakingDay, active:true, createdAt:Date.now() };
    await setDoc(doc(db,'users',authUser.uid,'machines',m.id), m);
    setMForm({ name:'', startDay:'', breakingDay:'' }); setShowMF(false);
  }

  async function updateMachine() {
    const updated = { ...mEdit, ...mForm };
    await setDoc(doc(db,'users',authUser.uid,'machines',mEdit.id), updated);
    setMEdit(null); setShowMF(false); setMForm({ name:'', startDay:'', breakingDay:'' });
  }

  async function deleteMachine(id) {
    if (!window.confirm('Delete this machine?')) return;
    await deleteDoc(doc(db,'users',authUser.uid,'machines',id));
  }

  async function toggleActive(id) {
    const m = machines.find(m=>m.id===id);
    if (!m) return;
    await setDoc(doc(db,'users',authUser.uid,'machines',id),{...m,active:!m.active});
  }

  // ── Entry flow
  function startEntry() {
    setEStep(1); setEMachine(null); setEFrom(todayStr()); setETo(todayStr()); setEDays([]);
    setEMode('manual'); setEQuickDate(todayStr()); setEQuickStartOdo(''); setEQuickEndOdo(''); setENightStart(false);
    setView('entry');
  }
  function entryPickMachine(m) { setEMachine(m); setEStep(2); }

  // Manual: build days from date range
  async function entryBuildDays() {
    if (eFrom>eTo) { alert('From date must be before To date'); return; }
    const dates = datesBetween(eFrom,eTo);
    await loadEntriesForDates([eMachine.id], dates);
    const days = dates.map(date=>({ date, ...getEntry(eMachine.id,date) }));
    setEDays(days); setEStep(3);
  }

  // Quick week: distribute odo across 12 shifts for 6 days
  function entryBuildQuickDays() {
    const sOdo = parseFloat(eQuickStartOdo);
    const eOdo = parseFloat(eQuickEndOdo);
    if (!eQuickStartOdo || !eQuickEndOdo || isNaN(sOdo) || isNaN(eOdo)) { alert('Enter both start and end odometer readings.'); return; }
    if (eOdo <= sOdo) { alert('End odometer must be greater than start odometer.'); return; }
    const days = buildQuickDays(eQuickDate, sOdo, eOdo, eNightStart);
    setEFrom(eQuickDate);
    setETo(addDays(eQuickDate, 5));
    setEDays(days);
    setEStep(3);
  }

  function updateDay(idx, field, value) { setEDays(prev=>{ const n=[...prev]; n[idx]={...n[idx],[field]:value}; return n; }); }

  async function saveAllEntries() {
    setESaving(true);
    try {
      await Promise.all(eDays.map(day=>saveEntryDoc(eMachine.id, day.date, day)));
      alert('All entries saved!');
      setView('home');
    } catch(err) { alert('Error saving: '+err.message); }
    setESaving(false);
  }

  // ── Reports
  async function loadReports() {
    if (!authUser) return;
    const snap = await getDocs(collection(db,'users',authUser.uid,'reports'));
    const list = snap.docs.map(d=>d.data()).sort((a,b)=>b.createdAt-a.createdAt);
    setReports(list);
  }

  async function runReport() {
    if (!rMachine) { setRError('Please select a machine.'); return; }
    setRLoading(true); setRError(''); setRResult('');
    try {
      const machine = machines.find(m=>m.id===rMachine);
      const from = rType==='daily'?rFrom:rFrom;
      const to   = rType==='daily'?rFrom:rTo;
      const dates = datesBetween(from,to);
      await loadEntriesForDates([rMachine], dates);
      const entries = dates.map(date=>({ date, ...getEntry(rMachine,date) })).filter(e=>e.dayStart||e.nightStart||e.noWork);
      if (entries.length===0) { setRError('No entries found for this period.'); setRLoading(false); return; }
      const label = from===to ? fmtLong(from) : fmtLong(from)+' – '+fmtLong(to);
      const result = await generateReport(entries, machine, label, rNightStart);
      setRResult(result);
    } catch(err) { setRError(err.message||'Failed to generate report.'); }
    setRLoading(false);
  }

  async function saveReport() {
    if (!rResult) return;
    const id = Date.now().toString();
    const rpt = { id, machineId:rMachine, machineName:machines.find(m=>m.id===rMachine)?.name||'', type:rType, from:rType==='daily'?rFrom:rFrom, to:rType==='daily'?rFrom:rTo, content:rResult, nightStart:rNightStart, createdAt:Date.now() };
    await setDoc(doc(db,'users',authUser.uid,'reports',id), rpt);
    setReports(prev=>[rpt,...prev]);
    alert('Report saved to History!');
  }

  async function deleteReport(rpt) {
    if (!window.confirm('Delete this report?')) return;
    await deleteDoc(doc(db,'users',authUser.uid,'reports',rpt.id));
    setReports(prev=>prev.filter(r=>r.id!==rpt.id));
    setViewingRpt(null);
  }

  function copyForWhatsApp(reportText, machineName, dateLabel) {
    const wa = formatForWhatsApp(reportText, machineName, dateLabel);
    navigator.clipboard.writeText(wa).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2500); }).catch(()=>{ const ta=document.createElement('textarea'); ta.value=wa; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); setCopied(true); setTimeout(()=>setCopied(false),2500); });
  }

  function downloadTxt(content, name) { const blob=new Blob([content],{type:'text/plain'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name+'.txt'; a.click(); URL.revokeObjectURL(url); }

  function saveNotif(s) { setNotif(s); try{localStorage.setItem('mht_notif',JSON.stringify(s));}catch(_){} }
  async function requestNotif() { if(!('Notification'in window)){alert('Notifications not supported.');return;} const p=await Notification.requestPermission(); if(p==='granted') saveNotif({...notif,enabled:true}); else alert('Notification permission denied.'); }

  // ── Home summary (from cache)
  function getHomeSummary() {
    let totalHrs=0, working=0, noWork=0, pending=0;
    const t = todayStr();
    machines.forEach(m=>{ const e=getEntry(m.id,t); if(e.noWork){noWork++;}else if(e.dayStart||e.nightStart){working++;totalHrs+=calcBilled(e.dayStart,e.dayEnd)+calcBilled(e.nightStart,e.nightEnd);}else{pending++;} });
    return { totalHrs, working, noWork, pending };
  }

  // ─── Render: Auth screen ────────────────────────────────────────────────────
  function renderAuth() {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 24px' }}>
        <div style={{ marginBottom:24, textAlign:'center' }}>
          <div style={{ fontSize:36 }}>🚧</div>
          <div style={{ fontSize:22, fontWeight:800, color:C.text, marginTop:8 }}>Machine Hours Tracker</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Sign in to access your data on any device</div>
        </div>

        <div style={{ width:'100%', maxWidth:400 }}>
          {/* Tab switcher */}
          <div style={{ display:'flex', background:C.surface, borderRadius:10, padding:4, marginBottom:20, border:'1px solid '+C.border }}>
            {['login','register'].map(mode=>(
              <button key={mode} onClick={()=>{setAuthMode(mode);setAuthError('');}} style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, fontSize:14, fontFamily:'inherit', background:authMode===mode?C.blue:'transparent', color:authMode===mode?'#fff':C.muted, transition:'all 0.15s' }}>
                {mode==='login'?'Sign In':'Create Account'}
              </button>
            ))}
          </div>

          <div style={S.card}>
            {authMode==='register' && (
              <>
                <label style={S.label}>Your Name</label>
                <input style={S.input} placeholder="e.g. Kwame Asante" value={authName} onChange={e=>setAuthName(e.target.value)} />
              </>
            )}
            <label style={S.label}>Email Address</label>
            <input style={S.input} type="email" placeholder="you@example.com" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} />
            <label style={S.label}>Password</label>
            <input style={S.input} type="password" placeholder={authMode==='register'?'At least 6 characters':'Your password'} value={authPass} onChange={e=>setAuthPass(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') authMode==='login'?handleSignIn():handleSignUp(); }} />

            {authError && <div style={{ color:C.red, fontSize:13, marginBottom:10, padding:'8px 10px', background:C.red+'14', borderRadius:6 }}>⚠ {authError}</div>}

            <button style={{ ...S.btn('primary'), marginBottom:0 }} onClick={authMode==='login'?handleSignIn:handleSignUp} disabled={authBusy}>
              {authBusy ? (authMode==='login'?'Signing in…':'Creating account…') : (authMode==='login'?'Sign In':'Create Account')}
            </button>
          </div>

          <div style={{ textAlign:'center', fontSize:13, color:C.muted, marginTop:12 }}>
            {authMode==='login' ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={()=>{setAuthMode(authMode==='login'?'register':'login');setAuthError('');}} style={{ background:'none', border:'none', color:C.blue, cursor:'pointer', fontSize:13, fontFamily:'inherit', fontWeight:600 }}>
              {authMode==='login'?'Create one':'Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Home ───────────────────────────────────────────────────────────
  function renderHome() {
    const h=new Date().getHours();
    const greet=h<12?'Good morning':h<17?'Good afternoon':'Good evening';
    const name = authUser?.displayName || '';
    const sum  = getHomeSummary();
    return (
      <div style={S.page}>
        <div style={{ padding:'20px 0 12px' }}>
          <div style={{ fontSize:22, fontWeight:700, color:C.text }}>{greet}{name?' '+name.split(' ')[0]:''} 👋</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:2 }}>{fmtLong(todayStr())}</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
          {[{ label:'Total Hours Today', value:sum.totalHrs+'h' },{ label:'Working', value:sum.working },{ label:'No Work', value:sum.noWork },{ label:'Pending Entry', value:sum.pending }].map(c=>(
            <div key={c.label} style={{ ...S.card, marginBottom:0 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:2 }}>{c.label}</div>
              <div style={{ fontSize:28, fontWeight:700, color:C.text }}>{c.value}</div>
            </div>
          ))}
        </div>

        <button style={S.btn('primary')} onClick={startEntry}>+ New Entry</button>
        <button style={S.btn()} onClick={()=>{ loadReports(); setView('reports'); }}>📊 Generate Report</button>

        <div style={{ marginTop:8, fontSize:13, fontWeight:600, color:C.muted, marginBottom:8 }}>Machines — Today</div>
        {machines.length===0 && <div style={{ color:C.dim, fontSize:13 }}>No machines yet. Add one in the Machines tab.</div>}
        {machines.map(m=>{
          const e=getEntry(m.id,todayStr());
          const status=e.noWork?'no-work':(e.dayStart||e.nightStart)?'active':'pending';
          return (
            <div key={m.id} style={{ ...S.card, padding:'12px 14px' }}>
              <div style={S.flex}>
                <div>
                  <div style={{ fontWeight:600, fontSize:14 }}>{m.name}</div>
                  <div style={S.tag}>{e.noWork?(e.noWorkReason||'No Work'):(calcBilled(e.dayStart,e.dayEnd)||calcBilled(e.nightStart,e.nightEnd))?calcBilled(e.dayStart,e.dayEnd)+'h day · '+calcBilled(e.nightStart,e.nightEnd)+'h night':'No entry yet'}</div>
                </div>
                <span style={S.badge(status==='active'?'green':status==='no-work'?'red':'blue')}>{status==='active'?'Active':status==='no-work'?'No Work':'Pending'}</span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── Render: Entry ──────────────────────────────────────────────────────────
  function renderEntry() {
    // ── Step 1: pick machine
    if (eStep===1) {
      const active = machines.filter(m=>m.active);
      return (
        <div style={S.page}>
          <div style={{ padding:'16px 0 8px', fontSize:16, fontWeight:700 }}>Select Machine</div>
          {active.length===0 && <div style={{ ...S.card, color:C.muted }}>No active machines. Add and activate one in the Machines tab.</div>}
          {active.map(m=>(<div key={m.id} style={{ ...S.card, cursor:'pointer' }} onClick={()=>entryPickMachine(m)}><div style={S.flex}><div><div style={{ fontWeight:600 }}>{m.name}</div><div style={S.tag}>Tap to select</div></div><span style={{ color:C.blue, fontSize:18 }}>›</span></div></div>))}
        </div>
      );
    }

    // ── Step 2: choose mode + date range (or quick week inputs)
    if (eStep===2) {
      const perShift = (eQuickStartOdo && eQuickEndOdo)
        ? ((parseFloat(eQuickEndOdo)-parseFloat(eQuickStartOdo))/12).toFixed(1)
        : null;

      return (
        <div style={S.page}>
          <div style={{ padding:'16px 0 4px', fontSize:16, fontWeight:700 }}>{eMachine.name}</div>

          {/* Mode toggle */}
          <div style={{ display:'flex', background:C.surface, borderRadius:10, padding:4, marginBottom:16, border:'1px solid '+C.border }}>
            {[['manual','✏️ Manual Days'],['quick','⚡ Quick Week']].map(([m,label])=>(
              <button key={m} onClick={()=>setEMode(m)} style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:'inherit', background:eMode===m?C.blue:'transparent', color:eMode===m?'#fff':C.muted, transition:'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>

          {eMode === 'manual' ? (
            <>
              <div style={{ color:C.muted, fontSize:13, marginBottom:12 }}>Select date range to enter</div>
              <label style={S.label}>From</label>
              <input type="date" style={S.input} value={eFrom} onChange={e=>setEFrom(e.target.value)} />
              <label style={S.label}>To</label>
              <input type="date" style={S.input} value={eTo} onChange={e=>setETo(e.target.value)} />
              <button style={S.btn('primary')} onClick={entryBuildDays}>Continue →</button>
            </>
          ) : (
            <>
              <div style={{ color:C.muted, fontSize:13, marginBottom:12 }}>Enter odometer readings for the whole week — hours split equally across all 6 days (12 shifts).</div>

              <label style={S.label}>Week Start Date</label>
              <input type="date" style={S.input} value={eQuickDate} onChange={e=>setEQuickDate(e.target.value)} />

              {/* Show computed end date */}
              <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
                Week ends: <strong style={{ color:C.text }}>{fmtShort(addDays(eQuickDate, 5))}</strong> (6 days)
              </div>

              <div style={S.row}>
                <div style={{ flex:1 }}>
                  <label style={S.label}>Start Odometer</label>
                  <input type="number" step="0.1" style={S.input} placeholder="e.g. 1200" value={eQuickStartOdo} onChange={e=>setEQuickStartOdo(e.target.value)} />
                </div>
                <div style={{ flex:1 }}>
                  <label style={S.label}>End Odometer</label>
                  <input type="number" step="0.1" style={S.input} placeholder="e.g. 1320" value={eQuickEndOdo} onChange={e=>setEQuickEndOdo(e.target.value)} />
                </div>
              </div>

              {/* Live preview of hours per shift */}
              {perShift && parseFloat(perShift) > 0 && (
                <div style={{ padding:'10px 14px', background:C.blue+'14', borderRadius:8, marginBottom:10, fontSize:13 }}>
                  <span style={{ color:C.muted }}>Total: </span>
                  <strong style={{ color:C.text }}>{(parseFloat(eQuickEndOdo)-parseFloat(eQuickStartOdo)).toFixed(1)}h</strong>
                  <span style={{ color:C.muted, marginLeft:12 }}>Per shift: </span>
                  <strong style={{ color:C.blue }}>{perShift}h</strong>
                  <span style={{ color:C.muted }}> × 12 shifts</span>
                </div>
              )}

              {/* Night-start toggle */}
              <div style={{ ...S.card, padding:'12px 14px', marginBottom:12 }}>
                <div style={S.flex}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:C.text }}>🌙 Week starts from Night Shift</div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Each day: night shift runs first, then day shift</div>
                  </div>
                  <input type="checkbox" checked={eNightStart} onChange={e=>setENightStart(e.target.checked)} style={{ transform:'scale(1.5)', accentColor:C.blue, cursor:'pointer' }} />
                </div>
              </div>

              <button style={S.btn('primary')} onClick={entryBuildQuickDays}>Preview & Continue →</button>
            </>
          )}

          <button style={S.btn()} onClick={()=>setEStep(1)}>← Back</button>
        </div>
      );
    }

    // ── Step 3: review / edit days
    return (
      <div style={S.page}>
        <div style={{ padding:'16px 0 4px', fontSize:16, fontWeight:700 }}>{eMachine.name}</div>
        <div style={{ color:C.muted, fontSize:13, marginBottom:12 }}>{fmtShort(eFrom)} – {fmtShort(eTo)}</div>

        {/* Quick-week badge */}
        {eMode==='quick' && (
          <div style={{ padding:'8px 12px', background:C.blue+'14', borderRadius:8, marginBottom:12, fontSize:12, color:C.blue }}>
            ⚡ Quick Week — hours distributed equally. You can still adjust individual values below.
            {eNightStart && <span style={{ marginLeft:8 }}>🌙 Night-start order applied.</span>}
          </div>
        )}

        {eDays.map((day,idx)=>(
          <div key={day.date} style={S.card}>
            <div style={{ ...S.flex, marginBottom:10 }}>
              <div style={{ fontWeight:600, fontSize:13 }}>{fmtLong(day.date)}</div>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#f87171', cursor:'pointer' }}>
                <input type="checkbox" checked={!!day.noWork} onChange={e=>updateDay(idx,'noWork',e.target.checked)} style={{ accentColor:C.red }} />
                No Work
              </label>
            </div>
            {day.noWork ? (
              <input style={S.input} placeholder="Reason (optional)" value={day.noWorkReason||''} onChange={e=>updateDay(idx,'noWorkReason',e.target.value)} />
            ) : (
              <>
                <div style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>Day Shift</div>
                <div style={S.row}>
                  <div style={{ flex:1 }}><div style={S.tag}>Start Odo</div><input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.dayStart} onChange={e=>updateDay(idx,'dayStart',e.target.value)} /></div>
                  <div style={{ flex:1 }}><div style={S.tag}>End Odo</div><input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.dayEnd} onChange={e=>updateDay(idx,'dayEnd',e.target.value)} /></div>
                  <div style={{ flex:1 }}><div style={S.tag}>Billed</div><div style={S.billedBox}>{calcBilled(day.dayStart,day.dayEnd)}h</div></div>
                </div>
                <div style={{ fontSize:12, color:C.muted, marginBottom:6, fontWeight:500 }}>Night Shift</div>
                <div style={S.row}>
                  <div style={{ flex:1 }}><div style={S.tag}>Start Odo</div><input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.nightStart} onChange={e=>updateDay(idx,'nightStart',e.target.value)} /></div>
                  <div style={{ flex:1 }}><div style={S.tag}>End Odo</div><input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.nightEnd} onChange={e=>updateDay(idx,'nightEnd',e.target.value)} /></div>
                  <div style={{ flex:1 }}><div style={S.tag}>Billed</div><div style={S.billedBox}>{calcBilled(day.nightStart,day.nightEnd)}h</div></div>
                </div>
              </>
            )}
          </div>
        ))}
        <div style={{ position:'sticky', bottom:88, paddingBottom:8, paddingTop:8, background:C.bg, borderTop:'1px solid '+C.border }}>
          <button style={S.btn('success')} onClick={saveAllEntries} disabled={eSaving}>{eSaving?'Saving…':'✓ Save All Entries'}</button>
          <button style={S.btn()} onClick={()=>setEStep(2)}>← Back</button>
        </div>
      </div>
    );
  }

  // ─── Render: Machines ───────────────────────────────────────────────────────
  function renderMachines() {
    return (
      <div style={S.page}>
        <div style={{ padding:'16px 0 8px', fontSize:16, fontWeight:700 }}>Machine Registry</div>
        {showMF && (
          <div style={S.card}>
            <div style={{ fontWeight:600, marginBottom:12 }}>{mEdit?'Edit Machine':'Register New Machine'}</div>
            <label style={S.label}>Machine Name *</label>
            <input style={S.input} value={mForm.name} placeholder="e.g. CAT 336" onChange={e=>setMForm(p=>({...p,name:e.target.value}))} />
            <label style={S.label}>Starting Odometer</label>
            <input type="number" style={S.input} value={mForm.startDay} placeholder="e.g. 1200" onChange={e=>setMForm(p=>({...p,startDay:e.target.value}))} />
            <label style={S.label}>Breaking Day (hours)</label>
            <input type="number" style={S.input} value={mForm.breakingDay} placeholder="e.g. 500" onChange={e=>setMForm(p=>({...p,breakingDay:e.target.value}))} />
            <button style={S.btn('primary')} onClick={mEdit?updateMachine:addMachine}>{mEdit?'Update Machine':'Add Machine'}</button>
            <button style={S.btn()} onClick={()=>{setShowMF(false);setMEdit(null);setMForm({name:'',startDay:'',breakingDay:''});}}>Cancel</button>
          </div>
        )}
        {!showMF && <button style={S.btn('primary')} onClick={()=>setShowMF(true)}>+ Register Machine</button>}
        {machines.length===0&&!showMF&&<div style={{ color:C.dim, fontSize:13, marginTop:8 }}>No machines registered yet.</div>}
        {machines.map(m=>(
          <div key={m.id} style={S.card}>
            <div style={S.flex}>
              <div><div style={{ fontWeight:600, fontSize:14, marginBottom:2 }}>{m.name}</div><div style={S.tag}>Start odo: {m.startDay||'—'} | Break: {m.breakingDay||'—'}h</div></div>
              <span style={S.badge(m.active?'green':'red')}>{m.active?'Active':'Inactive'}</span>
            </div>
            <div style={{ ...S.row, marginTop:12, gap:6 }}>
              <button style={{ ...S.btn(), padding:'8px 10px', marginBottom:0, flex:1, fontSize:12 }} onClick={()=>toggleActive(m.id)}>{m.active?'Deactivate':'Activate'}</button>
              <button style={{ ...S.btn(), padding:'8px 10px', marginBottom:0, flex:1, fontSize:12 }} onClick={()=>{setMEdit(m);setMForm({name:m.name,startDay:m.startDay||'',breakingDay:m.breakingDay||''});setShowMF(true);}}>Edit</button>
              <button style={{ ...S.btn('danger'), padding:'8px 10px', marginBottom:0, flex:1, fontSize:12 }} onClick={()=>deleteMachine(m.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Render: Reports ────────────────────────────────────────────────────────
  function renderReports() {
    return (
      <div style={S.page}>
        <div style={{ padding:'16px 0 8px', fontSize:16, fontWeight:700 }}>Generate Report</div>
        <label style={S.label}>Machine</label>
        <select style={{ ...S.input, marginBottom:12 }} value={rMachine} onChange={e=>setRMachine(e.target.value)}>
          <option value="">Select machine…</option>
          {machines.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <label style={S.label}>Report Type</label>
        <div style={{ ...S.row, marginBottom:14 }}>
          {['daily','weekly','custom'].map(t=>(
            <button key={t} onClick={()=>setRType(t)} style={{ flex:1, padding:'9px 0', borderRadius:8, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, fontFamily:'inherit', background:rType===t?C.blue:C.border, color:'#fff' }}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        {rType==='daily' ? (<><label style={S.label}>Date</label><input type="date" style={S.input} value={rFrom} onChange={e=>setRFrom(e.target.value)} /></>) : (<><label style={S.label}>From</label><input type="date" style={S.input} value={rFrom} onChange={e=>setRFrom(e.target.value)} /><label style={S.label}>To</label><input type="date" style={S.input} value={rTo} onChange={e=>setRTo(e.target.value)} /></>)}

        {/* Night-start toggle — affects weekly section order */}
        <div style={{ ...S.card, padding:'12px 14px', marginBottom:14 }}>
          <div style={S.flex}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:C.text }}>🌙 Night-start week</div>
              <div style={{ fontSize:11, color:C.muted, marginTop:1 }}>Show Night Shifts before Day Shifts in weekly section</div>
            </div>
            <input type="checkbox" checked={rNightStart} onChange={e=>setRNightStart(e.target.checked)} style={{ transform:'scale(1.4)', accentColor:C.blue, cursor:'pointer' }} />
          </div>
        </div>

        <button style={S.btn('primary')} onClick={runReport} disabled={rLoading}>{rLoading?'Generating…':'Generate Report'}</button>
        {rError && <div style={{ color:C.red, fontSize:13, marginBottom:8 }}>⚠ {rError}</div>}
        {rResult && (
          <>
            <div style={{ ...S.card, maxHeight:520, overflowY:'auto', marginBottom:10 }}><ReportView text={rResult} C={C} /></div>
            <button style={{ ...S.btn('success'), background:'#25D366', marginBottom:8 }} onClick={()=>{ const m=machines.find(m=>m.id===rMachine); const from=rType==='daily'?rFrom:rFrom; const to=rType==='daily'?rFrom:rTo; const label=from===to?fmtLong(from):fmtShort(from)+' – '+fmtShort(to); copyForWhatsApp(rResult,m?.name,label); }}>
              {copied?'✓ Copied! Paste into WhatsApp':'📲 Copy for WhatsApp'}
            </button>
            <div style={S.row}>
              <button style={{ ...S.btn('primary'), marginBottom:0, flex:1 }} onClick={saveReport}>💾 Save</button>
              <button style={{ ...S.btn(), marginBottom:0, flex:1 }} onClick={()=>downloadTxt(rResult,'report-'+rFrom)}>⬇ Download</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─── Render: History ────────────────────────────────────────────────────────
  function renderHistory() {
    if (viewingRpt) return (
      <div style={S.page}>
        <button onClick={()=>setViewingRpt(null)} style={{ background:'none', border:'none', color:C.blue, cursor:'pointer', padding:'16px 0', fontSize:14, fontFamily:'inherit' }}>← Back</button>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{viewingRpt.machineName}</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>{fmtLong(viewingRpt.from)}{viewingRpt.from!==viewingRpt.to?' – '+fmtLong(viewingRpt.to):''}</div>
        <div style={{ ...S.card, maxHeight:520, overflowY:'auto' }}><ReportView text={viewingRpt.content} C={C} /></div>
        <button style={{ ...S.btn('success'), background:'#25D366' }} onClick={()=>{ const label=viewingRpt.from===viewingRpt.to?fmtLong(viewingRpt.from):fmtShort(viewingRpt.from)+' – '+fmtShort(viewingRpt.to); copyForWhatsApp(viewingRpt.content,viewingRpt.machineName,label); }}>
          {copied?'✓ Copied! Paste into WhatsApp':'📲 Copy for WhatsApp'}
        </button>
        <button style={S.btn()} onClick={()=>downloadTxt(viewingRpt.content,'report-'+viewingRpt.from)}>⬇ Download</button>
        <button style={S.btn('danger')} onClick={()=>deleteReport(viewingRpt)}>🗑 Delete Report</button>
      </div>
    );
    return (
      <div style={S.page}>
        <div style={{ padding:'16px 0 8px', fontSize:16, fontWeight:700 }}>Saved Reports</div>
        {reports.length===0 && <div style={{ color:C.dim, fontSize:13 }}>No saved reports yet.</div>}
        {reports.map(r=>(
          <div key={r.id} style={{ ...S.card, cursor:'pointer' }} onClick={()=>setViewingRpt(r)}>
            <div style={S.flex}>
              <div><div style={{ fontWeight:600, fontSize:14 }}>{r.machineName}</div><div style={S.tag}>{r.type} · {fmtShort(r.from)}{r.from!==r.to?' – '+fmtShort(r.to):''}{r.nightStart?' · 🌙':''}</div></div>
              <span style={{ color:C.blue, fontSize:14 }}>›</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ─── Render: Settings ───────────────────────────────────────────────────────
  function renderSettings() {
    return (
      <div style={S.page}>
        <div style={{ padding:'16px 0 8px', fontSize:16, fontWeight:700 }}>Settings</div>

        {/* Account card */}
        <div style={S.card}>
          <div style={{ fontWeight:600, marginBottom:10 }}>👤 Account</div>
          <div style={{ fontSize:14, color:C.text, marginBottom:2 }}>{authUser?.displayName || 'User'}</div>
          <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>{authUser?.email}</div>
          <button style={{ ...S.btn('danger'), marginBottom:0 }} onClick={handleSignOut}>Sign Out</button>
        </div>

        <div style={S.card}>
          <div style={{ fontWeight:600, marginBottom:12 }}>🔔 Shift Reminders</div>
          <div style={S.flex}>
            <span style={{ fontSize:14 }}>Enable notifications</span>
            <input type="checkbox" checked={notif.enabled} onChange={e=>{ if(e.target.checked)requestNotif(); else saveNotif({...notif,enabled:false}); }} style={{ transform:'scale(1.4)', accentColor:C.blue }} />
          </div>
          {notif.enabled && (
            <div style={{ marginTop:14 }}>
              <label style={S.label}>Day shift reminder</label>
              <input type="time" style={S.input} value={notif.dayTime} onChange={e=>saveNotif({...notif,dayTime:e.target.value})} />
              <label style={S.label}>Night shift reminder</label>
              <input type="time" style={S.input} value={notif.nightTime} onChange={e=>saveNotif({...notif,nightTime:e.target.value})} />
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={{ fontWeight:600, marginBottom:6 }}>ℹ About</div>
          <div style={{ fontSize:13, color:C.muted }}>Machine Hours Tracker v2.1</div>
          <div style={{ fontSize:12, color:C.dim, marginTop:2 }}>6-day week · Cross-device sync via Firebase</div>
          <div style={{ fontSize:12, color:isOnline?C.green:C.amber, marginTop:6 }}>{isOnline?'🌐 Online':'📴 Offline — changes will sync when back online'}</div>
        </div>
      </div>
    );
  }

  // ─── Shell ──────────────────────────────────────────────────────────────────
  const NAV = [{ id:'home', icon:'🏠', label:'Home' },{ id:'entry', icon:'✏️', label:'Entry' },{ id:'machines', icon:'⚙', label:'Machines' },{ id:'reports', icon:'📊', label:'Reports' },{ id:'history', icon:'🕓', label:'History' }];
  const TITLES = { home:'MHT', entry:'New Entry', machines:'Machines', reports:'Reports', history:'History', settings:'Settings' };

  if (authLoading) return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:32 }}>🚧</div>
      <div style={{ color:C.muted, fontSize:14 }}>Loading…</div>
    </div>
  );

  if (!authUser) return (
    <div style={{ background:C.bg, minHeight:'100vh' }}>
      <div style={{ position:'fixed', top:16, right:16, zIndex:200 }}>
        <button onClick={toggleTheme} style={{ background:C.surface, border:'1px solid '+C.border, borderRadius:8, color:C.muted, cursor:'pointer', fontSize:18, padding:'6px 10px' }}>{isDark?'☀️':'🌙'}</button>
      </div>
      {renderAuth()}
    </div>
  );

  return (
    <div style={S.app}>
      <div style={S.hdr}>
        <span style={{ fontSize:15, fontWeight:700, color:C.text }}>{TITLES[view]||'MHT'}</span>
        <div style={{ display:'flex', gap:14, alignItems:'center' }}>
          <span style={{ fontSize:11, color:isOnline?C.green:C.amber }}>{isOnline?'● Online':'● Offline'}</span>
          <button onClick={toggleTheme} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:18, lineHeight:1 }}>{isDark?'☀️':'🌙'}</button>
          <button onClick={()=>setView('settings')} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:20, lineHeight:1 }}>⚙</button>
        </div>
      </div>

      {view==='home'     && renderHome()}
      {view==='entry'    && renderEntry()}
      {view==='machines' && renderMachines()}
      {view==='reports'  && renderReports()}
      {view==='history'  && renderHistory()}
      {view==='settings' && renderSettings()}

      <nav style={S.nav}>
        {NAV.map(n=>(
          <button key={n.id} style={S.navBtn(view===n.id)} onClick={()=>n.id==='entry'?startEntry():( n.id==='history'?(loadReports(),setView('history')):setView(n.id) )}>
            <span style={{ fontSize:20 }}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
