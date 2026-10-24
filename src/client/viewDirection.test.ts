import { describe, expect, it } from 'vitest';
import { alignedYaw, relativeYaw } from './viewDirection';
const rad = (degrees: number) => degrees * Math.PI / 180;

describe('aligned timeline viewing direction', () => {
  it('preserves the viewing offset across photos taken with the camera turned', () => {
    const offset = relativeYaw(rad(120), 90);
    expect(offset).toBeCloseTo(rad(30));
    expect(alignedYaw(270, offset)).toBeCloseTo(rad(300));
  });
  it('keeps the same feature in view while scrubbing back and forth', () => {
    const offset = relativeYaw(rad(15), 350);
    expect(offset).toBeCloseTo(rad(25));
    const nextYaw = alignedYaw(170, offset);
    expect(alignedYaw(350, relativeYaw(nextYaw, 170))).toBeCloseTo(rad(15));
  });
  it('normalizes negative headings and whole turns without a long rotation', () => {
    expect(alignedYaw(-90)).toBeCloseTo(rad(270));
    expect(alignedYaw(720)).toBeCloseTo(0);
    expect(relativeYaw(rad(5), 355)).toBeCloseTo(rad(10));
  });
});
