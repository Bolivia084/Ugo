jest.mock('../lib/settings', () => ({ useSettings: jest.fn() }));
import { imageSrc } from '../components/question';

describe('data saver images', () => {
  it('asks for a smaller image when data saver is on', () => {
    expect(imageSrc('https://cdn.ugo.ng/a.png', true)).toBe('https://cdn.ugo.ng/a.png?w=480&q=60');
    expect(imageSrc('https://cdn.ugo.ng/a.png?v=2', true)).toBe('https://cdn.ugo.ng/a.png?v=2&w=480&q=60');
    expect(imageSrc('https://cdn.ugo.ng/a.png', false)).toBe('https://cdn.ugo.ng/a.png');
  });
});
