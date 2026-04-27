export const TEST_USER_ID = 'local-test-user';

export const isTestAuthEnabled = () => {
  if (import.meta.env.VITE_ENABLE_TEST_AUTH === 'true') return true;

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('testAuth') === '1';
  }

  return false;
};
