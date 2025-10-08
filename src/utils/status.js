// thresholds desde localStorage (o defaults)
function getThresholds() {
  const raw = localStorage.getItem("tkd_config");
  const def = { color_thresholds: { green: 20, yellow: 10, red: 4 } };
  try { return raw ? JSON.parse(raw) : def; } catch { return def; }
}

export function getPlanEndDate(startISO, weeks = 4) {
  const d = new Date(startISO);
  d.setDate(d.getDate() + (weeks * 7)); // 28 días sólo para mostrar "fin de plan"
  return d.toISOString().slice(0, 10);
}

// Para MVP: clases_restantes = snapshot (24) - asistencias válidas (0 en mock)
export function computeStatus(student, attendancesCount = 0) {
  const total = student?.plan_total_classes ?? 24;
  const left = Math.max(0, total - attendancesCount);
  const { color_thresholds } = getThresholds();
  let color = "green";
  if (left < color_thresholds.red) color = "red";
  else if (left < color_thresholds.yellow) color = "yellow";
  else if (left < color_thresholds.green) color = "yellow";
  return { left, color };
}
