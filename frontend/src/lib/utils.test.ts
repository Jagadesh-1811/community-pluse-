import { cn } from './utils';
import { describe, it, expect } from 'vitest';

describe('cn utility function', () => {
  it('should merge class names correctly', () => {
    expect(cn('bg-red-500', 'text-white')).toBe('bg-red-500 text-white');
  });

  it('should override conflicting tailwind classes', () => {
    expect(cn('px-2 py-1', 'p-4')).toBe('p-4');
  });

  it('should ignore falsy values', () => {
    expect(cn('bg-blue-500', null, undefined, false, 'text-black')).toBe('bg-blue-500 text-black');
  });
});
