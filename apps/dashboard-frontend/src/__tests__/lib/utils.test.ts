import { describe, it, expect } from 'vitest';
import { cn } from '../../lib/utils';

describe('cn() utility', () => {
  it('merges multiple class names', () => {
    const result = cn('foo', 'bar', 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('handles conditional classes via clsx syntax', () => {
    const isActive = true;
    const isDisabled = false;

    const result = cn('base', isActive && 'active', isDisabled && 'disabled');
    expect(result).toBe('base active');
    expect(result).not.toContain('disabled');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    // twMerge should resolve conflicting Tailwind utility classes
    const result = cn('p-4', 'p-2');
    expect(result).toBe('p-2');
  });

  it('handles undefined and null inputs gracefully', () => {
    const result = cn('valid', undefined, null, 'also-valid');
    expect(result).toBe('valid also-valid');
  });

  it('handles empty string inputs', () => {
    const result = cn('', 'foo', '', 'bar');
    expect(result).toBe('foo bar');
  });

  it('handles object syntax from clsx', () => {
    const result = cn({ 'text-red-500': true, 'text-blue-500': false, 'font-bold': true });
    expect(result).toContain('text-red-500');
    expect(result).toContain('font-bold');
    expect(result).not.toContain('text-blue-500');
  });

  it('handles array syntax from clsx', () => {
    const result = cn(['foo', 'bar'], 'baz');
    expect(result).toBe('foo bar baz');
  });

  it('resolves complex Tailwind conflicts', () => {
    // Background color conflict
    const result = cn('bg-red-500', 'bg-blue-500');
    expect(result).toBe('bg-blue-500');
  });

  it('returns empty string for no arguments', () => {
    const result = cn();
    expect(result).toBe('');
  });
});
