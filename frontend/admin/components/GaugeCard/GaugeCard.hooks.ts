"use client";

export function getValueColor(
  value: number | null,
  normalRange: [number, number],
  warningRange: [number, number]
): string {
  if (value === null) return "#909097";
  if (value >= normalRange[0] && value <= normalRange[1]) return "#22c55e";
  if (value >= warningRange[0] && value <= warningRange[1]) return "#f59e0b";
  return "#ef4444";
}

export function getArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}
