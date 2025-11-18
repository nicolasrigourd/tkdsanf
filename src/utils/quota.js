// src/utils/quota.js
import { firestore } from "../firebaseconfig";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";

/** ID de tenant - podés parametrizarlo si tenés varios clientes */
export const TENANT_ID = "default";

/** Obtiene (o crea) el doc de tenant con valores por defecto */
export async function getOrInitTenant(tenantId = TENANT_ID) {
  const ref = doc(firestore, "tenants", tenantId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const data = {
      uploads_remaining: 15,     // 🔧 valor inicial
      restores_remaining: 15,    // 🔧 valor inicial
      plan: "free",
      active: true,
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return { id: tenantId, ...data };
    }
  return { id: tenantId, ...snap.data() };
}

/**
 * Decrementa de manera atómica (transacción) un contador del tenant.
 * field: "uploads_remaining" | "restores_remaining"
 * Lanza error si no hay saldo.
 * Devuelve el nuevo valor del contador luego del decremento.
 */
export async function decrementQuota(field, tenantId = TENANT_ID) {
  if (!["uploads_remaining", "restores_remaining"].includes(field)) {
    throw new Error("Campo de cuota inválido.");
  }
  const ref = doc(firestore, "tenants", tenantId);

  const newValue = await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("Tenant no inicializado.");
    }
    const data = snap.data() || {};
    const prev = Number(data[field] ?? 0);
    if (prev <= 0) {
      throw new Error("Límite alcanzado. Contactá al administrador para ampliar.");
    }
    const next = prev - 1;
    tx.update(ref, { [field]: next, updatedAt: serverTimestamp() });
    return next;
  });

  return newValue;
}

/** Lee la cuota actual (sin modificarla) */
export async function getQuota(tenantId = TENANT_ID) {
  const ref = doc(firestore, "tenants", tenantId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    uploads_remaining: Number(data.uploads_remaining ?? 0),
    restores_remaining: Number(data.restores_remaining ?? 0),
    plan: data.plan || "free",
    active: !!data.active,
  };
}

/**
 * (Opcional) Ajusta cuotas desde tu panel admin rápido.
 * setQuota({ uploads: 20, restores: 10 })
 */
export async function setQuota({ uploads, restores, plan, active }, tenantId = TENANT_ID) {
  const ref = doc(firestore, "tenants", tenantId);
  const patch = { updatedAt: serverTimestamp() };
  if (typeof uploads === "number") patch.uploads_remaining = uploads;
  if (typeof restores === "number") patch.restores_remaining = restores;
  if (typeof plan === "string") patch.plan = plan;
  if (typeof active === "boolean") patch.active = active;
  await setDoc(ref, patch, { merge: true });
  return true;
}
