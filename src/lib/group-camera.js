import { Box3, Vector3, MathUtils } from 'three';

/** Fit a bounding sphere inside BOTH camera fields of view, including portrait. */
export function fitAcupointGroup(points, fov, aspect) {
  if (!points.length || !(aspect > 0)) return null;
  const bounds = new Box3().setFromPoints(points.map(point => new Vector3(...point.position)));
  const target = bounds.getCenter(new Vector3());
  const radius = Math.max(bounds.getSize(new Vector3()).length() / 2, 0.16);
  const halfVertical = MathUtils.degToRad(fov / 2);
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  const distance = (radius + 0.08) / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.18;
  const normal = points.reduce((sum, point) => sum.add(new Vector3(...point.normal)), new Vector3());
  const direction = new Vector3(0.35, 0.18, normal.z < 0 ? -1 : 1).normalize();
  return { target, position: target.clone().addScaledVector(direction, distance), distance };
}
