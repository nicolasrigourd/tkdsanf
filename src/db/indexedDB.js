// src/db/indexedDB.js
import Dexie from "dexie";

/**
 * DB local-first (IndexedDB con Dexie)
 * Tablas:
 *  - students: socios/alumnos (PK = dni)
 *  - attendance: asistencias por día (PK autoincremental)
 *  - config: key-value (PK = key) para configuración global
 */
export const db = new Dexie("tkddb");

// v1 existía con students + attendance
db.version(1).stores({
  students: "dni, last_name, first_name, start_date, active",
  attendance: "++id, dni, date",
});

// v2: agregamos tabla config (key-value)
db.version(2).stores({
  students: "dni, last_name, first_name, start_date, active",
  attendance: "++id, dni, date",
  config: "key",
}).upgrade(async (tx) => {
  // Migrar config previa desde localStorage si existía
  try {
    const raw = localStorage.getItem("tkd_config");
    if (raw) {
      await tx.table("config").put({ key: "app", value: JSON.parse(raw) });
      // localStorage.removeItem("tkd_config");
    }
  } catch {}
});

/* =========================
   Utils de fecha
========================= */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* =========================
   Config (tabla config)
========================= */
const DEFAULT_CONFIG = {
  price_base: 25000,
  yellow_days_before_end: 5,
  grace_days_after_end: 10,
  family_discount_pct: 20,
  new_student_discount_pct: 10,
  midmonth_policy: "manual", // "manual" | "prorate"
  trial_coupon_code: "TKDPRUEBA",
  trial_days: 1,
  // Ventana de pago
  billing_window_start_day: 1,
  billing_window_end_day: 10,
};

export async function getAppConfig() {
  const row = await db.table("config").get("app");
  return row?.value ? { ...DEFAULT_CONFIG, ...row.value } : { ...DEFAULT_CONFIG };
}

export async function saveAppConfig(patch) {
  const prev = await getAppConfig();
  const merged = { ...prev, ...patch };
  await db.table("config").put({ key: "app", value: merged });
  return merged;
}

/* =========================
   Seed (mock de alumnos)
========================= */
export async function seedMockStudents() {
  const count = await db.students.count();
  if (count > 0) return;

  const today = todayISO();

  const mock = [
    {
      dni: "12345678",
      first_name: "Juan",
      last_name: "Pérez",
      phone: "+549385000000",
      address: "San Martín 123",
      start_date: today,
      plan_total_classes: 24,
      plan_end_date: addDaysISO(today, 28),
      is_new_student: true,
      price_applied: 20000,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      dni: "23456789",
      first_name: "María",
      last_name: "Gómez",
      phone: "+549385111111",
      address: "Rivadavia 456",
      start_date: addDaysISO(today, -10),
      plan_total_classes: 24,
      plan_end_date: addDaysISO(addDaysISO(today, -10), 28),
      is_new_student: false,
      price_applied: 25000,
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      dni: "34567890",
      first_name: "Luis",
      last_name: "Soria",
      phone: "+549385222222",
      address: "Belgrano 789",
      start_date: addDaysISO(today, -27),
      plan_total_classes: 24,
      plan_end_date: addDaysISO(addDaysISO(today, -27), 28),
      is_new_student: false,
      price_applied: 25000,
      active: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  await db.students.bulkPut(mock);
}

/* =========================
   Helpers alumnos
========================= */
export function getStudent(dni) {
  return db.students.get(dni);
}

/* =========================
   Asistencias (hoy)
   - dismissed: false → visible en la lista del día
   - dismissed: true  → oculto (no se muestra), pero NO se borra
========================= */
export async function addAttendanceToday(dni) {
  const date = todayISO();

  const student = await db.students.get(dni);
  if (!student) throw new Error("No existe ningún socio con ese DNI.");
  if (student.active === false) throw new Error("El socio está inactivo.");

  const exists = await db.attendance.where({ dni, date }).first();

  // Si ya existía y estaba oculto, lo reactivamos (undismiss)
  if (exists) {
    if (exists.dismissed === true) {
      await db.attendance.update(exists.id, {
        dismissed: false,
        updated_at: new Date().toISOString(),
      });
      const att = await db.attendance.get(exists.id);
      return { ...att, _student: student, repeated: false, reinstated: true };
    }
    // Ya existía y no estaba oculto → repetido
    return { ...exists, _student: student, repeated: true };
  }

  // Nuevo registro del día, visible por defecto
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
  // Dexie no tiene bulkUpdate estándar: actualizamos uno por uno
  await Promise.all(
    visibles.map((r) =>
      db.attendance.update(r.id, { dismissed: true, updated_at: new Date().toISOString() })
    )
  );
  return visibles.length; // cuántas ocultó
}

export async function getTodayAttendances() {
  const date = todayISO();
  const rows = await db.attendance.where("date").equals(date).toArray();

  // Solo visibles (no ocultos)
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
