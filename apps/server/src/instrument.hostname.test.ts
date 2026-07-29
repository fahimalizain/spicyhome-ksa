// Ensure SENTRY_DSN is not set so Sentry init is skipped during module load.
const originalDsn = process.env.SENTRY_DSN;
delete process.env.SENTRY_DSN;

const { resolveFallbackHostname, isSentryInitialized } = require('./instrument');

afterAll(() => {
  if (originalDsn) process.env.SENTRY_DSN = originalDsn;
});

describe('resolveFallbackHostname', () => {
  beforeEach(() => {
    delete process.env.COMPUTERNAME;
    delete process.env.HOSTNAME;
  });

  it('returns COMPUTERNAME when set', () => {
    process.env.COMPUTERNAME = 'TEST-COMPUTER';
    expect(resolveFallbackHostname()).toBe('TEST-COMPUTER');
  });

  it('returns HOSTNAME when COMPUTERNAME is not set', () => {
    process.env.HOSTNAME = 'test-host';
    expect(resolveFallbackHostname()).toBe('test-host');
  });

  it('returns spicyhome-server as last resort', () => {
    expect(resolveFallbackHostname()).toBe('spicyhome-server');
  });
});

describe('instrument guard', () => {
  it('isSentryInitialized returns false without DSN', () => {
    expect(isSentryInitialized()).toBe(false);
  });

  it('module loads without crashing', () => {
    // If we got here, the module loaded successfully. The try/catch
    // guard around os.hostname() and the try/catch around Sentry.init
    // prevented any init-time crash.
    expect(true).toBe(true);
  });
});
