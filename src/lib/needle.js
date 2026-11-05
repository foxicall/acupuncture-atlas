// Angles are relative to the skin plane. A literal “直刺” can be drawn perpendicular
// without claiming the source supplied a numeric angle. Other unnumbered techniques
// are left unvisualized rather than assigning an arbitrary angle.
export function normalizedNeedleVector(value) {
  if (!Array.isArray(value) || value.length !== 3 || ![0, 1, 2].every(index => Number.isFinite(value[index]))) return null;
  const scale = Math.max(...value.map(Math.abs));
  if (scale === 0) return null;
  // Scaling first avoids overflow/underflow for otherwise finite components.
  const scaled = value.map(component => component / scale);
  const magnitude = Math.hypot(...scaled);
  return scaled.map(component => component / magnitude);
}

export function needleSpec(point) {
  const method = point.technique?.method || '';
  if (point.angleDegrees != null) {
    return { angle: point.angleDegrees, label: `${point.angleDegrees}°（相對皮面）`, towardMidline: /向正中/.test(method) };
  }
  if (/^直刺/.test(method.replace(/\*|\s/g, ''))) return { angle: 90, label: '直刺（垂直皮面示意）', towardMidline: false };
  return null;
}
