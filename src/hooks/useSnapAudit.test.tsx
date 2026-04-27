import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSnapAudit } from './useSnapAudit';

describe('useSnapAudit', () => {
  it('keeps saved sessions scoped by user id', async () => {
    const { result } = renderHook(() => useSnapAudit());

    act(() => {
      result.current.setUserScope('user-a');
    });

    act(() => {
      result.current.createSession('2026/04/27-1851', '1851');
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('snapaudit_sessions:user-a')).toContain('2026/04/27-1851');
    });

    act(() => {
      result.current.setUserScope('user-b');
    });

    expect(result.current.sessions).toEqual([]);

    act(() => {
      result.current.setUserScope('user-a');
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].location).toBe('1851');
  });

  it('deduplicates custom stores', () => {
    const { result } = renderHook(() => useSnapAudit());

    act(() => {
      result.current.addStore('9999');
      result.current.addStore('9999');
    });

    expect(result.current.stores.filter((store) => store === '9999')).toHaveLength(1);
  });
});
