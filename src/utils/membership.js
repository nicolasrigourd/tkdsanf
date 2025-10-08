// src/utils/membership.js

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
export function addDays(iso, n) {
  const d = new Date(iso); d.setDate(d.getDate() + n);
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,"0"), day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
export function diffDays(aISO, bISO) {
  const a = new Date(aISO), b = new Date(bISO);
  return Math.round((a - b) / (1000*60*60*24));
}

// util
function daysInMonth(y, m0) { // m0: 0-11
  return new Date(y, m0 + 1, 0).getDate();
}
function setYMD(d, y, m0, day) {
  const dim = daysInMonth(y, m0);
  const safeDay = Math.min(day, dim);
  const c = new Date(d);
  c.setFullYear(y, m0, safeDay);
  return c;
}

// Cuenta L→S entre [start, end) (end exclusivo)
export function countMonToSat(startISO, endISO) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  let count = 0;
  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const wd = d.getDay(); // 0=Dom .. 6=Sáb
    if (wd >= 1 && wd <= 6) count++;
  }
  return count;
}

/**
 * Calcula el fin de plan “anclado” a ventana 01–10.
 * Regla:
 *  - Si start_day <= windowEnd: end = mismo día (start_day) del MES SIGUIENTE.
 *  - Si start_day > windowEnd:  end = windowEnd del MES SIGUIENTE.
 * Siempre garantizando fecha válida (28/29/30/31 safe).
 */
export function calcEndDateWithWindow(startISO, windowEndDay = 10) {
  const s = new Date(startISO);
  const y = s.getFullYear(), m0 = s.getMonth(), startDay = s.getDate();
  const targetDay = startDay <= windowEndDay ? startDay : windowEndDay;
  const nextMonth0 = m0 + 1; // mes siguiente
  const y2 = y + Math.floor(nextMonth0 / 12);
  const m2 = (nextMonth0 % 12 + 12) % 12;
  const endDate = setYMD(s, y2, m2, targetDay);
  const yE = endDate.getFullYear(), mE = String(endDate.getMonth()+1).padStart(2,"0"), dE = String(endDate.getDate()).padStart(2,"0");
  return `${yE}-${mE}-${dE}`;
}

/**
 * Clases “de referencia” para prorratear:
 *  - AnchorDay = min(start_day, windowEndDay)
 *  - baselineStart = (mes del start, día = AnchorDay)
 *  - baselineEnd   = (mes siguiente,   día = AnchorDay)   // un “mes completo” de ese anclaje
 */
export function baselineFullClassesForProration(startISO, windowEndDay = 10) {
  const s = new Date(startISO);
  const y = s.getFullYear(), m0 = s.getMonth(), startDay = s.getDate();
  const anchorDay = Math.min(startDay, windowEndDay);

  const baselineStart = setYMD(s, y,  m0, anchorDay);
  const y2 = y + Math.floor((m0 + 1) / 12);
  const m2 = (m0 + 1) % 12;
  const baselineEnd = setYMD(s, y2, m2, anchorDay);

  const yS = baselineStart.getFullYear(), mS = String(baselineStart.getMonth()+1).padStart(2,"0"), dS = String(baselineStart.getDate()).padStart(2,"0");
  const yE = baselineEnd.getFullYear(),   mE = String(baselineEnd.getMonth()+1).padStart(2,"0"), dE = String(baselineEnd.getDate()).padStart(2,"0");

  return countMonToSat(`${yS}-${mS}-${dS}`, `${yE}-${mE}-${dE}`);
}

/**
 * Semáforo por fechas (no depende de clases)
 */
export function computeMembershipStateForStudent(student, cfg, today = todayISO()) {
  const endISO = student.plan_end_date;
  const daysToEnd = diffDays(endISO, today); // end - today
  let semaforo = "green";
  const yellowDays = cfg?.yellow_days_before_end ?? 5;
  if (daysToEnd <= yellowDays) {
    semaforo = daysToEnd >= 0 ? "yellow" : "red";
  }
  const active = diffDays(today, endISO) <= 0; // hoy <= fin
  const graceDays = cfg?.grace_days_after_end ?? 10;
  const inGrace = !active && diffDays(today, addDays(endISO, graceDays)) <= 0;
  return { active, inGrace, semaforo, daysToEnd };
}
