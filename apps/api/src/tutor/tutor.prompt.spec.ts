import { ageBand, redactPersonalDetails } from './tutor.prompt.js';

describe('tutor safety helpers', () => {
  it('removes contact details before calling the AI provider', () => {
    const out = redactPersonalDetails('my number is 08031234567 and email ada@example.com, +234 803 123 4567');
    expect(out).not.toMatch(/0803|ada@|234 803/);
  });
  it('keeps normal maths intact', () => {
    expect(redactPersonalDetails('solve 3x + 5 = 20')).toBe('solve 3x + 5 = 20');
  });
  it('maps ages to bands', () => {
    expect(ageBand(9)).toMatch(/under 10/);
    expect(ageBand(17)).toMatch(/16 to 17/);
    expect(ageBand(null)).toMatch(/unknown/);
  });
});
