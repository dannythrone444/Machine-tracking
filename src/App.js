import { useState, useEffect } from "react";

// ── OFFLINE QUEUE ────────────────────────────────────────────────
const QK = "mht_q";
const offQ = {
  add(key, val) { try { const q = JSON.parse(localStorage.getItem(QK)||"[]").filter(function(i){return i.k!==key;}); q.push({k:key,v:val}); localStorage.setItem(QK,JSON.stringify(q)); } catch(e) {} },
  get() { try { return JSON.parse(localStorage.getItem(QK)||"[]"); } catch(e) { return []; } },
  remove(key) { try { const q = JSON.parse(localStorage.getItem(QK)||"[]").filter(function(i){return i.k!==key;}); localStorage.setItem(QK,JSON.stringify(q)); } catch(e) {} },
  count() { return this.get().length; }
};

// ── STORAGE ───────────────────────────────────────────────────────
const store = {
  async get(key) {
    if (typeof window !== "undefined" && window.storage) {
      try { const r = await window.storage.get(key, true); if (r) return r; } catch(e) {}
    }
    const v = localStorage.getItem("mht_l:" + key);
    return v ? { value: v } : null;
  },
  async set(key, val) {
    try { localStorage.setItem("mht_l:" + key, val); } catch(e) {}
    if (typeof window !== "undefined" && window.storage) {
      try { await window.storage.set(key, val, true); return true; } catch(e) {}
    }
    offQ.add(key, val); return false;
  },
  async delete(key) {
    try { localStorage.removeItem("mht_l:" + key); } catch(e) {}
    if (typeof window !== "undefined" && window.storage) {
      try { await window.storage.delete(key, true); } catch(e) {}
    }
  },
  async list(prefix) {
    if (typeof window !== "undefined" && window.storage) {
      try { return await window.storage.list(prefix, true); } catch(e) {}
    }
    const keys = Object.keys(localStorage)
      .filter(function(k) { return k.startsWith("mht_l:" + prefix); })
      .map(function(k) { return k.replace("mht_l:", ""); });
    return { keys };
  }
};

// ── NOTIFICATIONS ─────────────────────────────────────────────────
const NK = "mht_notif";
function getNotifCfg() { try { return JSON.parse(localStorage.getItem(NK) || '{"enabled":false,"dayTime":"18:00","nightTime":"06:00"}'); } catch(e) { return { enabled: false, dayTime: "18:00", nightTime: "06:00" }; } }
function saveNotifCfg(s) { localStorage.setItem(NK, JSON.stringify(s)); }
let ntTimers = [];
function clearNtTimers() { ntTimers.forEach(clearTimeout); ntTimers = []; }
function scheduleNotifs(cfg) {
  clearNtTimers();
  if (!cfg.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
  function at(time, title, body) {
    const [h, m] = time.split(":").map(Number);
    const now = new Date(), tgt = new Date();
    tgt.setHours(h, m, 0, 0);
    if (tgt <= now) tgt.setDate(tgt.getDate() + 1);
    const t = setTimeout(function() { new Notification(title, { body }); at(time, title, body); }, tgt - now);
    ntTimers.push(t);
  }
  at(cfg.dayTime, "☀ Day Shift Reminder", "Enter today's day shift odometer readings.");
  at(cfg.nightTime, "☾ Night Shift Reminder", "Enter tonight's night shift odometer readings.");
}

// ── UTILS ─────────────────────────────────────────────────────────
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DAY_FULL  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
function calcH(s, e) { const a = parseFloat(s), b = parseFloat(e); if (isNaN(a)||isNaN(b)||b<a) return null; return parseFloat((b-a).toFixed(2)); }
function billH(h) { if (h === null) return null; const m = Math.round((h - Math.floor(h)) * 60); return m >= 30 ? Math.ceil(h) : Math.floor(h); }
function fmt(h) { if (h === null || h === undefined) return "—"; const hr = Math.floor(h), m = Math.round((h-hr)*60); return m > 0 ? (hr+"h "+m+"m") : (hr+"h"); }
function todayStr() { return new Date().toISOString().split("T")[0]; }
function fmtD(s, opts) { return new Date(s+"T12:00:00").toLocaleDateString("en-GB", opts); }
function emptyRow() { return { dayStart:"", dayEnd:"", nightStart:"", nightEnd:"", noWork:false, reason:"" }; }
function buildDays(from, to) { const days=[], cur=new Date(from+"T12:00:00"), last=new Date(to+"T12:00:00"); while(cur<=last){ days.push(cur.toISOString().split("T")[0]); cur.setDate(cur.getDate()+1); } return days; }

function renderMD(t) {
  return t
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3 style=\"font-size:14px;font-weight:600;margin:1rem 0 0.2rem\">$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style=\"font-size:16px;font-weight:600;margin:1.5rem 0 0.4rem;border-bottom:1px solid #ddd;padding-bottom:4px\">$1</h2>")
    .replace(/^- (.+)$/gm, "<div style=\"padding-left:1rem;margin:0.15rem 0\">• $1</div>")
    .replace(/\n\n/g, "<br/>").replace(/\n/g, " ");
}

function buildPrint(report, meta) {
  const body = report.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/^### (.+)$/gm,"<h3>$1</h3>").replace(/^## (.+)$/gm,"<h2>$1</h2>")
    .replace(/^- (.+)$/gm,"<li>$1</li>").replace(/\n\n/g,"</p><p>").replace(/\n/g," ");
  return "<!DOCTYPE html><html><head><meta charset='utf-8'/><title>"+meta.name+"</title><style>body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 32px;color:#111;font-size:14px;line-height:1.8}h1{font-size:22px}h2{font-size:17px;font-weight:600;margin:2rem 0 .5rem;border-bottom:1px solid #ddd;padding-bottom:4px}h3{font-size:14px;font-weight:600;margin:1.25rem 0 .25rem}li{margin:.15rem 0}p{margin:.4rem 0}.hdr{border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:24px}.badge{display:inline-block;background:#f3f3f3;border:1px solid #ddd;border-radius:4px;padding:2px 10px;font-size:12px;margin-right:8px}.foot{margin-top:40px;padding-top:12px;border-top:1px solid #ddd;font-size:11px;color:#999}</style></head><body>"
    +"<div class='hdr'><h1>"+meta.name+"</h1><div style='font-size:13px;color:#555;margin-top:4px'><span class='badge'>"+meta.type+"</span><span class='badge'>📅 "+meta.period+"</span></div></div><p>"+body+"</p>"
    +"<div class='foot'>Machine Hours Tracker · "+new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})+"</div></body></html>";
}

function DownloadBar(props) {
  const [busy, setBusy] = useState(false);
  function doPDF() {
    const w = window.open("","_blank");
    if (!w) { alert("Allow pop-ups."); return; }
    w.document.write(buildPrint(props.report, props));
    w.document.close(); w.focus();
    setTimeout(function() { w.print(); }, 400);
  }
  function doImg() {
    setBusy(true);
    const W=860, H=1300, html=buildPrint(props.report, props);
    const svg="<svg xmlns='http://www.w3.org/2000/svg' width='"+W+"' height='"+H+"'><foreignObject width='100%' height='100%'><div xmlns='http://www.w3.org/1999/xhtml' style='background:#fff;width:"+W+"px;min-height:"+H+"px'>"+html+"</div></foreignObject></svg>";
    const blob=new Blob([svg],{type:"image/svg+xml"});
    const url=URL.createObjectURL(blob);
    const img=new Image();
    img.onload=function(){
      const c=document.createElement("canvas"); c.width=W; c.height=H;
      const ctx=c.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,W,H); ctx.drawImage(img,0,0);
      URL.revokeObjectURL(url);
      const a=document.createElement("a"); a.download=props.name.replace(/\s+/g,"_")+".png"; a.href=c.toDataURL("image/png"); a.click();
      setBusy(false);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); alert("Try PDF instead."); setBusy(false); };
    img.src=url;
  }
  return (
    <div style={{display:"flex",gap:8,marginTop:"1rem",paddingTop:"1rem",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
      <button onClick={doPDF} style={{fontSize:13,padding:"6px 14px"}}>⬇ PDF</button>
      <button onClick={doImg} disabled={busy} style={{fontSize:13,padding:"6px 14px"}}>{busy?"Exporting...":"🖼 Image"}</button>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────
export default function App() {
  const [view, setView]             = useState("home");
  const [machines, setMachines]     = useState([]);
  const [appLoading, setAppLoading] = useState(true);
  const [isOnline, setIsOnline]     = useState(navigator.onLine);
  const [pending, setPending]       = useState(offQ.count());
  const [syncing, setSyncing]       = useState(false);
  const [notifCfg, setNotifCfg]     = useState(getNotifCfg());
  const [showSettings, setShowSettings] = useState(false);

  // Entry flow
  const [entryStep, setEntryStep]       = useState("machine");
  const [entryMachine, setEntryMachine] = useState(null);
  const [entryFrom, setEntryFrom]       = useState("");
  const [entryTo, setEntryTo]           = useState("");
  const [entryDays, setEntryDays]       = useState([]);
  const [entries, setEntries]           = useState({});
  const [saving, setSaving]             = useState(false);
  const [saveStatus, setSaveStatus]     = useState("");

  // Today dashboard entries
  const [todayEntries, setTodayEntries] = useState({});

  // Machine form
  const [editM, setEditM]   = useState(null);
  const [mName, setMName]   = useState("");
  const [mStart, setMStart] = useState(1);
  const [mBreak, setMBreak] = useState(6);

  // Reports
  const [savedReports, setSavedReports] = useState([]);
  const [selReport, setSelReport]       = useState(null);
  const [rType, setRType]   = useState("daily");
  const [rMid, setRMid]     = useState("");
  const [rDate, setRDate]   = useState(todayStr());
  const [rFrom, setRFrom]   = useState("");
  const [rTo, setRTo]       = useState("");
  const [rLoading, setRLoading] = useState(false);
  const [rError, setRError]     = useState("");
  const [rResult, setRResult]   = useState("");

  useEffect(function() {
    loadAll();
    scheduleNotifs(notifCfg);
    function goOnline() { setIsOnline(true); doSync(); }
    function goOffline() { setIsOnline(false); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return function() { window.removeEventListener("online",goOnline); window.removeEventListener("offline",goOffline); clearNtTimers(); };
  }, []);

  async function loadAll() {
    setAppLoading(true);
    try { const r = await store.get("mht_machines"); if (r) { const m = JSON.parse(r.value); setMachines(m); loadTodayEntries(m); } } catch(e) {}
    try {
      const rl = await store.list("mht_rpt:");
      if (rl && rl.keys && rl.keys.length) {
        const arr = [];
        for (let i = 0; i < rl.keys.length; i++) { try { const r = await store.get(rl.keys[i]); if (r) arr.push(JSON.parse(r.value)); } catch(e) {} }
        arr.sort(function(a,b) { return b.savedAt - a.savedAt; });
        setSavedReports(arr);
      }
    } catch(e) {}
    setAppLoading(false);
  }

  async function loadTodayEntries(ms) {
    const today = todayStr(), ne = {};
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]; if (!m.active) continue;
      try { const r = await store.get("mht_e:"+m.id+":"+today); ne[m.id] = r ? JSON.parse(r.value) : emptyRow(); } catch(e) { ne[m.id] = emptyRow(); }
    }
    setTodayEntries(ne);
  }

  async function loadEntryRange(mid, days) {
    const ne = {};
    for (let i = 0; i < days.length; i++) {
      const d = days[i];
      try { const r = await store.get("mht_e:"+mid+":"+d); ne[d] = r ? JSON.parse(r.value) : emptyRow(); } catch(e) { ne[d] = emptyRow(); }
    }
    setEntries(ne);
  }

  async function doSync() {
    if (!navigator.onLine) return;
    setSyncing(true);
    const q = offQ.get();
    for (let i = 0; i < q.length; i++) {
      try { await store.set(q[i].k, q[i].v); offQ.remove(q[i].k); } catch(e) { break; }
    }
    setPending(offQ.count());
    setSyncing(false);
  }

  async function saveMachines(list) {
    await store.set("mht_machines", JSON.stringify(list));
    setMachines(list);
    loadTodayEntries(list);
    setPending(offQ.count());
  }

  function setEF(date, field, val) {
    setEntries(function(p) {
      const c = p[date] || emptyRow();
      const n = Object.assign({}, c);
      n[field] = typeof val === "string" ? val.replace(/[^0-9.]/g,"") : val;
      return Object.assign({}, p, { [date]: n });
    });
  }
  function toggleNW(date) {
    setEntries(function(p) {
      const c = p[date] || emptyRow();
      return Object.assign({}, p, { [date]: Object.assign({}, c, { noWork:!c.noWork, dayStart:"", dayEnd:"", nightStart:"", nightEnd:"" }) });
    });
  }
  function setReason(date, val) {
    setEntries(function(p) { return Object.assign({}, p, { [date]: Object.assign({}, p[date]||emptyRow(), { reason:val }) }); });
  }

  async function saveAllEntries() {
    if (!entryMachine || !entryDays.length) return;
    setSaving(true); setSaveStatus("saving");
    for (let i = 0; i < entryDays.length; i++) {
      const d = entryDays[i], e = entries[d];
      if (!e) continue;
      const hasData = e.noWork || e.dayStart || e.dayEnd || e.nightStart || e.nightEnd;
      if (!hasData) continue;
      await store.set("mht_e:"+entryMachine.id+":"+d, JSON.stringify(Object.assign({}, e, { date:d, machineId:entryMachine.id, savedAt:Date.now() })));
    }
    setPending(offQ.count());
    setSaving(false); setSaveStatus("saved");
    loadTodayEntries(machines);
    setTimeout(function() { setSaveStatus(""); }, 2500);
  }

  async function getRange(mid, sd, ed) {
    const res = {}, cur = new Date(sd+"T12:00:00"), last = new Date(ed+"T12:00:00");
    while (cur <= last) {
      const ds = cur.toISOString().split("T")[0];
      try { const r = await store.get("mht_e:"+mid+":"+ds); if (r) res[ds] = JSON.parse(r.value); } catch(e) {}
      cur.setDate(cur.getDate()+1);
    }
    return res;
  }

  function getWeekRange(m, ref) {
    const d = new Date(ref+"T12:00:00"), sd = parseInt(m.startDay), bd = parseInt(m.breakDay);
    const back = (d.getDay()-sd+7)%7, s = new Date(d); s.setDate(d.getDate()-back);
    const fwd = (bd-sd+7)%7, e = new Date(s); e.setDate(s.getDate()+fwd);
    return { start: s.toISOString().split("T")[0], end: e.toISOString().split("T")[0] };
  }

  function updateNotif(cfg) { setNotifCfg(cfg); saveNotifCfg(cfg); scheduleNotifs(cfg); }
  async function requestNotifPerm(cfg) {
    if (!("Notification" in window)) { alert("Notifications not supported."); return; }
    const perm = await Notification.requestPermission();
    if (perm === "granted") { updateNotif(Object.assign({}, cfg, { enabled:true })); }
    else { alert("Permission denied. Enable notifications in browser settings."); }
  }

  async function generateReport() {
    if (!rMid) { setRError("Please select a machine."); return; }
    const machine = machines.find(function(m) { return m.id === rMid; });
    if (!machine) { setRError("Machine not found."); return; }
    setRLoading(true); setRError(""); setRResult("");
    let sd = rDate, ed = rDate;
    if (rType === "weekly") { const rng = getWeekRange(machine, rDate); sd = rng.start; ed = rng.end; }
    else if (rType === "custom") { sd = rFrom; ed = rTo; if (!sd||!ed) { setRError("Select start and end dates."); setRLoading(false); return; } }
    const rangeE = await getRange(rMid, sd, ed);
    const dates = buildDays(sd, ed);
    const dl = dates.map(function(d) {
      const e = rangeE[d], ds = fmtD(d, {weekday:"long",day:"numeric",month:"long",year:"numeric"});
      if (!e) return ds+": No data";
      if (e.noWork) return ds+": NO WORK — "+(e.reason||"No reason");
      const dh=calcH(e.dayStart,e.dayEnd), nh=calcH(e.nightStart,e.nightEnd);
      return ds+" | Day: "+(dh!==null?e.dayStart+"→"+e.dayEnd+" actual="+dh.toFixed(2)+"h billed="+billH(dh)+"h":"no data")+" | Night: "+(nh!==null?e.nightStart+"→"+e.nightEnd+" actual="+nh.toFixed(2)+"h billed="+billH(nh)+"h":"no data");
    }).join("\n");
    const wGroups = [];
    for (let wi=0; wi<dates.length; wi+=6) wGroups.push(dates.slice(wi,wi+6));
    const wl = wGroups.map(function(wD, w) {
      const dE = wD.map(function(d) { const e=rangeE[d],lb=fmtD(d,{weekday:"short",day:"numeric",month:"short"}); if(!e)return lb+": no data"; if(e.noWork)return lb+": NO WORK"; const db=billH(calcH(e.dayStart,e.dayEnd)); return lb+": "+(db!==null?db+"h":"no data"); }).join(", ");
      const nE = wD.map(function(d) { const e=rangeE[d],lb=fmtD(d,{weekday:"short",day:"numeric",month:"short"}); if(!e)return lb+": no data"; if(e.noWork)return lb+": NO WORK"; const nb=billH(calcH(e.nightStart,e.nightEnd)); return lb+": "+(nb!==null?nb+"h":"no data"); }).join(", ");
      const wDB = wD.reduce(function(s,d) { const e=rangeE[d]; return s+(e&&!e.noWork?(billH(calcH(e.dayStart,e.dayEnd))||0):0); }, 0);
      const wNB = wD.reduce(function(s,d) { const e=rangeE[d]; return s+(e&&!e.noWork?(billH(calcH(e.nightStart,e.nightEnd))||0):0); }, 0);
      return "Week "+(w+1)+" ("+fmtD(wD[0],{day:"numeric",month:"short"})+" to "+fmtD(wD[wD.length-1],{day:"numeric",month:"short"})+")\n  Day: "+dE+"\n  Day Total: "+wDB+"h\n  Night: "+nE+"\n  Night Total: "+wNB+"h\n  Week Total: "+(wDB+wNB)+"h";
    }).join("\n\n");
    const isD = rType==="daily";
    const pl = [
      "You are an industrial equipment analyst. Generate a structured professional report.",
      "Machine: "+machine.name, "Type: "+(isD?"Daily":rType==="weekly"?"Weekly":"Custom"),
      "Period: "+fmtD(sd,{weekday:"long",day:"numeric",month:"long",year:"numeric"})+(sd!==ed?" to "+fmtD(ed,{weekday:"long",day:"numeric",month:"long",year:"numeric"}):""),
      "Rules: 1 week=6 days. <30min rounds down, 30+min rounds up.", "", "DAILY DATA:", dl
    ];
    if (!isD) pl.push("", "WEEKLY DATA:", wl);
    if (isD) {
      pl.push("", "### [Full date]", "**Day Shift**: Start Odo, End Odo, Actual h, Billed h", "**Night Shift**: Start Odo, End Odo, Actual h, Billed h", "If NO WORK: state reason. End with brief observation.");
    } else {
      pl.push("", "## Daily Report — for each day: ### [date], Day Shift (start odo, end odo, actual, billed), Night Shift details. If NO WORK state reason.",
        "## Weekly Report — for each week: ### Week N, **Day Shifts** (each day), **Total Day Shift: Xh**, **Night Shifts** (each day), **Total Night Shift: Xh**, **Total Week: Xh + Xh = Xh**",
        "## Overall Summary: 3-4 sentences + 2 recommendations.");
    }
    pl.push("Use only data provided. Be precise and professional.");
    try {
      const res = await fetch("/api/generate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ model:"llama-3.3-70b-versatile", max_tokens:1500, messages:[{ role:"user", content:pl.join("\n") }] }) });
      const data = await res.json();
      if (!res.ok) { setRError("API error "+res.status+": "+(data.error||"Unknown")); setRLoading(false); return; }
      const text = (data.content||[]).map(function(b) { return b.text||""; }).join("");
      if (!text) { setRError("No report generated."); setRLoading(false); return; }
      setRResult(text);
      const entry = { id:Date.now().toString(), savedAt:Date.now(), machineName:machine.name, machineId:machine.id, type:rType, startDate:sd, endDate:ed, report:text };
      await store.set("mht_rpt:"+entry.id, JSON.stringify(entry));
      setPending(offQ.count());
      setSavedReports(function(prev) { return [entry].concat(prev); });
    } catch(e) { setRError("Request failed: "+e.message); }
    setRLoading(false);
  }

  // ── SHARED STYLES ─────────────────────────────────────────────
  const wrap = { padding:"1rem", maxWidth:700, margin:"0 auto", fontFamily:"var(--font-sans)" };
  const card = { background:"var(--color-background-primary)", border:"0.5px solid var(--color-border-tertiary)", borderRadius:"var(--border-radius-lg)", padding:"1rem 1.25rem", marginBottom:"0.875rem" };
  const sel  = { width:"100%", boxSizing:"border-box", padding:"8px", borderRadius:6, border:"0.5px solid var(--color-border-tertiary)", background:"var(--color-background-primary)", color:"var(--color-text-primary)", fontSize:13 };

  function StorageMode() {
    const inClaude = typeof window !== "undefined" && window.storage;
    const label = inClaude ? "☁ Claude" : "💾 Local";
    const bg    = inClaude ? "#EEEDFE" : "#FDF3E1";
    const color = inClaude ? "#4640A0" : "#A0752B";
    return <span style={{fontSize:11,background:bg,color,padding:"2px 8px",borderRadius:4,fontWeight:500}}>{label}</span>;
  }

  function StatusBar() {
    return (
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:"0.75rem",flexWrap:"wrap"}}>
        <span style={{fontSize:11,background:isOnline?"#E1F5EE":"#FEE9E9",color:isOnline?"#0F6E56":"#9B1C1C",padding:"2px 8px",borderRadius:4,fontWeight:500}}>{isOnline?"🟢 Online":"🔴 Offline"}</span>
        <StorageMode/>
        {pending > 0 && (
          <button onClick={doSync} disabled={syncing||!isOnline} style={{fontSize:11,background:"#FDF3E1",color:"#A0752B",border:"0.5px solid #D9A730",padding:"2px 8px",borderRadius:4,cursor:"pointer",fontWeight:500}}>
            {syncing ? "Syncing..." : "⚠ "+pending+" pending — Sync now"}
          </button>
        )}
      </div>
    );
  }

  function Nav() {
    const tabs = [
      {id:"home",label:"🏠 Home"},
      {id:"entry",label:"📋 Entry"},
      {id:"machines",label:"⚙ Machines"},
      {id:"reports",label:"📊 Reports"},
      {id:"history",label:"🕓 History"}
    ];
    return (
      <div style={{display:"flex",borderBottom:"0.5px solid var(--color-border-tertiary)",marginBottom:"1.25rem"}}>
        {tabs.map(function(t) {
          const active = view===t.id || (t.id==="machines" && view==="machineForm");
          return (
            <button key={t.id} onClick={function() { setView(t.id); setRResult(""); setRError(""); setSelReport(null); setEntryStep("machine"); setShowSettings(false); }}
              style={{flex:1,padding:"10px 2px",fontSize:12,fontWeight:active?600:400,color:active?"var(--color-text-primary)":"var(--color-text-secondary)",background:"transparent",border:"none",borderBottom:active?"2px solid var(--color-text-primary)":"2px solid transparent",cursor:"pointer"}}>
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (appLoading) {
    return <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",fontFamily:"var(--font-sans)"}}>Loading...</div>;
  }

  // ── SETTINGS ──────────────────────────────────────────────────
  if (view==="home" && showSettings) {
    return (
      <div style={wrap}>
        <Nav/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"1rem"}}>
          <button onClick={function(){setShowSettings(false);}} style={{fontSize:13,padding:"5px 10px"}}>← Back</button>
          <h2 style={{fontSize:18,fontWeight:600,margin:0,color:"var(--color-text-primary)"}}>Settings</h2>
        </div>
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
            <div>
              <div style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>Shift Reminders</div>
              <div style={{fontSize:12,color:"var(--color-text-secondary)",marginTop:2}}>Get notified to enter odometer readings</div>
            </div>
            <button onClick={function(){
              if (!notifCfg.enabled) { requestNotifPerm(notifCfg); }
              else { updateNotif(Object.assign({},notifCfg,{enabled:false})); }
            }} style={{padding:"6px 14px",fontSize:13,fontWeight:500,background:notifCfg.enabled?"#E1F5EE":"var(--color-background-secondary)",color:notifCfg.enabled?"#0F6E56":"var(--color-text-secondary)",border:"0.5px solid "+(notifCfg.enabled?"#7DD3BE":"var(--color-border-tertiary)"),borderRadius:6,cursor:"pointer"}}>
              {notifCfg.enabled ? "🔔 On — Disable" : "🔕 Off — Enable"}
            </button>
          </div>
          {notifCfg.enabled && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>☀ Day shift reminder</label>
                <input type="time" value={notifCfg.dayTime} onChange={function(ev){updateNotif(Object.assign({},notifCfg,{dayTime:ev.target.value}));}} style={{width:"100%",boxSizing:"border-box",fontSize:13}}/>
              </div>
              <div>
                <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>☾ Night shift reminder</label>
                <input type="time" value={notifCfg.nightTime} onChange={function(ev){updateNotif(Object.assign({},notifCfg,{nightTime:ev.target.value}));}} style={{width:"100%",boxSizing:"border-box",fontSize:13}}/>
              </div>
            </div>
          )}
        </div>
        <div style={card}>
          <div style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)",marginBottom:8}}>Storage</div>
          <div style={{fontSize:13,color:"var(--color-text-secondary)",lineHeight:1.7}}>
            <div>Mode: <strong><StorageMode/></strong></div>
            <div>Pending sync: <strong style={{color:pending>0?"#A0752B":"var(--color-text-primary)"}}>{pending} item{pending!==1?"s":""}</strong></div>
            {pending>0&&isOnline&&<button onClick={doSync} disabled={syncing} style={{marginTop:6,fontSize:12,padding:"4px 12px"}}>{syncing?"Syncing...":"Sync now"}</button>}
          </div>
        </div>
      </div>
    );
  }

  // ── HOME DASHBOARD ────────────────────────────────────────────
  if (view==="home") {
    const active = machines.filter(function(m){return m.active;});
    const todayList = active.map(function(m) {
      const e = todayEntries[m.id] || emptyRow();
      const dh = e.noWork?null:calcH(e.dayStart,e.dayEnd);
      const nh = e.noWork?null:calcH(e.nightStart,e.nightEnd);
      const db = billH(dh), nb = billH(nh);
      const totalBilled = (db||0)+(nb||0);
      const hasData = e.noWork || e.dayStart || e.nightStart;
      return { m, e, db, nb, totalBilled, hasData };
    });
    const totalHrsToday = todayList.reduce(function(s,t){return s+t.totalBilled;},0);
    const workingCount  = todayList.filter(function(t){return t.hasData&&!t.e.noWork;}).length;
    const noWorkCount   = todayList.filter(function(t){return t.e.noWork;}).length;
    const pendingEntry  = todayList.filter(function(t){return !t.hasData;}).length;
    const hr = new Date().getHours();
    const greeting = hr<12?"Morning":hr<17?"Afternoon":"Evening";

    return (
      <div style={wrap}>
        <Nav/>
        <StatusBar/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1rem"}}>
          <div>
            <h2 style={{fontSize:20,fontWeight:600,margin:"0 0 2px",color:"var(--color-text-primary)"}}>Good {greeting} 👋</h2>
            <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:0}}>{new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
          </div>
          <button onClick={function(){setShowSettings(true);}} style={{fontSize:12,padding:"6px 12px",background:"var(--color-background-secondary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:6,cursor:"pointer"}}>⚙ Settings</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,marginBottom:"1.25rem"}}>
          {[
            {label:"Total hrs today",  value:totalHrsToday+"h",  color:"var(--color-text-primary)",bg:"var(--color-background-secondary)"},
            {label:"Working",           value:workingCount+"/"+active.length, color:"#0F6E56", bg:"#E1F5EE"},
            {label:"No work",           value:noWorkCount, color:noWorkCount>0?"#9B1C1C":"var(--color-text-primary)", bg:noWorkCount>0?"#FEE9E9":"var(--color-background-secondary)"},
            {label:"Pending entry",     value:pendingEntry, color:pendingEntry>0?"#A0752B":"var(--color-text-primary)", bg:pendingEntry>0?"#FDF3E1":"var(--color-background-secondary)"},
          ].map(function(c,i) {
            return (
              <div key={i} style={{background:c.bg,borderRadius:"var(--border-radius-md)",padding:"0.75rem"}}>
                <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>{c.label}</div>
                <div style={{fontSize:20,fontWeight:600,color:c.color}}>{c.value}</div>
              </div>
            );
          })}
        </div>

        {active.length === 0 ? (
          <div style={{textAlign:"center",padding:"2rem 0",color:"var(--color-text-tertiary)"}}>
            <div style={{fontSize:32,marginBottom:8}}>⚙</div>
            <p style={{fontSize:14,margin:"0 0 12px"}}>No machines registered yet.</p>
            <button onClick={function(){setView("machines");}} style={{fontSize:13,padding:"8px 16px"}}>Register a Machine</button>
          </div>
        ) : (
          <>
            <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-secondary)",margin:"0 0 0.75rem"}}>Today's status</p>
            {todayList.map(function(t) {
              const statusColor = t.e.noWork?"#9B1C1C":t.hasData?"#0F6E56":"#A0752B";
              const statusBg    = t.e.noWork?"#FEE9E9":t.hasData?"#E1F5EE":"#FDF3E1";
              const statusLabel = t.e.noWork?"No Work":t.hasData?t.totalBilled+"h billed":"Not entered";
              return (
                <div key={t.m.id} onClick={function(){ setEntryMachine(t.m); setEntryFrom(todayStr()); setEntryTo(todayStr()); setEntryDays([todayStr()]); loadEntryRange(t.m.id,[todayStr()]); setEntryStep("list"); setView("entry"); }}
                  style={Object.assign({},card,{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"})}>
                  <div>
                    <div style={{fontSize:14,fontWeight:500,color:"var(--color-text-primary)"}}>{t.m.name}</div>
                    <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:2}}>
                      {t.hasData&&!t.e.noWork ? ("Day: "+(t.db!==null?t.db+"h":"—")+" · Night: "+(t.nb!==null?t.nb+"h":"—")) : (DAY_FULL[t.m.startDay]+" → "+DAY_FULL[t.m.breakDay])}
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:12,fontWeight:500,background:statusBg,color:statusColor,padding:"3px 10px",borderRadius:4}}>{statusLabel}</span>
                    <span style={{color:"var(--color-text-tertiary)"}}>→</span>
                  </div>
                </div>
              );
            })}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:4}}>
              <button onClick={function(){setEntryStep("machine");setView("entry");}} style={{padding:"10px",fontSize:13,background:"var(--color-background-secondary)"}}>📋 Enter Hours</button>
              <button onClick={function(){setView("reports");}} style={{padding:"10px",fontSize:13,background:"var(--color-background-secondary)"}}>📊 Generate Report</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── ENTRY STEP 1 — Select machine ─────────────────────────────
  if (view==="entry" && entryStep==="machine") {
    const active = machines.filter(function(m){return m.active;});
    return (
      <div style={wrap}>
        <Nav/>
        <StatusBar/>
        <h2 style={{fontSize:18,fontWeight:600,margin:"0 0 0.25rem",color:"var(--color-text-primary)"}}>Enter Hours</h2>
        <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"0 0 1rem"}}>Step 1 of 3 — Select a machine</p>
        {active.length===0 && (
          <div style={{textAlign:"center",padding:"3rem 0",color:"var(--color-text-tertiary)"}}>
            <div style={{fontSize:32,marginBottom:8}}>⚙</div>
            <p style={{fontSize:14,margin:"0 0 12px"}}>No machines registered yet.</p>
            <button onClick={function(){setView("machines");}} style={{fontSize:13,padding:"8px 16px"}}>Register a Machine</button>
          </div>
        )}
        {active.map(function(m) {
          return (
            <div key={m.id} onClick={function(){setEntryMachine(m);setEntryFrom("");setEntryTo("");setEntries({});setEntryStep("range");}}
              style={Object.assign({},card,{cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"})}>
              <div>
                <div style={{fontSize:15,fontWeight:600,color:"var(--color-text-primary)"}}>{m.name}</div>
                <div style={{fontSize:12,color:"var(--color-text-tertiary)",marginTop:2}}>{DAY_FULL[m.startDay]} → {DAY_FULL[m.breakDay]}</div>
              </div>
              <span style={{fontSize:16,color:"var(--color-text-tertiary)"}}>→</span>
            </div>
          );
        })}
      </div>
    );
  }

  // ── ENTRY STEP 2 — Select date range ──────────────────────────
  if (view==="entry" && entryStep==="range") {
    const rangeErr = entryFrom&&entryTo&&new Date(entryTo)<new Date(entryFrom) ? "End date must be after start date." : null;
    const dayCount  = entryFrom&&entryTo&&!rangeErr ? buildDays(entryFrom,entryTo).length : 0;
    return (
      <div style={Object.assign({},wrap,{maxWidth:480})}>
        <Nav/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"1rem"}}>
          <button onClick={function(){setEntryStep("machine");}} style={{fontSize:13,padding:"5px 10px"}}>← Back</button>
          <div>
            <h2 style={{fontSize:18,fontWeight:600,margin:0,color:"var(--color-text-primary)"}}>{entryMachine&&entryMachine.name}</h2>
            <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"2px 0 0"}}>Step 2 of 3 — Select date range</p>
          </div>
        </div>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1rem"}}>
            <div>
              <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>From</label>
              <input type="date" value={entryFrom} onChange={function(ev){setEntryFrom(ev.target.value);}} style={{width:"100%",boxSizing:"border-box"}}/>
            </div>
            <div>
              <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>To</label>
              <input type="date" value={entryTo} onChange={function(ev){setEntryTo(ev.target.value);}} style={{width:"100%",boxSizing:"border-box",borderColor:rangeErr?"var(--color-border-danger)":undefined}}/>
            </div>
          </div>
          {rangeErr && <p style={{fontSize:12,color:"var(--color-text-danger)",margin:"-4px 0 12px"}}>{rangeErr}</p>}
          {dayCount>0 && !rangeErr && (
            <div style={{background:"var(--color-background-secondary)",borderRadius:6,padding:"8px 12px",marginBottom:"1rem",fontSize:13,color:"var(--color-text-secondary)"}}>
              📅 <strong style={{color:"var(--color-text-primary)"}}>{dayCount} day{dayCount>1?"s":""}</strong>
              {" — "+fmtD(entryFrom,{weekday:"short",day:"numeric",month:"short"})+" to "+fmtD(entryTo,{weekday:"short",day:"numeric",month:"short"})}
            </div>
          )}
          <button onClick={function(){
            const days = buildDays(entryFrom, entryTo);
            setEntryDays(days);
            loadEntryRange(entryMachine.id, days);
            setEntryStep("list");
          }} disabled={!entryFrom||!entryTo||!!rangeErr||dayCount===0}
            style={{width:"100%",padding:"10px",fontWeight:500,fontSize:14}}>
            Continue → Enter readings
          </button>
        </div>
      </div>
    );
  }

  // ── ENTRY STEP 3 — Day list ───────────────────────────────────
  if (view==="entry" && entryStep==="list") {
    const inp = { width:"100%", boxSizing:"border-box", fontSize:13 };
    return (
      <div style={wrap}>
        <Nav/>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <button onClick={function(){setEntryStep("range");setSaveStatus("");}} style={{fontSize:13,padding:"5px 10px"}}>← Back</button>
            <div>
              <h2 style={{fontSize:18,fontWeight:600,margin:0,color:"var(--color-text-primary)"}}>{entryMachine&&entryMachine.name}</h2>
              <p style={{fontSize:13,color:"var(--color-text-secondary)",margin:"2px 0 0"}}>
                {fmtD(entryFrom,{day:"numeric",month:"short"})} — {fmtD(entryTo,{day:"numeric",month:"short",year:"numeric"})} · {entryDays.length} day{entryDays.length>1?"s":""}
              </p>
            </div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"72px 1fr 1fr 8px 1fr 1fr 68px",gap:"4px 8px",marginBottom:6,padding:"0 1rem"}}>
          <span/>
          <span style={{fontSize:11,color:"#A0752B",textAlign:"center",background:"#FDF3E1",borderRadius:4,padding:"2px 0"}}>☀ Start</span>
          <span style={{fontSize:11,color:"#A0752B",textAlign:"center",background:"#FDF3E1",borderRadius:4,padding:"2px 0"}}>☀ End</span>
          <span/>
          <span style={{fontSize:11,color:"#4640A0",textAlign:"center",background:"#EEEDFE",borderRadius:4,padding:"2px 0"}}>☾ Start</span>
          <span style={{fontSize:11,color:"#4640A0",textAlign:"center",background:"#EEEDFE",borderRadius:4,padding:"2px 0"}}>☾ End</span>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)",textAlign:"right"}}>Billed</span>
        </div>

        {entryDays.map(function(d) {
          const e    = entries[d] || emptyRow();
          const dh   = e.noWork ? null : calcH(e.dayStart, e.dayEnd);
          const nh   = e.noWork ? null : calcH(e.nightStart, e.nightEnd);
          const db   = billH(dh), nb = billH(nh);
          const dErr = !e.noWork && e.dayStart && e.dayEnd && parseFloat(e.dayEnd) < parseFloat(e.dayStart);
          const nErr = !e.noWork && e.nightStart && e.nightEnd && parseFloat(e.nightEnd) < parseFloat(e.nightStart);
          const dateObj = new Date(d+"T12:00:00");
          const isWeekend = dateObj.getDay()===0 || dateObj.getDay()===6;
          return (
            <div key={d} style={Object.assign({},card,{padding:"0.75rem 1rem",marginBottom:6})}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div>
                  <span style={{fontSize:13,fontWeight:600,color:isWeekend?"var(--color-text-secondary)":"var(--color-text-primary)"}}>{DAY_NAMES[dateObj.getDay()]}</span>
                  <span style={{fontSize:12,color:"var(--color-text-tertiary)",marginLeft:6}}>{fmtD(d,{day:"numeric",month:"short"})}</span>
                </div>
                <button onClick={function(){toggleNW(d);}}
                  style={{fontSize:11,padding:"2px 8px",background:e.noWork?"#FEE9E9":"var(--color-background-secondary)",color:e.noWork?"#9B1C1C":"var(--color-text-secondary)",border:"0.5px solid "+(e.noWork?"#FECACA":"var(--color-border-tertiary)"),borderRadius:4,cursor:"pointer"}}>
                  {e.noWork ? "Undo" : "No work"}
                </button>
              </div>
              {e.noWork ? (
                <input type="text" placeholder="Reason (e.g. breakdown, holiday...)" value={e.reason}
                  onChange={function(ev){setReason(d,ev.target.value);}} style={inp}/>
              ) : (
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 8px 1fr 1fr 68px",gap:"4px 8px"}}>
                    <input type="text" inputMode="decimal" placeholder="0.0" value={e.dayStart} onChange={function(ev){setEF(d,"dayStart",ev.target.value);}} style={Object.assign({},inp,{borderColor:dErr?"var(--color-border-danger)":undefined})}/>
                    <input type="text" inputMode="decimal" placeholder="0.0" value={e.dayEnd}   onChange={function(ev){setEF(d,"dayEnd",ev.target.value);}}   style={Object.assign({},inp,{borderColor:dErr?"var(--color-border-danger)":undefined})}/>
                    <div style={{width:1,background:"var(--color-border-tertiary)",margin:"0 auto"}}/>
                    <input type="text" inputMode="decimal" placeholder="0.0" value={e.nightStart} onChange={function(ev){setEF(d,"nightStart",ev.target.value);}} style={Object.assign({},inp,{borderColor:nErr?"var(--color-border-danger)":undefined})}/>
                    <input type="text" inputMode="decimal" placeholder="0.0" value={e.nightEnd}   onChange={function(ev){setEF(d,"nightEnd",ev.target.value);}}   style={Object.assign({},inp,{borderColor:nErr?"var(--color-border-danger)":undefined})}/>
                    <div style={{textAlign:"right",fontSize:13,fontWeight:600,color:"var(--color-text-primary)",paddingTop:5}}>
                      {(db!==null||nb!==null) ? ((db||0)+(nb||0))+"h" : "—"}
                    </div>
                  </div>
                  {(dh!==null||nh!==null) && (
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 8px 1fr 1fr 68px",gap:"2px 8px",marginTop:3}}>
                      <span style={{gridColumn:"1/3",fontSize:10,color:dErr?"var(--color-text-danger)":"var(--color-text-tertiary)"}}>{dErr?"end<start":dh!==null?"= "+fmt(dh):""}</span>
                      <span/>
                      <span style={{gridColumn:"4/6",fontSize:10,color:nErr?"var(--color-text-danger)":"var(--color-text-tertiary)"}}>{nErr?"end<start":nh!==null?"= "+fmt(nh):""}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        <div style={{position:"sticky",bottom:0,background:"var(--color-background-primary)",borderTop:"0.5px solid var(--color-border-tertiary)",padding:"0.875rem 0",marginTop:"0.5rem"}}>
          {!isOnline && <p style={{fontSize:11,color:"#A0752B",margin:"0 0 6px",textAlign:"center"}}>📴 Offline — will sync when back online</p>}
          <button onClick={saveAllEntries} disabled={saving}
            style={{width:"100%",padding:"11px",fontWeight:600,fontSize:14,background:saveStatus==="saved"?"#E1F5EE":undefined,color:saveStatus==="saved"?"#0F6E56":undefined}}>
            {saveStatus==="saving" ? "Saving..." : saveStatus==="saved" ? "✓ All entries saved!" : "Save All Entries"}
          </button>
        </div>
      </div>
    );
  }

  // ── MACHINES LIST ─────────────────────────────────────────────
  if (view==="machines") {
    return (
      <div style={wrap}>
        <Nav/>
        <StatusBar/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <h2 style={{fontSize:18,fontWeight:600,margin:0,color:"var(--color-text-primary)"}}>Machines</h2>
          <button onClick={function(){setEditM(null);setMName("");setMStart(1);setMBreak(6);setView("machineForm");}} style={{fontSize:13,padding:"7px 16px",fontWeight:500}}>+ Register Machine</button>
        </div>
        {machines.length===0 && (
          <div style={{textAlign:"center",padding:"3rem 0",color:"var(--color-text-tertiary)"}}>
            <div style={{fontSize:32,marginBottom:8}}>⚙</div>
            <p style={{fontSize:14}}>No machines registered yet.</p>
          </div>
        )}
        {machines.map(function(m) {
          return (
            <div key={m.id} style={Object.assign({},card,{opacity:m.active?1:0.6})}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:15,fontWeight:600,color:"var(--color-text-primary)"}}>{m.name}</div>
                  <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:3}}>
                    {DAY_FULL[m.startDay]} → {DAY_FULL[m.breakDay]}
                    <span style={{marginLeft:8,fontSize:11,background:m.active?"#E1F5EE":"var(--color-background-secondary)",color:m.active?"#0F6E56":"var(--color-text-tertiary)",padding:"1px 6px",borderRadius:4}}>
                      {m.active?"Active":"Inactive"}
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  <button onClick={function(){setEditM(m);setMName(m.name);setMStart(m.startDay);setMBreak(m.breakDay);setView("machineForm");}} style={{fontSize:12,padding:"4px 10px"}}>Edit</button>
                  <button onClick={function(){saveMachines(machines.map(function(x){return x.id===m.id?Object.assign({},x,{active:!x.active}):x;}));}} style={{fontSize:12,padding:"4px 10px"}}>{m.active?"Deactivate":"Activate"}</button>
                  <button onClick={function(){saveMachines(machines.filter(function(x){return x.id!==m.id;}));}} style={{fontSize:12,padding:"4px 10px",color:"var(--color-text-danger)"}}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── MACHINE FORM ──────────────────────────────────────────────
  if (view==="machineForm") {
    return (
      <div style={Object.assign({},wrap,{maxWidth:480})}>
        <Nav/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"1rem"}}>
          <button onClick={function(){setView("machines");}} style={{fontSize:13,padding:"5px 10px"}}>← Back</button>
          <h2 style={{fontSize:18,fontWeight:600,margin:0,color:"var(--color-text-primary)"}}>{editM?"Edit Machine":"Register Machine"}</h2>
        </div>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem"}}>
          <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Machine name / ID</label>
          <input type="text" placeholder="e.g. Excavator #7" value={mName} onChange={function(e){setMName(e.target.value);}} style={{width:"100%",boxSizing:"border-box",marginBottom:"1.25rem"}}/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1.25rem"}}>
            <div>
              <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Start day</label>
              <select value={mStart} onChange={function(e){setMStart(parseInt(e.target.value));}} style={sel}>
                {DAY_FULL.map(function(d,i){return <option key={i} value={i}>{d}</option>;})}
              </select>
            </div>
            <div>
              <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Breaking day</label>
              <select value={mBreak} onChange={function(e){setMBreak(parseInt(e.target.value));}} style={sel}>
                {DAY_FULL.map(function(d,i){return <option key={i} value={i}>{d}</option>;})}
              </select>
            </div>
          </div>
          <div style={{background:"var(--color-background-secondary)",borderRadius:"var(--border-radius-md)",padding:"10px 12px",marginBottom:"1.25rem",fontSize:13,color:"var(--color-text-secondary)"}}>
            Works from <strong>{DAY_FULL[mStart]}</strong> to <strong>{DAY_FULL[mBreak]}</strong> (6 days).
          </div>
          <button onClick={async function(){
            if (!mName.trim()) return;
            let list;
            if (editM) { list = machines.map(function(m){return m.id===editM.id?Object.assign({},m,{name:mName.trim(),startDay:parseInt(mStart),breakDay:parseInt(mBreak)}):m;}); }
            else { list = machines.concat([{id:Date.now().toString(),name:mName.trim(),startDay:parseInt(mStart),breakDay:parseInt(mBreak),active:true}]); }
            await saveMachines(list); setView("machines");
          }} disabled={!mName.trim()} style={{width:"100%",padding:"10px",fontWeight:500,fontSize:14}}>
            {editM ? "Save Changes" : "Register Machine"}
          </button>
        </div>
      </div>
    );
  }

  // ── REPORTS ───────────────────────────────────────────────────
  if (view==="reports") {
    const actM = machines.filter(function(m){return m.active;});
    const selM = machines.find(function(m){return m.id===rMid;});
    const period = rType==="daily" ? fmtD(rDate,{day:"numeric",month:"short",year:"numeric"})
      : rType==="weekly"&&selM ? (function(){const r=getWeekRange(selM,rDate);return fmtD(r.start,{day:"numeric",month:"short"})+" – "+fmtD(r.end,{day:"numeric",month:"short",year:"numeric"});})()
      : rFrom&&rTo ? fmtD(rFrom,{day:"numeric",month:"short"})+" – "+fmtD(rTo,{day:"numeric",month:"short",year:"numeric"}) : "";
    return (
      <div style={wrap}>
        <Nav/>
        <StatusBar/>
        <h2 style={{fontSize:18,fontWeight:600,margin:"0 0 1rem",color:"var(--color-text-primary)"}}>Generate Report</h2>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem",marginBottom:"1rem"}}>
          <div style={{display:"flex",gap:6,marginBottom:"1.25rem"}}>
            {[["daily","📅 Daily"],["weekly","📆 Weekly"],["custom","🗓 Custom"]].map(function(t) {
              const active = rType===t[0];
              return (
                <button key={t[0]} onClick={function(){setRType(t[0]);setRResult("");setRError("");}}
                  style={{flex:1,padding:"7px",fontSize:13,fontWeight:active?600:400,background:active?"var(--color-background-active)":"var(--color-background-secondary)",borderRadius:6,border:"0.5px solid "+(active?"var(--color-border-secondary)":"var(--color-border-tertiary)"),cursor:"pointer"}}>
                  {t[1]}
                </button>
              );
            })}
          </div>
          <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Select machine</label>
          <select value={rMid} onChange={function(e){setRMid(e.target.value);setRResult("");setRError("");}} style={Object.assign({},sel,{marginBottom:"1.25rem"})}>
            <option value="">— Choose a machine —</option>
            {actM.map(function(m){return <option key={m.id} value={m.id}>{m.name}</option>;})}
          </select>
          {rType==="daily" && (
            <div style={{marginBottom:"1rem"}}>
              <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Date</label>
              <input type="date" value={rDate} onChange={function(e){setRDate(e.target.value);setRResult("");}} style={{width:"100%",boxSizing:"border-box"}}/>
            </div>
          )}
          {rType==="weekly" && (
            <div style={{marginBottom:"1rem"}}>
              <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>Pick any date within the week</label>
              <input type="date" value={rDate} onChange={function(e){setRDate(e.target.value);setRResult("");}} style={{width:"100%",boxSizing:"border-box",marginBottom:6}}/>
              {rDate&&selM&&(function(){
                const rng=getWeekRange(selM,rDate);
                return <div style={{fontSize:12,color:"var(--color-text-secondary)",background:"var(--color-background-secondary)",padding:"6px 10px",borderRadius:6}}>{"Week: "+fmtD(rng.start,{weekday:"short",day:"numeric",month:"short"})+" → "+fmtD(rng.end,{weekday:"short",day:"numeric",month:"short"})}</div>;
              })()}
            </div>
          )}
          {rType==="custom" && (
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1rem"}}>
              <div>
                <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>From</label>
                <input type="date" value={rFrom} onChange={function(e){setRFrom(e.target.value);setRResult("");}} style={{width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:13,color:"var(--color-text-secondary)",display:"block",marginBottom:6}}>To</label>
                <input type="date" value={rTo} onChange={function(e){setRTo(e.target.value);setRResult("");}} style={{width:"100%",boxSizing:"border-box"}}/>
              </div>
            </div>
          )}
          <button onClick={generateReport} disabled={!rMid||rLoading} style={{width:"100%",padding:"10px",fontWeight:500,fontSize:14}}>
            {rLoading ? "Generating..." : "Generate Report ↗"}
          </button>
          {rError && <p style={{fontSize:13,color:"var(--color-text-danger)",margin:"8px 0 0"}}>{rError}</p>}
        </div>
        {rLoading && (
          <div style={{display:"flex",alignItems:"center",gap:10,color:"var(--color-text-secondary)",fontSize:14,padding:"1rem"}}>
            <span style={{display:"inline-block",width:14,height:14,border:"2px solid var(--color-border-secondary)",borderTopColor:"var(--color-text-secondary)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            Analyzing data...
          </div>
        )}
        {rResult && (
          <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem"}}>
            <p style={{fontSize:13,fontWeight:500,color:"var(--color-text-secondary)",margin:"0 0 0.75rem"}}>
              {(rType.charAt(0).toUpperCase()+rType.slice(1))+" Report — "+(selM?selM.name:"")}
            </p>
            <div style={{fontSize:14,lineHeight:1.75,color:"var(--color-text-primary)"}} dangerouslySetInnerHTML={{__html:renderMD(rResult)}}/>
            <DownloadBar report={rResult} name={selM?selM.name:"Machine"} type={rType.charAt(0).toUpperCase()+rType.slice(1)} period={period}/>
          </div>
        )}
        <style>{"@keyframes spin{to{transform:rotate(360deg);}}"}</style>
      </div>
    );
  }

  // ── HISTORY LIST ──────────────────────────────────────────────
  if (view==="history" && !selReport) {
    return (
      <div style={wrap}>
        <Nav/>
        <StatusBar/>
        <h2 style={{fontSize:18,fontWeight:600,margin:"0 0 1rem",color:"var(--color-text-primary)"}}>Report History</h2>
        {savedReports.length===0 && (
          <div style={{textAlign:"center",padding:"3rem 0",color:"var(--color-text-tertiary)"}}>
            <div style={{fontSize:32,marginBottom:8}}>📋</div>
            <p style={{fontSize:14}}>No reports generated yet.</p>
          </div>
        )}
        {savedReports.map(function(r) {
          const d  = new Date(r.savedAt);
          const tl = r.type==="daily"?"Daily":r.type==="weekly"?"Weekly":"Custom";
          return (
            <div key={r.id} onClick={function(){setSelReport(r);}} style={Object.assign({},card,{cursor:"pointer"})}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontSize:15,fontWeight:500,color:"var(--color-text-primary)"}}>{r.machineName}</div>
                  <div style={{fontSize:13,color:"var(--color-text-secondary)",marginTop:3}}>
                    <span style={{background:"var(--color-background-secondary)",padding:"1px 6px",borderRadius:4,marginRight:6,fontSize:12}}>{tl}</span>
                    {r.startDate===r.endDate ? fmtD(r.startDate,{day:"numeric",month:"short",year:"numeric"}) : fmtD(r.startDate,{day:"numeric",month:"short"})+" → "+fmtD(r.endDate,{day:"numeric",month:"short",year:"numeric"})}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>{d.toLocaleDateString("en-GB",{day:"numeric",month:"short"})} {d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</div>
                  <button onClick={function(ev){
                    ev.stopPropagation();
                    store.delete("mht_rpt:"+r.id);
                    setSavedReports(function(prev){return prev.filter(function(x){return x.id!==r.id;});});
                  }} style={{fontSize:11,padding:"2px 8px",marginTop:4,color:"var(--color-text-tertiary)",background:"transparent",border:"0.5px solid var(--color-border-tertiary)",borderRadius:4,cursor:"pointer"}}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── HISTORY DETAIL ────────────────────────────────────────────
  if (view==="history" && selReport) {
    const tl = selReport.type==="daily"?"Daily":selReport.type==="weekly"?"Weekly":"Custom";
    return (
      <div style={wrap}>
        <Nav/>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:"1rem"}}>
          <button onClick={function(){setSelReport(null);}} style={{fontSize:13,padding:"5px 10px"}}>← Back</button>
          <div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--color-text-primary)"}}>{selReport.machineName}</div>
            <div style={{fontSize:12,color:"var(--color-text-secondary)"}}>{tl} Report · {selReport.startDate===selReport.endDate ? fmtD(selReport.startDate,{day:"numeric",month:"long",year:"numeric"}) : fmtD(selReport.startDate,{day:"numeric",month:"short"})+" → "+fmtD(selReport.endDate,{day:"numeric",month:"short",year:"numeric"})}</div>
          </div>
        </div>
        <div style={{background:"var(--color-background-primary)",border:"0.5px solid var(--color-border-tertiary)",borderRadius:"var(--border-radius-lg)",padding:"1.25rem"}}>
          <div style={{fontSize:14,lineHeight:1.75,color:"var(--color-text-primary)"}} dangerouslySetInnerHTML={{__html:renderMD(selReport.report)}}/>
          <DownloadBar report={selReport.report} name={selReport.machineName} type={tl} period={selReport.startDate===selReport.endDate ? fmtD(selReport.startDate,{day:"numeric",month:"short",year:"numeric"}) : fmtD(selReport.startDate,{day:"numeric",month:"short"})+" – "+fmtD(selReport.endDate,{day:"numeric",month:"short",year:"numeric"})}/>
        </div>
        <style>{"@keyframes spin{to{transform:rotate(360deg);}}"}</style>
      </div>
    );
  }

  return null;
}
