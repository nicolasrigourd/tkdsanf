// src/utils/backups.js
import { firestore } from "../firebaseconfig"; // 👈 ajustá la ruta si tu archivo está en otro lugar
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import LZString from "lz-string";

// 👉 tu Dexie
import { db } from "../db/indexedDB";

/* =========================
   Configuración backups
========================= */
const MAX_DOC_SIZE = 900 * 1024; // ~900KB por parte (margen seguro)
const COMPRESS = true;           // true = comprimir con LZString

/* =========================
   Helpers
========================= */
async function sha256(text) {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = [...new Uint8Array(hashBuffer)];
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function chunkString(str, size) {
  const out = [];
  for (let i = 0; i < str.length; i += size) {
    out.push(str.slice(i, i + size));
  }
  return out;
}

/* =========================
   Exportar desde IndexedDB
========================= */
export async function dumpLocalDb() {
  const [students, attendance, configRows, payments] = await Promise.all([
    db.students.toArray(),
    db.attendance.toArray(),
    db.config.toArray(),
    db.payments?.toArray?.() ?? [],
  ]);

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      dbVersion: 3, // actualizá si cambiás el versionado de Dexie
      appVersion: "v1",
      tables: ["students", "attendance", "config", ...(db.payments ? ["payments"] : [])],
    },
    students,
    attendance,
    config: configRows,
    payments,
  };
}

/* =========================
   QUOTAS (tenant "default")
========================= */
const DEFAULT_TENANT_ID = "default";

/** Lee la cuota disponible (backupsLeft, restoresLeft) */
export async function getTenantQuota(tenantId = DEFAULT_TENANT_ID) {
  const ref = doc(firestore, "quota", tenantId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    // si no existe, creamos una por defecto = 15/15
    const def = {
      backupsLeft: 15,
      restoresLeft: 15,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, def, { merge: true });
    return { ...def, created: true };
  }
  return snap.data();
}

/** Decrementa una unidad del campo indicado si es > 0 */
export async function decrementQuota(kind = "backupsLeft", tenantId = DEFAULT_TENANT_ID) {
  const ref = doc(firestore, "quota", tenantId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("No hay documento de cuota configurado.");
  const data = snap.data();
  const current = Number(data?.[kind] ?? 0);
  if (current <= 0) throw new Error("No hay cupo disponible.");
  await setDoc(ref, { [kind]: current - 1, updatedAt: serverTimestamp() }, { merge: true });
  return current - 1;
}

/* =========================
   Crear backup → Firestore
========================= */
export async function createBackup({ note = "", enforceQuota = true } = {}) {
  // 0) Chequear cuota
  if (enforceQuota) {
    const q = await getTenantQuota();
    const left = Number(q?.backupsLeft ?? 0);
    if (left <= 0) throw new Error("No hay cupo para crear copias de seguridad.");
  }

  // 1) Dump local
  const dump = await dumpLocalDb();
  let json = JSON.stringify(dump);

  // 2) Comprimir (opcional)
  let compressor = "none";
  if (COMPRESS) {
    json = LZString.compressToUTF16(json);
    compressor = "lz-string";
  }

  const totalBytes = new Blob([json]).size;
  const hash = await sha256(json);

  // 3) Particionar
  const parts = chunkString(json, MAX_DOC_SIZE);
  const partCount = parts.length;

  // 4) Metadata
  const backupsRef = collection(firestore, "backups");
  const ref = doc(backupsRef); // id autogenerado
  const meta = {
    createdAt: serverTimestamp(),
    appVersion: dump.meta.appVersion,
    dbVersion: dump.meta.dbVersion,
    totalBytes,
    parts: partCount,
    hash,
    compressor,
    schema: {
      students: true,
      attendance: true,
      config: true,
      payments: dump.payments?.length > 0,
    },
    note,
    fromHost: window.location.host,
  };
  await setDoc(ref, meta);

  // 5) Subcolección "parts"
  const partsCol = collection(ref, "parts");
  for (let i = 0; i < parts.length; i++) {
    const pRef = doc(partsCol, String(i).padStart(5, "0"));
    await setDoc(pRef, { idx: i, data: parts[i] });
  }

  // 6) Descontar cuota (si aplica)
  if (enforceQuota) {
    await decrementQuota("backupsLeft");
  }

  return { id: ref.id, ...meta };
}

/* =========================
   Listar últimos backups
========================= */
export async function listBackups({ take = 20 } = {}) {
  const q = query(collection(firestore, "backups"), orderBy("createdAt", "desc"), limit(take));
  const snap = await getDocs(q);
  // Normalizamos createdAt sea Timestamp o string ISO
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      createdAt: data.createdAt || null,
    };
  });
}

/* =========================
   Descargar backup
========================= */
export async function fetchBackup(backupId) {
  const ref = doc(firestore, "backups", backupId);
  const metaSnap = await getDoc(ref);
  if (!metaSnap.exists()) throw new Error("Backup no encontrado.");
  const meta = metaSnap.data();

  const partsCol = collection(ref, "parts");
  const partsSnap = await getDocs(partsCol);

  const parts = partsSnap.docs
    .map((d) => d.data())
    .sort((a, b) => a.idx - b.idx)
    .map((p) => p.data);

  let dataStr = parts.join("");

  // Verificar integridad
  const gotHash = await sha256(dataStr);
  if (meta.hash && gotHash !== meta.hash) {
    console.warn("⚠️ Hash diferente: el backup podría estar corrupto.");
  }

  // Descomprimir si corresponde
  if (meta.compressor === "lz-string") {
    dataStr = LZString.decompressFromUTF16(dataStr);
  }

  const payload = JSON.parse(dataStr);
  return { meta, payload };
}

/* =========================
   Restaurar backup → IndexedDB
========================= */
export async function restoreBackupToLocal(backupId, { enforceQuota = true } = {}) {
  // 0) Chequear cuota de restauración
  if (enforceQuota) {
    const q = await getTenantQuota();
    const left = Number(q?.restoresLeft ?? 0);
    if (left <= 0) throw new Error("No hay cupo para restauraciones.");
  }

  const { payload } = await fetchBackup(backupId);

  // Transacción para atomicidad
  await db.transaction("rw", db.students, db.attendance, db.config, db.payments, async () => {
    await Promise.all([
      db.students.clear(),
      db.attendance.clear(),
      db.config.clear(),
      db.payments?.clear?.(),
    ]);

    if (payload.students?.length) await db.students.bulkAdd(payload.students);
    if (payload.attendance?.length) await db.attendance.bulkAdd(payload.attendance);
    if (payload.config?.length) await db.config.bulkAdd(payload.config);
    if (Array.isArray(payload.payments) && db.payments) {
      if (payload.payments.length) await db.payments.bulkAdd(payload.payments);
    }
  });

  // Descontar cuota de restore si aplica
  if (enforceQuota) {
    await decrementQuota("restoresLeft");
  }

  return true;
}
