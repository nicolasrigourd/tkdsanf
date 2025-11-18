// src/db/indexedDB.js
import Dexie from "dexie";

/**
 * DB local-first (IndexedDB con Dexie)
 * Tablas:
 *  - students: socios/alumnos (PK = dni)
 *  - attendance: asistencias diarias
 *  - config: key-value para configuración global
 *  - payments: registro de pagos mensuales
 *  - memberships: ciclos de membresía por alumno (NUEVO)
 */
export const db = new Dexie("tkddb");

/* ========================
   Versionado
======================== */
db.version(1).stores({
  students: "dni, last_name, first_name, start_date, active",
  attendance: "++id, dni, date",
});

db.version(2)
  .stores({
    students: "dni, last_name, first_name, start_date, active",
    attendance: "++id, dni, date",
    config: "key",
  })
  .upgrade(async (tx) => {
    try {
      const raw = localStorage.getItem("tkd_config");
      if (raw) {
        await tx.table("config").put({ key: "app", value: JSON.parse(raw) });
      }
    } catch {}
  });

// v3: pagos
db.version(3).stores({
  students: "dni, last_name, first_name, start_date, active, class_id",
  attendance: "++id, dni, date, dismissed",
  config: "key",
  payments: "++id, dni, year, month, date",
});

// v4: memberships (NUEVO)
db.version(4).stores({
  students: "dni, last_name, first_name, start_date, active, class_id",
  attendance: "++id, dni, date, dismissed",
  config: "key",
  payments: "++id, dni, year, month, date",
  memberships:
    "++id, dni, period_year, period_month, start_date, end_date, status, payment_id, class_id",
});

/* ========================
   Utils de fecha
======================== */
export function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoToDate(iso) {
  const [y, m, d] = iso.split("-").map((n) => Number(n));
  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function clampDay(year, month, day) {
  const last = new Date(year, month, 0).getDate(); // mes 1-12
  return Math.min(day, last);
}

export function addDaysISO(iso, n) {
  const d = isoToDate(iso);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Cuenta L a S entre dos ISO (inclusive en extremos si caen L-S) */
function countMonToSatISO(startISO, endISO) {
  let d = isoToDate(startISO);
  const end = isoToDate(endISO);
  let count = 0;
  while (d <= end) {
    const dow = d.getDay(); // 0=Dom, 1=Lun ... 6=Sab
    if (dow >= 1 && dow <= 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/* ========================
   Configuración General
======================== */
const DEFAULT_CONFIG = {
  // precios/descuentos (legacy útil)
  price_base: 25000,
  yellow_days_before_end: 5, // legacy (seguimos soportando si lo usabas)
  grace_days_after_end: 10,  // legacy

  family_discount_pct: 20,
  new_student_discount_pct: 10,
  midmonth_policy: "manual", // legacy
  trial_coupon_code: "TKDPRUEBA",
  trial_days: 1,

  // Ventana de pago global (nuevo enfoque)
  cycle_due_day: 10,             // día de vencimiento del ciclo (p.ej. 10)
  payment_window_end_day: 10,    // fin de ventana de pago (normalmente = due_day)
  yellow_days_after_due: 5,      // días tras el vencimiento para amarillo
  grace_days_after_due: 0,       // días de gracia (después del vencimiento) antes de rojo

  // Clases / grupos
  classes: [], // [{ id, name, color }]
};

function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "c_" + Math.random().toString(36).slice(2, 10);
}

async function normalizeConfigClasses(cfg) {
  let changed = false;
  const list = Array.isArray(cfg.classes) ? cfg.classes.slice() : [];
  const mapped = list.map((c) => ({
    id: c?.id || genId(),
    name: String(c?.name || "").trim(),
    color: c?.color || "#e5e7eb",
  }));

  const seen = new Set();
  const deduped = [];
  for (const c of mapped) {
    const key = c.name.toLowerCase();
    if (!key) continue;
    if (seen.has(key)) {
      changed = true;
      continue;
    }
    seen.add(key);
    deduped.push(c);
  }

  if (changed) {
    const merged = { ...cfg, classes: deduped };
    await db.table("config").put({ key: "app", value: merged });
    return merged;
  }
  return cfg;
}

export async function getAppConfig() {
  const row = await db.table("config").get("app");
  const base = row?.value ? { ...DEFAULT_CONFIG, ...row.value } : { ...DEFAULT_CONFIG };
  const withArray = { ...base, classes: Array.isArray(base.classes) ? base.classes : [] };
  return await normalizeConfigClasses(withArray);
}

export async function saveAppConfig(patch) {
  const prev = await getAppConfig();
  const merged = { ...prev, ...patch };
  await db.table("config").put({ key: "app", value: merged });
  return merged;
}

/* ========================
   Helpers básicos Alumnos
======================== */
export function getStudent(dni) {
  return db.students.get(dni);
}

/* ========================
   Utilidades de ciclo mensual normalizado
======================== */
/**
 * Dado un (year, month) y un dueDay:
 * - end = (year, month, dueDay clamped)
 * - start = (year, month - 1, dueDay+1 clamped)
 */
function getPeriodBounds(year, month, dueDay) {
  const endDay = clampDay(year, month, dueDay);
  const end = new Date(year, month - 1, endDay);
  end.setHours(0, 0, 0, 0);

  // inicio = día siguiente al dueDay del mes anterior
  let startY = year;
  let startM = month - 1;
  if (startM <= 0) {
    startM = 12;
    startY -= 1;
  }
  const startDay = clampDay(startY, startM, dueDay) + 1;
  const start = new Date(startY, startM - 1, startDay);
  start.setHours(0, 0, 0, 0);

  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
  return { startISO: iso(start), endISO: iso(end) };
}

/** Dado un startISO y dueDay, calcula fin del ciclo = dueDay del mes siguiente */
function calcEndFromStart(startISO, dueDay) {
  const d = isoToDate(startISO);
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  const endDay = clampDay(nextY, nextM, dueDay);
  return `${nextY}-${String(nextM).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
}

/** Extrae (period_year, period_month) desde una fecha en relación al dueDay */
function getPeriodFromDate(iso, dueDay) {
  const d = isoToDate(iso);
  const day = d.getDate();
  // Si la fecha está antes o igual al dueDay, pertenece al período que "termina" ese dueDay.
  // Si la fecha está después del dueDay, pertenece al período del mes siguiente.
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  if (day > dueDay) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { period_year: year, period_month: month };
}

/* ========================
   MEMBERSHIPS (NUEVO)
======================== */
/**
 * Crea una membership para un alumno a partir de start_date, normalizando fin en dueDay del mes siguiente.
 */
export async function createMembershipForStudent({
  dni,
  start_date,
  class_id = null,
  cfg = null,
  price_base_override = null,
  discounts = {},
}) {
  if (!dni) throw new Error("Falta DNI.");
  const student = await db.students.get(dni);
  if (!student) throw new Error("No existe el socio.");

  const C = cfg || (await getAppConfig());
  const due = Number(C.cycle_due_day ?? 10);

  const startISO = (start_date || student.start_date || todayISO());
  const endISO = calcEndFromStart(startISO, due);
  const plan_total_classes = countMonToSatISO(startISO, endISO);
  const price_base = price_base_override != null ? Number(price_base_override) : Number(C.price_base || 0);

  const { period_year, period_month } = getPeriodFromDate(startISO, due);

  const id = await db.table("memberships").add({
    dni,
    period_year,
    period_month,
    start_date: startISO,
    end_date: endISO,
    plan_total_classes,
    price_base,
    price_final: price_base, // aplicarás prorrateo/descuentos según tu flujo si querés
    discounts: discounts || {},
    payment_id: null,
    class_id: class_id ?? student.class_id ?? null,
    status: "unpaid",
    created_at: new Date().toISOString(),
  });

  return await db.table("memberships").get(id);
}

/** Devuelve la membership vigente para 'todayISO' (considerando gracia opcional para decidir “vigencia”) */
export async function getCurrentMembership(dni, today = todayISO()) {
  const C = await getAppConfig();
  const due = Number(C.cycle_due_day ?? 10);
  const t = isoToDate(today);

  // Buscamos membership cuyo rango [start, end] incluya hoy
  const list = await db.table("memberships").where("dni").equals(dni).toArray();
  list.sort((a, b) => isoToDate(b.start_date) - isoToDate(a.start_date));
  for (const m of list) {
    const s = isoToDate(m.start_date);
    const e = isoToDate(m.end_date);
    if (t >= s && t <= e) return m;
  }

  // Si no hay, podemos decidir NO crear automáticamente. Devolvemos null.
  return null;
}

/**
 * Calcula el estado semáforo de una membership:
 * - green: antes o igual a dueDay del período
 * - yellow: entre dueDay (exclusivo) y dueDay + yellow_days_after_due
 * - red: pasado dueDay + grace_days_after_due
 * Además si hay payment_id, se puede forzar green (si así lo preferís); acá respetamos fechas.
 */
export function computeMembershipStatus(membership, cfg, today = todayISO()) {
  if (!membership) return { semaforo: "red", active: false };

  const C = cfg || {};
  const dueDay = Number(C.cycle_due_day ?? 10);
  const yellowAfter = Number(C.yellow_days_after_due ?? 5);
  const graceAfter = Number(C.grace_days_after_due ?? 0);

  const t = isoToDate(today);

  // “Fecha de vencimiento” del período es membership.end_date (que ya está normalizada al dueDay del mes)
  const end = isoToDate(membership.end_date);

  // Si hoy <= end → aún dentro del ciclo → GREEN
  if (t <= end) {
    return { semaforo: "green", active: true };
  }

  // Día 1 tras end → zona amarilla hasta end + yellowAfter
  const yellowLimit = new Date(end);
  yellowLimit.setDate(yellowLimit.getDate() + yellowAfter);

  if (t > end && t <= yellowLimit) {
    return { semaforo: "yellow", active: true };
  }

  // Gracia adicional tras yellow → rojo
  const graceLimit = new Date(yellowLimit);
  graceLimit.setDate(graceLimit.getDate() + graceAfter);

  if (t > yellowLimit && t <= graceLimit) {
    // Podrías manejar “grace” separado si querés; acá lo contamos como red (bloqueo suave)
    return { semaforo: "red", active: false, in_grace: true };
  }

  return { semaforo: "red", active: false };
}

/**
 * Obtiene (o crea) membership para un período dado (year, month) según dueDay.
 * Útil para registrar pagos retro/anticipados y linkearlos a un ciclo claro.
 */
export async function getOrCreateMembershipForPeriod(dni, year, month, cfg = null) {
  const C = cfg || (await getAppConfig());
  const due = Number(C.cycle_due_day ?? 10);

  // ¿Existe ya?
  const existing = await db.table("memberships").where({ dni, period_year: Number(year), period_month: Number(month) }).first();
  if (existing) return existing;

  // Si no existe, creamos con los límites normalizados de ese período
  const { startISO, endISO } = getPeriodBounds(Number(year), Number(month), due);
  const student = await db.students.get(dni);
  const plan_total_classes = countMonToSatISO(startISO, endISO);
  const price_base = Number(C.price_base || 0);

  const id = await db.table("memberships").add({
    dni,
    period_year: Number(year),
    period_month: Number(month),
    start_date: startISO,
    end_date: endISO,
    plan_total_classes,
    price_base,
    price_final: price_base,
    discounts: {},
    payment_id: null,
    class_id: student?.class_id ?? null,
    status: "unpaid",
    created_at: new Date().toISOString(),
  });
  return await db.table("memberships").get(id);
}

/* ========================
   Asistencias (HOY)
======================== */
export async function addAttendanceToday(dni) {
  const date = todayISO();
  const student = await db.students.get(dni);
  if (!student) throw new Error("No existe ningún socio con ese DNI.");
  if (student.active === false) throw new Error("El socio está inactivo.");

  const exists = await db.attendance.where({ dni, date }).first();

  if (exists) {
    if (exists.dismissed === true) {
      await db.attendance.update(exists.id, { dismissed: false, updated_at: new Date().toISOString() });
      const att = await db.attendance.get(exists.id);
      return { ...att, _student: student, repeated: false, reinstated: true };
    }
    return { ...exists, _student: student, repeated: true };
  }

  const id = await db.attendance.add({
    dni,
    date,
    dismissed: false,
    created_at: new Date().toISOString(),
  });
  const att = await db.attendance.get(id);
  return { ...att, _student: student, repeated: false };
}

export async function dismissAttendanceToday(dni) {
  const date = todayISO();
  const row = await db.attendance.where({ dni, date }).first();
  if (row) {
    await db.attendance.update(row.id, { dismissed: true, updated_at: new Date().toISOString() });
    return true;
  }
  return false;
}

export async function dismissAllAttendancesToday() {
  const date = todayISO();
  const rows = await db.attendance.where("date").equals(date).toArray();
  const visibles = rows.filter((r) => !r.dismissed);
  await Promise.all(visibles.map((r) => db.attendance.update(r.id, { dismissed: true, updated_at: new Date().toISOString() })));
  return visibles.length;
}

/** Oculta solo los presentes de la clase activa (HOY) */
export async function dismissAttendancesTodayByClass(classId) {
  if (!classId) return 0;
  const date = todayISO();
  const rows = await db.attendance.where("date").equals(date).toArray();
  const visibles = rows.filter((r) => !r.dismissed);
  const toDismiss = [];
  for (const r of visibles) {
    const st = await db.students.get(r.dni);
    if (st && (st.class_id || "") === classId) toDismiss.push(r);
  }
  await Promise.all(toDismiss.map((r) => db.attendance.update(r.id, { dismissed: true, updated_at: new Date().toISOString() })));
  return toDismiss.length;
}

export async function countAttendancesTodayByClass(classId) {
  if (!classId) return 0;
  const date = todayISO();
  const rows = await db.attendance.where("date").equals(date).toArray();
  const visibles = rows.filter((r) => !r.dismissed);
  let count = 0;
  for (const r of visibles) {
    const st = await db.students.get(r.dni);
    if (st && (st.class_id || "") === classId) count++;
  }
  return count;
}

export async function getTodayAttendances() {
  const date = todayISO();
  const rows = await db.attendance.where("date").equals(date).toArray();
  const visibles = rows.filter((r) => !r.dismissed);
  const result = [];
  for (const r of visibles) {
    const st = await db.students.get(r.dni);
    if (st) result.push({ ...st, _att: r });
  }
  result.sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));
  return result;
}

export function getAttendancesCountForStudent(dni) {
  return db.attendance.where("dni").equals(dni).count();
}

/* ========================
   Clases / Grupos
======================== */
export async function getClasses() {
  const cfg = await getAppConfig();
  return Array.isArray(cfg.classes) ? cfg.classes : [];
}

export async function addClass({ name, color = "#e5e7eb" }) {
  const cfg = await getAppConfig();
  const classes = [...(cfg.classes || [])];
  const trimmed = String(name || "").trim();

  if (!trimmed) throw new Error("El nombre de la clase es obligatorio.");
  if (classes.some((c) => c.name.toLowerCase() === trimmed.toLowerCase()))
    throw new Error("Ya existe una clase con ese nombre.");

  const newClass = { id: genId(), name: trimmed, color };
  const updated = [...classes, newClass];
  await saveAppConfig({ classes: updated });
  return newClass;
}

export async function updateClass(id, patch) {
  const cfg = await getAppConfig();
  const classes = [...(cfg.classes || [])];
  const idx = classes.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error("Clase no encontrada.");

  const nextName = (patch?.name ?? classes[idx].name).trim();
  if (!nextName) throw new Error("El nombre de la clase es obligatorio.");
  if (classes.some((c, i) => i !== idx && c.name.toLowerCase() === nextName.toLowerCase())) {
    throw new Error("Ya existe una clase con ese nombre.");
  }

  classes[idx] = { ...classes[idx], ...patch, name: nextName };
  await saveAppConfig({ classes });
  return classes[idx];
}

export async function deleteClass(id) {
  const cfg = await getAppConfig();
  const classes = [...(cfg.classes || [])].filter((c) => c.id !== id);
  await saveAppConfig({ classes });
  return true;
}

/* ========================
   Pagos (Payments)
======================== */
export async function addPayment(payload) {
  const {
    dni,
    year,
    month,
    amount,
    method = "efectivo",
    receipt = "",
    date = todayISO(),
  } = payload || {};

  if (!dni) throw new Error("Falta DNI.");
  if (!year || !month) throw new Error("Falta año o mes.");
  if (amount == null || isNaN(Number(amount))) throw new Error("Importe inválido.");

  const st = await db.students.get(dni);
  if (!st) throw new Error("No existe el socio.");

  const id = await db.table("payments").add({
    dni,
    year: Number(year),
    month: Number(month),
    amount: Number(amount),
    method,
    receipt,
    date,
    created_at: new Date().toISOString(),
  });
  return await db.table("payments").get(id);
}

export async function getPaymentsByDniYear(dni, year) {
  const list = await db.table("payments").where({ dni, year: Number(year) }).toArray();
  list.sort((a, b) => a.month - b.month);
  return list;
}

export async function deletePayment(id) {
  if (!id) return false;
  await db.table("payments").delete(id);
  return true;
}

async function getPaymentByKey(dni, year, month) {
  return db.table("payments").where({ dni, year: Number(year), month: Number(month) }).first();
}

/** Mantengo esta API legacy para no romper tu UI actual */
export async function upsertPayment(payload) {
  const {
    dni,
    year,
    month,
    amount,
    method = "efectivo",
    receipt = "",
    date = todayISO(),
  } = payload || {};

  if (!dni) throw new Error("Falta DNI.");
  if (!year || !month) throw new Error("Falta año o mes.");
  if (amount == null || isNaN(Number(amount))) throw new Error("Importe inválido.");

  const st = await db.students.get(dni);
  if (!st) throw new Error("No existe el socio.");

  const existing = await getPaymentByKey(dni, year, month);
  if (existing) {
    await db.table("payments").update(existing.id, {
      amount: Number(amount),
      method,
      receipt,
      date,
      updated_at: new Date().toISOString(),
    });
    // Vincular a membership del período (si existe)
    const mem = await db.table("memberships").where({ dni, period_year: Number(year), period_month: Number(month) }).first();
    if (mem) {
      await db.table("memberships").update(mem.id, { payment_id: existing.id, status: "paid", updated_at: new Date().toISOString() });
    }
    return await db.table("payments").get(existing.id);
  }

  const created = await addPayment({ dni, year, month, amount, method, receipt, date });

  // Vincular/crear membership del período
  const C = await getAppConfig();
  const mem = await getOrCreateMembershipForPeriod(dni, Number(year), Number(month), C);
  await db.table("memberships").update(mem.id, {
    payment_id: created.id,
    status: "paid",
    updated_at: new Date().toISOString(),
  });

  return created;
}

/**
 * NUEVO: Upsert que garantiza membership del período y la enlaza al pago.
 */
export async function upsertPaymentWithMembership(payload) {
  // Reusa la lógica de arriba para no duplicar comportamiento
  return upsertPayment(payload);
}

/* ========================
   Export utilidades públicas Membership para la UI
======================== */
export async function getMembershipsByDni(dni) {
  const list = await db.table("memberships").where("dni").equals(dni).toArray();
  list.sort((a, b) => {
    if (a.period_year !== b.period_year) return b.period_year - a.period_year;
    return b.period_month - a.period_month;
  });
  return list;
}

export async function linkPaymentToMembership(membershipId, paymentId) {
  if (!membershipId || !paymentId) return false;
  await db.table("memberships").update(membershipId, {
    payment_id: paymentId,
    status: "paid",
    updated_at: new Date().toISOString(),
  });
  return true;
}
