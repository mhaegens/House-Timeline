/** Photo headings are stored in degrees; the panorama viewer uses radians. */
const fullTurn = 2 * Math.PI;
export const alignedYaw = (headingDegrees: number, relativeYaw = 0): number =>
  (((headingDegrees * Math.PI / 180 + relativeYaw) % fullTurn) + fullTurn) % fullTurn;

export function relativeYaw(yaw: number, headingDegrees: number): number {
  const difference = yaw - headingDegrees * Math.PI / 180;
  return (((difference + Math.PI) % fullTurn) + fullTurn) % fullTurn - Math.PI;
}
