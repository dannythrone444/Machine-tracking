import React, { useState, useEffect } from 'react';

// ─── Storage helpers ─────────────────────────────────────────────────────────
function storageGet(key) {
  try { if (window.storage) return window.storage.getItem(key); } catch (_) {}
  try { return localStorage.getItem('mht_l:' + key); } catch (_) { return null; }
}
function storageSet(key, value) {
  try { if (window.storage) window.storage.setItem(key, value); } catch (_) {}
  try { localStorage.setItem('mht_l:' + key, value); } catch (_) {}
}
function lsGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }

// ─── Date helpers ─────────────────────────────────────────────────────────────
const DAY_ABBR = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MON_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_ABBR[d.getDay()] + ' ' + d.getDate() + ' ' + MON_ABBR[d.getMonth()];
}
function fmtLong(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_ABBR[d.getDay()] + ', ' + d.getDate() + ' ' + MON_ABBR[d.getMonth()] + ' ' + d.getFullYear();
}
function datesBetween(from, to) {
  const list = [];
  const cur = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (cur <= end) { list.push(cur.toISOString().slice(0,10)); cur.setDate(cur.getDate()+1); }
  return list;
}
function todayStr() { return new Date().toISOString().slice(0,10); }

// ─── Business logic ───────────────────────────────────────────────────────────
function calcBilled(start, end) {
  const diff = parseFloat(end) - parseFloat(start);
  if (!diff || diff <= 0) return 0;
  return Math.round(diff);
}

// ─── Weekly section builder (format locked — not sent to AI) ─────────────────
function buildWeeklySection(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const weeks = [];
  for (let i = 0; i < sorted.length; i += 6) weeks.push(sorted.slice(i, i + 6));

  let out = '2. Weekly Report\n\n';

  weeks.forEach((week, wi) => {
    const first = fmtShort(week[0].date);
    const last  = fmtShort(week[week.length - 1].date);
    out += 'Week ' + (wi + 1) + ' (' + first + ' – ' + last + ')\n\n';

    // Day shifts
    out += '#### Day Shifts\n';
    let dayTotal = 0;
    week.forEach(e => {
      if (e.noWork) { out += '• ' + fmtShort(e.date) + ': NO WORK\n'; return; }
      const b = calcBilled(e.dayStart, e.dayEnd);
      dayTotal += b;
      out += '• ' + fmtShort(e.date) + ': ' + b + 'h (' + e.dayStart + ' → ' + e.dayEnd + ')\n';
    });
    out += '\nTotal Day Shift: ' + dayTotal + 'h\n';

    // Night shifts
    out += '#### Night Shifts\n';
    let nightTotal = 0;
    week.forEach(e => {
      if (e.noWork) { out += '• ' + fmtShort(e.date) + ': NO WORK\n'; return; }
      const b = calcBilled(e.nightStart, e.nightEnd);
      nightTotal += b;
      out += '• ' + fmtShort(e.date) + ': ' + b + 'h (' + e.nightStart + ' → ' + e.nightEnd + ')\n';
    });
    out += '\nTotal Night Shift: ' + nightTotal + 'h\n';

    // Totals
    out += '#### Weekly Totals\n';
    out += '• Day Shift: ' + dayTotal + 'h\n';
    out += '• Night Shift: ' + nightTotal + 'h\n';
    out += '• Combined Week Total: ' + (dayTotal + nightTotal) + 'h\n\n---\n\n';
  });

  return out;
}

// ─── Daily section builder ────────────────────────────────────────────────────
function buildDailySection(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  let out = '1. Daily Report\n\n';
  sorted.forEach(e => {
    out += fmtLong(e.date) + '\n';
    if (e.noWork) {
      out += '  No Work—' + (e.noWorkReason || 'No reason given') + '\n\n';
      return;
    }
    const dayActual = ((parseFloat(e.dayEnd)||0) - (parseFloat(e.dayStart)||0)).toFixed(1);
    const dayBilled = calcBilled(e.dayStart, e.dayEnd);
    const nightActual = ((parseFloat(e.nightEnd)||0) - (parseFloat(e.nightStart)||0)).toFixed(1);
    const nightBilled = calcBilled(e.nightStart, e.nightEnd);
    out += '  Day Shift:   Start ' + (e.dayStart||'—') + '  End ' + (e.dayEnd||'—') + '  |  Actual: ' + dayActual + 'h  |  Billed: ' + dayBilled + 'h\n';
    out += '  Night Shift: Start ' + (e.nightStart||'—') + '  End ' + (e.nightEnd||'—') + '  |  Actual: ' + nightActual + 'h  |  Billed: ' + nightBilled + 'h\n\n';
  });
  return out;
}

// ─── Report generation ────────────────────────────────────────────────────────
async function generateReport(entries, machine, dateLabel) {
  const dailySection  = buildDailySection(entries);
  const weeklySection = buildWeeklySection(entries);

  const noWorkDays = entries.filter(e => e.noWork).length;
  const totalDayH  = entries.reduce((s, e) => s + calcBilled(e.dayStart, e.dayEnd), 0);
  const totalNightH = entries.reduce((s, e) => s + calcBilled(e.nightStart, e.nightEnd), 0);

  const prompt =
    'You are generating a machine hours report for ' + machine.name + '. Period: ' + dateLabel + '.\n\n' +
    'Output the report in EXACTLY three numbered sections.\n\n' +
    'SECTION 1 and SECTION 2 are pre-built below — copy them character-for-character, do not alter any number, date, arrow, bullet or heading.\n\n' +
    dailySection + '\n' +
    weeklySection +
    '3. Overall Summary\n' +
    'Write exactly 2–3 sentences. Facts to mention: total day hours = ' + totalDayH + 'h, total night hours = ' + totalNightH + 'h, combined = ' + (totalDayH + totalNightH) + 'h, no-work days = ' + noWorkDays + '. Note any patterns (consistent output, high/low days). Be concise and professional. Do not repeat section headings.';

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 2400 })
  });
  if (!res.ok) throw new Error('API error ' + res.status);
  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  if (!text) throw new Error('Empty response from AI');
  return text;
}

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

    // Section headers
    if (/^1\.\s+Daily/i.test(t)) {
      out.push('━━━━━━━━━━━━━━━━━━━━');
      out.push('📋 *DAILY REPORT*');
      out.push('━━━━━━━━━━━━━━━━━━━━');
      return;
    }
    if (/^2\.\s+Weekly/i.test(t)) {
      out.push('');
      out.push('━━━━━━━━━━━━━━━━━━━━');
      out.push('📊 *WEEKLY REPORT*');
      out.push('━━━━━━━━━━━━━━━━━━━━');
      return;
    }
    if (/^3\.\s+Overall/i.test(t)) {
      out.push('');
      out.push('━━━━━━━━━━━━━━━━━━━━');
      out.push('💬 *SUMMARY*');
      out.push('━━━━━━━━━━━━━━━━━━━━');
      return;
    }

    // Week header
    if (/^Week\s+\d+/i.test(t)) {
      out.push('');
      out.push('📆 *' + t + '*');
      return;
    }

    // Sub-headers
    if (t.startsWith('####')) {
      const label = t.replace(/^#+\s*/, '');
      const icon = label.toLowerCase().includes('day') && !label.toLowerCase().includes('weekly') ? '☀️' :
                   label.toLowerCase().includes('night') ? '🌙' : '📈';
      out.push(icon + ' *' + label + '*');
      return;
    }

    // Bullet lines
    if (t.startsWith('•')) {
      const isNoWork = t.includes('NO WORK');
      const content = t.replace('• ', '');
      // Bold the hours value e.g. "8h" or "NO WORK"
      const formatted = content.replace(/(\d+h)/g, '*$1*');
      out.push((isNoWork ? '❌ ' : '  · ') + formatted);
      return;
    }

    // Total lines
    if (/^Total Day Shift:/i.test(t)) {
      out.push('✅ *' + t + '*'); return;
    }
    if (/^Total Night Shift:/i.test(t)) {
      out.push('✅ *' + t + '*'); return;
    }
    if (/^Combined Week Total:/i.test(t)) {
      out.push('🏆 *' + t + '*'); return;
    }
    if (/^Total|^Combined/i.test(t)) {
      out.push('✅ *' + t + '*'); return;
    }

    // Divider
    if (t === '---') { out.push(''); return; }

    // Date line in daily section
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(t)) {
      out.push('');
      out.push('📅 *' + t + '*');
      return;
    }

    // Shift detail lines
    if (/^Day Shift:|^Night Shift:/.test(t)) {
      const icon = t.startsWith('Day') ? '☀️' : '🌙';
      // Bold the billed hours
      const formatted = t.replace(/Billed:\s*(\d+h)/, 'Billed: *$1*');
      out.push(icon + ' ' + formatted);
      return;
    }

    // No Work in daily
    if (/No Work/i.test(t)) {
      out.push('❌ ' + t); return;
    }

    // Summary paragraph
    out.push(t);
  });

  out.push('');
  out.push('_Sent from Machine Hours Tracker_');
  return out.join('\n');
}

// ─── Report renderer ─────────────────────────────────────────────────────────
function ReportView({ text, C }) {
  if (!text) return null;
  const lines = text.split('\n');

  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trim = line.trim();

    // Section header: "1. Daily Report" / "2. Weekly Report" / "3. Overall Summary"
    if (/^\d+\.\s+(Daily|Weekly|Overall)/i.test(trim)) {
      const num = trim.match(/^(\d+)/)[1];
      const colors = { '1': C.blue, '2': C.green, '3': C.amber };
      const accent = colors[num] || C.blue;
      elements.push(
        <div key={i} style={{ background: accent + '18', border: '1px solid ' + accent + '44', borderRadius: 10, padding: '10px 14px', marginTop: 16, marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: accent }}>{trim}</span>
        </div>
      );
      i++; continue;
    }

    // Week header: "Week N (date – date)"
    if (/^Week\s+\d+/i.test(trim)) {
      elements.push(
        <div key={i} style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 12, marginBottom: 6 }}>{trim}</div>
      );
      i++; continue;
    }

    // Sub-header: "#### Day Shifts" / "#### Night Shifts" / "#### Weekly Totals"
    if (trim.startsWith('####')) {
      const label = trim.replace(/^#+\s*/, '');
      elements.push(
        <div key={i} style={{ fontSize: 12, fontWeight: 700, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10, marginBottom: 4 }}>{label}</div>
      );
      i++; continue;
    }

    // Bullet line: "• Thu 24 Sep: 8h (397.9 → 405.4)" or "• NO WORK"
    if (trim.startsWith('•')) {
      const isNoWork = trim.includes('NO WORK');
      const parts = trim.replace('• ', '').split(': ');
      const dayPart = parts[0] || '';
      const rest = parts.slice(1).join(': ');
      elements.push(
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', borderRadius: 6, marginBottom: 3, background: C.bg }}>
          <span style={{ fontSize: 13, color: C.muted, minWidth: 90 }}>{dayPart}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: isNoWork ? C.red : C.text }}>{rest || 'NO WORK'}</span>
        </div>
      );
      i++; continue;
    }

    // Total lines: "Total Day Shift: 35h" / "Combined Week Total: 77h"
    if (/^Total|^Combined/i.test(trim)) {
      const [label, val] = trim.split(': ');
      elements.push(
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: C.blue + '14', marginBottom: 6, marginTop: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>{val}</span>
        </div>
      );
      i++; continue;
    }

    // Divider
    if (trim === '---') {
      elements.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid ' + C.border, margin: '12px 0' }} />);
      i++; continue;
    }

    // Date line in daily report: "Mon, 23 Sep 2024"
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(trim)) {
      elements.push(
        <div key={i} style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 10, marginBottom: 4, borderLeft: '3px solid ' + C.blue, paddingLeft: 8 }}>{trim}</div>
      );
      i++; continue;
    }

    // Shift detail line: "  Day Shift: ..."
    if (/^\s*(Day Shift|Night Shift):/.test(line)) {
      const parts = trim.split('|');
      elements.push(
        <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '4px 8px 4px 12px', marginBottom: 3 }}>
          {parts.map((p, pi) => {
            const [k, v] = p.trim().split(':');
            const isBilled = k && k.trim() === 'Billed';
            return (
              <span key={pi} style={{ fontSize: 12, color: isBilled ? C.green : C.muted }}>
                <strong style={{ color: isBilled ? C.green : C.text }}>{k ? k.trim() : ''}</strong>
                {v ? ': ' + v.trim() : ''}
              </span>
            );
          })}
        </div>
      );
      i++; continue;
    }

    // No Work line in daily
    if (/No Work/i.test(trim) && trim.length > 0) {
      elements.push(
        <div key={i} style={{ fontSize: 12, color: C.red, padding: '4px 8px 4px 12px', marginBottom: 3 }}>{trim}</div>
      );
      i++; continue;
    }

    // Overall summary paragraph text
    if (trim.length > 0) {
      elements.push(
        <p key={i} style={{ fontSize: 14, color: C.text, lineHeight: 1.65, margin: '4px 0' }}>{trim}</p>
      );
    }

    i++;
  }

  return <div style={{ padding: '4px 0' }}>{elements}</div>;
}

// ─── Theme colours ────────────────────────────────────────────────────────────
const DARK = {
  bg:      '#0f172a',
  surface: '#1e293b',
  border:  '#334155',
  text:    '#e2e8f0',
  muted:   '#94a3b8',
  dim:     '#475569',
  blue:    '#3b82f6',
  green:   '#22c55e',
  red:     '#ef4444',
  amber:   '#f59e0b',
  badgeGreenBg:   '#14532d', badgeGreenText: '#86efac',
  badgeRedBg:     '#7f1d1d', badgeRedText:   '#fca5a5',
  badgeBlueBg:    '#1e3a5f', badgeBlueText:  '#93c5fd',
  offlineBg:      '#160f00',
};
const LIGHT = {
  bg:      '#f1f5f9',
  surface: '#ffffff',
  border:  '#e2e8f0',
  text:    '#0f172a',
  muted:   '#475569',
  dim:     '#94a3b8',
  blue:    '#2563eb',
  green:   '#16a34a',
  red:     '#dc2626',
  amber:   '#d97706',
  badgeGreenBg:   '#dcfce7', badgeGreenText: '#166534',
  badgeRedBg:     '#fee2e2', badgeRedText:   '#991b1b',
  badgeBlueBg:    '#dbeafe', badgeBlueText:  '#1e40af',
  offlineBg:      '#fef9c3',
};

function makeStyles(C) {
  return {
    app:   { minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 88 },
    hdr:   { background: C.surface, borderBottom: '1px solid ' + C.border, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 },
    nav:   { position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: '1px solid ' + C.border, display: 'flex', zIndex: 100 },
    page:  { padding: '0 16px 16px' },
    card:  { background: C.surface, borderRadius: 12, padding: 16, marginBottom: 12, border: '1px solid ' + C.border },
    row:   { display: 'flex', gap: 8 },
    flex:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    label: { fontSize: 12, color: C.muted, marginBottom: 4, display: 'block' },
    tag:   { fontSize: 11, color: C.dim },
    input: { width: '100%', padding: '10px 12px', background: C.bg, border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 14, boxSizing: 'border-box', marginBottom: 10, fontFamily: 'inherit' },
    btn: function(v) {
      const bg = v === 'primary' ? C.blue : v === 'danger' ? C.red : v === 'success' ? C.green : C.border;
      return { padding: '12px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, background: bg, color: '#fff', width: '100%', marginBottom: 8, fontFamily: 'inherit' };
    },
    navBtn: function(active) {
      return { flex: 1, padding: '10px 4px 8px', background: 'none', border: 'none', color: active ? C.blue : C.dim, fontSize: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, fontFamily: 'inherit' };
    },
    badge: function(color) {
      const bg   = color === 'green' ? C.badgeGreenBg  : color === 'red' ? C.badgeRedBg  : C.badgeBlueBg;
      const text = color === 'green' ? C.badgeGreenText : color === 'red' ? C.badgeRedText : C.badgeBlueText;
      return { display: 'inline-block', padding: '3px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: bg, color: text };
    },
    billedBox: { padding: '10px 12px', background: C.bg, border: '1px solid ' + C.border, borderRadius: 8, fontSize: 14, color: C.green, marginBottom: 10, textAlign: 'center' },
  };
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {

  // ── Theme
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('mht_theme') !== 'light'; } catch (_) { return true; }
  });
  const C = isDark ? DARK : LIGHT;
  const S = makeStyles(C);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    try { localStorage.setItem('mht_theme', next ? 'dark' : 'light'); } catch (_) {}
  }

  // ── Core state
  const [view,      setView]      = useState('home');
  const [machines,  setMachines]  = useState([]);
  const [isOnline,  setIsOnline]  = useState(navigator.onLine);
  const [offQ,      setOffQ]      = useState([]);
  const [notif,     setNotif]     = useState({ enabled: false, dayTime: '06:00', nightTime: '18:00' });

  // ── Entry flow
  const [eStep,    setEStep]    = useState(1);
  const [eMachine, setEMachine] = useState(null);
  const [eFrom,    setEFrom]    = useState(todayStr());
  const [eTo,      setETo]      = useState(todayStr());
  const [eDays,    setEDays]    = useState([]);

  // ── Machine form
  const [mForm,   setMForm]   = useState({ name: '', startDay: '', breakingDay: '' });
  const [mEdit,   setMEdit]   = useState(null);
  const [showMF,  setShowMF]  = useState(false);

  // ── Reports
  const [rType,    setRType]    = useState('weekly');
  const [rMachine, setRMachine] = useState('');
  const [rFrom,    setRFrom]    = useState(todayStr());
  const [rTo,      setRTo]      = useState(todayStr());
  const [rResult,  setRResult]  = useState('');
  const [rLoading, setRLoading] = useState(false);
  const [rError,   setRError]   = useState('');

  // ── History
  const [reports,      setReports]      = useState([]);
  const [viewingRpt,   setViewingRpt]   = useState(null);
  const [copied,       setCopied]       = useState(false);

  // ── Load on mount
  useEffect(() => {
    const m = storageGet('mht_machines');
    if (m) setMachines(JSON.parse(m));
    const q = lsGet('mht_q');
    if (q) setOffQ(JSON.parse(q));
    const n = lsGet('mht_notif');
    if (n) setNotif(JSON.parse(n));
    loadReports();
  }, []);

  useEffect(() => {
    const goOn  = () => { setIsOnline(true);  };
    const goOff = () => setIsOnline(false);
    window.addEventListener('online', goOn);
    window.addEventListener('offline', goOff);
    return () => { window.removeEventListener('online', goOn); window.removeEventListener('offline', goOff); };
  }, []);

  // ── Helpers
  function loadReports() {
    const list = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('mht_rpt:')) {
        try { list.push(JSON.parse(localStorage.getItem(k))); } catch(_) {}
      }
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    setReports(list);
  }

  function getEntry(machineId, date) {
    const raw = storageGet('mht_e:' + machineId + ':' + date);
    return raw ? JSON.parse(raw) : { dayStart: '', dayEnd: '', nightStart: '', nightEnd: '', noWork: false, noWorkReason: '' };
  }

  function saveEntry(key, value) {
    if (isOnline) {
      storageSet(key, value);
    } else {
      const q = [...offQ, { key, value }];
      setOffQ(q);
      lsSet('mht_q', JSON.stringify(q));
      lsSet('mht_l:' + key, value);
    }
  }

  function saveMachines(list) {
    setMachines(list);
    storageSet('mht_machines', JSON.stringify(list));
  }

  function syncQueue() {
    offQ.forEach(item => storageSet(item.key, item.value));
    setOffQ([]);
    lsSet('mht_q', '[]');
  }

  function saveNotif(s) { setNotif(s); lsSet('mht_notif', JSON.stringify(s)); }

  // ── Entry flow
  function startEntry() {
    setEStep(1); setEMachine(null);
    setEFrom(todayStr()); setETo(todayStr()); setEDays([]);
    setView('entry');
  }

  function entryPickMachine(m) { setEMachine(m); setEStep(2); }

  function entryBuildDays() {
    if (eFrom > eTo) { alert('From date must be before To date'); return; }
    const days = datesBetween(eFrom, eTo).map(date => ({ date, ...getEntry(eMachine.id, date) }));
    setEDays(days);
    setEStep(3);
  }

  function updateDay(idx, field, value) {
    setEDays(prev => { const n = [...prev]; n[idx] = { ...n[idx], [field]: value }; return n; });
  }

  function saveAllEntries() {
    eDays.forEach(day => {
      saveEntry('mht_e:' + eMachine.id + ':' + day.date, JSON.stringify(day));
    });
    alert('All entries saved!');
    setView('home');
  }

  // ── Machine CRUD
  function addMachine() {
    if (!mForm.name.trim()) return;
    const m = { id: Date.now().toString(), name: mForm.name.trim(), startDay: mForm.startDay, breakingDay: mForm.breakingDay, active: true, createdAt: Date.now() };
    saveMachines([...machines, m]);
    setMForm({ name: '', startDay: '', breakingDay: '' }); setShowMF(false);
  }
  function updateMachine() {
    saveMachines(machines.map(m => m.id === mEdit.id ? { ...m, ...mForm } : m));
    setMEdit(null); setShowMF(false); setMForm({ name: '', startDay: '', breakingDay: '' });
  }
  function deleteMachine(id) {
    if (!window.confirm('Delete this machine and all its data?')) return;
    saveMachines(machines.filter(m => m.id !== id));
  }
  function toggleActive(id) { saveMachines(machines.map(m => m.id === id ? { ...m, active: !m.active } : m)); }

  // ── Reports
  async function runReport() {
    if (!rMachine) { setRError('Please select a machine.'); return; }
    setRLoading(true); setRError(''); setRResult('');

    try {
      const machine = machines.find(m => m.id === rMachine);
      const from = rType === 'daily' ? rFrom : rFrom;
      const to   = rType === 'daily' ? rFrom : rTo;

      const entries = datesBetween(from, to)
        .map(date => ({ date, ...getEntry(rMachine, date) }))
        .filter(e => e.dayStart || e.nightStart || e.noWork);

      if (entries.length === 0) { setRError('No entries found for this period.'); setRLoading(false); return; }

      const label = from === to ? fmtLong(from) : fmtLong(from) + ' – ' + fmtLong(to);
      const result = await generateReport(entries, machine, label);
      setRResult(result);
    } catch (err) {
      setRError(err.message || 'Failed to generate report.');
    }
    setRLoading(false);
  }

  function saveReport() {
    if (!rResult) return;
    const id = Date.now().toString();
    const rpt = {
      id, machineId: rMachine,
      machineName: machines.find(m => m.id === rMachine)?.name || '',
      type: rType, from: rType === 'daily' ? rFrom : rFrom, to: rType === 'daily' ? rFrom : rTo,
      content: rResult, createdAt: Date.now()
    };
    localStorage.setItem('mht_rpt:' + id, JSON.stringify(rpt));
    loadReports();
    alert('Report saved to History!');
  }

  function copyForWhatsApp(reportText, machineName, dateLabel) {
    const wa = formatForWhatsApp(reportText, machineName, dateLabel);
    navigator.clipboard.writeText(wa).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // fallback: select a textarea
      const ta = document.createElement('textarea');
      ta.value = wa;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function downloadTxt(content, name) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = name + '.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  // ── Home summary
  function getHomeSummary() {
    let totalHrs = 0, working = 0, noWork = 0, pending = 0;
    const t = todayStr();
    machines.forEach(m => {
      const e = getEntry(m.id, t);
      if (e.noWork) { noWork++; }
      else if (e.dayStart || e.nightStart) { working++; totalHrs += calcBilled(e.dayStart, e.dayEnd) + calcBilled(e.nightStart, e.nightEnd); }
      else { pending++; }
    });
    return { totalHrs, working, noWork, pending };
  }

  // ── Notification permission
  async function requestNotif() {
    if (!('Notification' in window)) { alert('Notifications not supported on this device.'); return; }
    const p = await Notification.requestPermission();
    if (p === 'granted') saveNotif({ ...notif, enabled: true });
    else alert('Notification permission denied.');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────────

  function renderHome() {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const sum = getHomeSummary();
    const sumCards = [
      { label: 'Total Hours Today', value: sum.totalHrs + 'h' },
      { label: 'Working',           value: sum.working },
      { label: 'No Work',           value: sum.noWork },
      { label: 'Pending Entry',     value: sum.pending },
    ];
    return (
      <div style={S.page}>
        <div style={{ padding: '20px 0 12px' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#f1f5f9' }}>{greet} 👋</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{fmtLong(todayStr())}</div>
        </div>

        {offQ.length > 0 && (
          <div style={{ ...S.card, borderColor: C.amber, background: C.offlineBg }}>
            <div style={S.flex}>
              <span style={{ color: C.amber, fontSize: 13 }}>📴 {offQ.length} entries pending sync</span>
              <button onClick={syncQueue} style={{ background: C.amber, border: 'none', borderRadius: 6, color: '#000', padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Sync</button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {sumCards.map(c => (
            <div key={c.label} style={{ ...S.card, marginBottom: 0 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#f1f5f9' }}>{c.value}</div>
            </div>
          ))}
        </div>

        <button style={S.btn('primary')} onClick={startEntry}>+ New Entry</button>
        <button style={S.btn()} onClick={() => setView('reports')}>📊 Generate Report</button>

        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 8 }}>Machines — Today</div>
        {machines.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>No machines yet. Add one in the Machines tab.</div>}
        {machines.map(m => {
          const e = getEntry(m.id, todayStr());
          const status = e.noWork ? 'no-work' : (e.dayStart || e.nightStart) ? 'active' : 'pending';
          const dayB = calcBilled(e.dayStart, e.dayEnd);
          const nightB = calcBilled(e.nightStart, e.nightEnd);
          return (
            <div key={m.id} style={{ ...S.card, padding: '12px 14px' }}>
              <div style={S.flex}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                  <div style={S.tag}>
                    {e.noWork ? (e.noWorkReason || 'No Work') : (dayB || nightB) ? dayB + 'h day · ' + nightB + 'h night' : 'No entry yet'}
                  </div>
                </div>
                <span style={S.badge(status === 'active' ? 'green' : status === 'no-work' ? 'red' : 'blue')}>
                  {status === 'active' ? 'Active' : status === 'no-work' ? 'No Work' : 'Pending'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderEntry() {
    // Step 1: Pick machine
    if (eStep === 1) {
      const active = machines.filter(m => m.active);
      return (
        <div style={S.page}>
          <div style={{ padding: '16px 0 8px', fontSize: 16, fontWeight: 700 }}>Select Machine</div>
          {active.length === 0 && <div style={{ ...S.card, color: C.muted }}>No active machines. Add and activate one in the Machines tab.</div>}
          {active.map(m => (
            <div key={m.id} style={{ ...S.card, cursor: 'pointer', borderColor: C.border }} onClick={() => entryPickMachine(m)}>
              <div style={S.flex}>
                <div>
                  <div style={{ fontWeight: 600 }}>{m.name}</div>
                  <div style={S.tag}>Tap to select</div>
                </div>
                <span style={{ color: C.blue, fontSize: 18 }}>›</span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Step 2: Date range
    if (eStep === 2) return (
      <div style={S.page}>
        <div style={{ padding: '16px 0 4px', fontSize: 16, fontWeight: 700 }}>{eMachine.name}</div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>Select date range for entry</div>
        <label style={S.label}>From</label>
        <input type="date" style={S.input} value={eFrom} onChange={e => setEFrom(e.target.value)} />
        <label style={S.label}>To</label>
        <input type="date" style={S.input} value={eTo}   onChange={e => setETo(e.target.value)} />
        <button style={S.btn('primary')} onClick={entryBuildDays}>Continue →</button>
        <button style={S.btn()} onClick={() => setEStep(1)}>← Back</button>
      </div>
    );

    // Step 3: Day-by-day inputs
    return (
      <div style={S.page}>
        <div style={{ padding: '16px 0 4px', fontSize: 16, fontWeight: 700 }}>{eMachine.name}</div>
        <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>{fmtShort(eFrom)} – {fmtShort(eTo)}</div>

        {eDays.map((day, idx) => (
          <div key={day.date} style={S.card}>
            <div style={{ ...S.flex, marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{fmtLong(day.date)}</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f87171', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!day.noWork}
                  onChange={e => updateDay(idx, 'noWork', e.target.checked)}
                  style={{ accentColor: C.red }}
                />
                No Work
              </label>
            </div>

            {day.noWork ? (
              <input
                style={S.input}
                placeholder="Reason (optional)"
                value={day.noWorkReason || ''}
                onChange={e => updateDay(idx, 'noWorkReason', e.target.value)}
              />
            ) : (
              <>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>Day Shift</div>
                <div style={S.row}>
                  <div style={{ flex: 1 }}>
                    <div style={S.tag}>Start Odo</div>
                    <input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.dayStart}
                      onChange={e => updateDay(idx, 'dayStart', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={S.tag}>End Odo</div>
                    <input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.dayEnd}
                      onChange={e => updateDay(idx, 'dayEnd', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={S.tag}>Billed</div>
                    <div style={S.billedBox}>{calcBilled(day.dayStart, day.dayEnd)}h</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, fontWeight: 500 }}>Night Shift</div>
                <div style={S.row}>
                  <div style={{ flex: 1 }}>
                    <div style={S.tag}>Start Odo</div>
                    <input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.nightStart}
                      onChange={e => updateDay(idx, 'nightStart', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={S.tag}>End Odo</div>
                    <input type="number" step="0.1" style={S.input} placeholder="0.0" value={day.nightEnd}
                      onChange={e => updateDay(idx, 'nightEnd', e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={S.tag}>Billed</div>
                    <div style={S.billedBox}>{calcBilled(day.nightStart, day.nightEnd)}h</div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        <div style={{ position: 'sticky', bottom: 88, paddingBottom: 8, background: C.bg, borderTop: '1px solid ' + C.border, paddingTop: 8 }}>
          <button style={S.btn('success')} onClick={saveAllEntries}>✓ Save All Entries</button>
          <button style={S.btn()} onClick={() => setEStep(2)}>← Back</button>
        </div>
      </div>
    );
  }

  function renderMachines() {
    return (
      <div style={S.page}>
        <div style={{ padding: '16px 0 8px', fontSize: 16, fontWeight: 700 }}>Machine Registry</div>

        {showMF && (
          <div style={S.card}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>{mEdit ? 'Edit Machine' : 'Register New Machine'}</div>
            <label style={S.label}>Machine Name *</label>
            <input style={S.input} value={mForm.name} placeholder="e.g. CAT 336" onChange={e => setMForm(p => ({ ...p, name: e.target.value }))} />
            <label style={S.label}>Starting Odometer</label>
            <input type="number" style={S.input} value={mForm.startDay} placeholder="e.g. 1200" onChange={e => setMForm(p => ({ ...p, startDay: e.target.value }))} />
            <label style={S.label}>Breaking Day (hours)</label>
            <input type="number" style={S.input} value={mForm.breakingDay} placeholder="e.g. 500" onChange={e => setMForm(p => ({ ...p, breakingDay: e.target.value }))} />
            <button style={S.btn('primary')} onClick={mEdit ? updateMachine : addMachine}>
              {mEdit ? 'Update Machine' : 'Add Machine'}
            </button>
            <button style={S.btn()} onClick={() => { setShowMF(false); setMEdit(null); setMForm({ name: '', startDay: '', breakingDay: '' }); }}>
              Cancel
            </button>
          </div>
        )}

        {!showMF && <button style={S.btn('primary')} onClick={() => setShowMF(true)}>+ Register Machine</button>}

        {machines.length === 0 && !showMF && <div style={{ color: C.dim, fontSize: 13, marginTop: 8 }}>No machines registered yet.</div>}

        {machines.map(m => (
          <div key={m.id} style={S.card}>
            <div style={S.flex}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{m.name}</div>
                <div style={S.tag}>Start odo: {m.startDay || '—'} | Break: {m.breakingDay || '—'}h</div>
              </div>
              <span style={S.badge(m.active ? 'green' : 'red')}>{m.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ ...S.row, marginTop: 12, gap: 6 }}>
              <button style={{ ...S.btn(), padding: '8px 10px', marginBottom: 0, flex: 1, fontSize: 12 }} onClick={() => toggleActive(m.id)}>
                {m.active ? 'Deactivate' : 'Activate'}
              </button>
              <button style={{ ...S.btn(), padding: '8px 10px', marginBottom: 0, flex: 1, fontSize: 12 }} onClick={() => {
                setMEdit(m); setMForm({ name: m.name, startDay: m.startDay || '', breakingDay: m.breakingDay || '' }); setShowMF(true);
              }}>Edit</button>
              <button style={{ ...S.btn('danger'), padding: '8px 10px', marginBottom: 0, flex: 1, fontSize: 12 }} onClick={() => deleteMachine(m.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderReports() {
    return (
      <div style={S.page}>
        <div style={{ padding: '16px 0 8px', fontSize: 16, fontWeight: 700 }}>Generate Report</div>

        <label style={S.label}>Machine</label>
        <select style={{ ...S.input, marginBottom: 12 }} value={rMachine} onChange={e => setRMachine(e.target.value)}>
          <option value="">Select machine…</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>

        <label style={S.label}>Report Type</label>
        <div style={{ ...S.row, marginBottom: 14 }}>
          {['daily','weekly','custom'].map(t => (
            <button key={t} onClick={() => setRType(t)} style={{
              flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
              background: rType === t ? C.blue : C.border, color: '#fff'
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {rType === 'daily' ? (
          <><label style={S.label}>Date</label><input type="date" style={S.input} value={rFrom} onChange={e => setRFrom(e.target.value)} /></>
        ) : (
          <>
            <label style={S.label}>From</label>
            <input type="date" style={S.input} value={rFrom} onChange={e => setRFrom(e.target.value)} />
            <label style={S.label}>To</label>
            <input type="date" style={S.input} value={rTo} onChange={e => setRTo(e.target.value)} />
          </>
        )}

        <button style={S.btn('primary')} onClick={runReport} disabled={rLoading}>
          {rLoading ? 'Generating…' : 'Generate Report'}
        </button>

        {rError && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>⚠ {rError}</div>}

        {rResult && (
          <>
            <div style={{ ...S.card, maxHeight: 520, overflowY: 'auto', marginBottom: 10 }}>
              <ReportView text={rResult} C={C} />
            </div>
            <button
              style={{ ...S.btn('success'), background: '#25D366', marginBottom: 8 }}
              onClick={() => {
                const machine = machines.find(m => m.id === rMachine);
                const from = rType === 'daily' ? rFrom : rFrom;
                const to   = rType === 'daily' ? rFrom : rTo;
                const label = from === to ? fmtLong(from) : fmtShort(from) + ' – ' + fmtShort(to);
                copyForWhatsApp(rResult, machine?.name, label);
              }}
            >
              {copied ? '✓ Copied! Paste into WhatsApp' : '📲 Copy for WhatsApp'}
            </button>
            <div style={S.row}>
              <button style={{ ...S.btn('primary'), marginBottom: 0, flex: 1 }} onClick={saveReport}>💾 Save</button>
              <button style={{ ...S.btn(), marginBottom: 0, flex: 1 }} onClick={() => downloadTxt(rResult, 'report-' + rFrom)}>⬇ Download</button>
            </div>
          </>
        )}
      </div>
    );
  }

  function renderHistory() {
    if (viewingRpt) return (
      <div style={S.page}>
        <button onClick={() => setViewingRpt(null)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', padding: '16px 0', fontSize: 14, fontFamily: 'inherit' }}>
          ← Back
        </button>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{viewingRpt.machineName}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>
          {fmtLong(viewingRpt.from)}{viewingRpt.from !== viewingRpt.to ? ' – ' + fmtLong(viewingRpt.to) : ''}
        </div>
        <div style={{ ...S.card, maxHeight: 520, overflowY: 'auto' }}>
          <ReportView text={viewingRpt.content} C={C} />
        </div>
        <button
          style={{ ...S.btn('success'), background: '#25D366' }}
          onClick={() => {
            const label = viewingRpt.from === viewingRpt.to ? fmtLong(viewingRpt.from) : fmtShort(viewingRpt.from) + ' – ' + fmtShort(viewingRpt.to);
            copyForWhatsApp(viewingRpt.content, viewingRpt.machineName, label);
          }}
        >
          {copied ? '✓ Copied! Paste into WhatsApp' : '📲 Copy for WhatsApp'}
        </button>
        <button style={S.btn()} onClick={() => downloadTxt(viewingRpt.content, 'report-' + viewingRpt.from)}>⬇ Download</button>
        <button style={S.btn('danger')} onClick={() => {
          if (!window.confirm('Delete this report?')) return;
          localStorage.removeItem('mht_rpt:' + viewingRpt.id);
          loadReports();
          setViewingRpt(null);
        }}>🗑 Delete</button>
      </div>
    );

    return (
      <div style={S.page}>
        <div style={{ padding: '16px 0 8px', fontSize: 16, fontWeight: 700 }}>Saved Reports</div>
        {reports.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>No saved reports yet. Generate one in the Reports tab.</div>}
        {reports.map(r => (
          <div key={r.id} style={{ ...S.card, cursor: 'pointer' }} onClick={() => setViewingRpt(r)}>
            <div style={S.flex}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.machineName}</div>
                <div style={S.tag}>
                  {r.type} · {fmtShort(r.from)}{r.from !== r.to ? ' – ' + fmtShort(r.to) : ''}
                </div>
              </div>
              <span style={{ color: C.blue, fontSize: 14 }}>›</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderSettings() {
    return (
      <div style={S.page}>
        <div style={{ padding: '16px 0 8px', fontSize: 16, fontWeight: 700 }}>Settings</div>

        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>🔔 Shift Reminders</div>
          <div style={S.flex}>
            <span style={{ fontSize: 14 }}>Enable notifications</span>
            <input type="checkbox" checked={notif.enabled}
              onChange={e => { if (e.target.checked) requestNotif(); else saveNotif({ ...notif, enabled: false }); }}
              style={{ transform: 'scale(1.4)', accentColor: C.blue }} />
          </div>
          {notif.enabled && (
            <div style={{ marginTop: 14 }}>
              <label style={S.label}>Day shift reminder</label>
              <input type="time" style={S.input} value={notif.dayTime} onChange={e => saveNotif({ ...notif, dayTime: e.target.value })} />
              <label style={S.label}>Night shift reminder</label>
              <input type="time" style={S.input} value={notif.nightTime} onChange={e => saveNotif({ ...notif, nightTime: e.target.value })} />
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>💾 Storage & Sync</div>
          <div style={{ fontSize: 13, color: C.muted }}>
            {isOnline ? '🌐 Online — data is syncing' : '📴 Offline — data stored locally'}
          </div>
          {offQ.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>{offQ.length} entries waiting to sync</div>
              <button style={{ ...S.btn(), padding: '8px 12px', marginTop: 8 }} onClick={syncQueue}>Sync Now</button>
            </>
          )}
        </div>

        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>ℹ About</div>
          <div style={{ fontSize: 13, color: C.muted }}>Machine Hours Tracker v2.0</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>6-day week · Odometer-based billing · Groq AI reports</div>
        </div>
      </div>
    );
  }

  // ─── Nav & shell ────────────────────────────────────────────────────────────
  const NAV = [
    { id: 'home',     icon: '🏠', label: 'Home' },
    { id: 'entry',    icon: '✏️',  label: 'Entry' },
    { id: 'machines', icon: '⚙',  label: 'Machines' },
    { id: 'reports',  icon: '📊', label: 'Reports' },
    { id: 'history',  icon: '🕓', label: 'History' },
  ];

  const TITLES = { home: 'MHT', entry: 'New Entry', machines: 'Machines', reports: 'Reports', history: 'History', settings: 'Settings' };

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.hdr}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{TITLES[view] || 'MHT'}</span>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: isOnline ? C.green : C.amber }}>
            {isOnline ? '● Online' : '● Offline'}
          </span>
          <button onClick={toggleTheme} title="Toggle theme" style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setView('settings')} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>⚙</button>
        </div>
      </div>

      {/* Page */}
      {view === 'home'     && renderHome()}
      {view === 'entry'    && renderEntry()}
      {view === 'machines' && renderMachines()}
      {view === 'reports'  && renderReports()}
      {view === 'history'  && renderHistory()}
      {view === 'settings' && renderSettings()}

      {/* Bottom nav */}
      <nav style={S.nav}>
        {NAV.map(n => (
          <button
            key={n.id}
            style={S.navBtn(view === n.id)}
            onClick={() => n.id === 'entry' ? startEntry() : setView(n.id)}
          >
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
