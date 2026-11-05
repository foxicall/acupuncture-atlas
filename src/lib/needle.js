// Angles are relative to the skin plane. A literal “直刺” can be drawn perpendicular
// without claiming the source supplied a numeric angle. Other unnumbered techniques
// are left unvisualized rather than assigning an arbitrary angle.
export function needleSpec(point) {
  const method = point.technique?.method || '';
  if (point.angleDegrees != null) {
    return { angle: point.angleDegrees, label: `${point.angleDegrees}°（相對皮面）`, towardMidline: /向正中/.test(method) };
  }
  if (/^直刺/.test(method.replace(/\*|\s/g, ''))) return { angle: 90, label: '直刺（垂直皮面示意）', towardMidline: false };
  return null;
}
