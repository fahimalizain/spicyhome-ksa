import { describe, it, expect } from 'vitest';
import { buildRealtimeWsUrl } from '../realtime';

describe('buildRealtimeWsUrl', () => {
  it('builds ws://<host>/ws with no token', () => {
    expect(buildRealtimeWsUrl({ protocol: 'http:', host: 'localhost:3742' })).toBe(
      'ws://localhost:3742/ws',
    );
  });

  it('appends the token as a query parameter', () => {
    expect(
      buildRealtimeWsUrl({ protocol: 'http:', host: 'localhost:3742', token: 'jwt-123' }),
    ).toBe('ws://localhost:3742/ws?token=jwt-123');
  });

  it('uses wss:// for https pages', () => {
    expect(buildRealtimeWsUrl({ protocol: 'https:', host: 'pos.example.com' })).toBe(
      'wss://pos.example.com/ws',
    );
    expect(
      buildRealtimeWsUrl({ protocol: 'https:', host: 'pos.example.com', token: 'jwt-123' }),
    ).toBe('wss://pos.example.com/ws?token=jwt-123');
  });

  it('always connects to /ws, never /api/ws', () => {
    const urls = [
      buildRealtimeWsUrl({ protocol: 'http:', host: 'localhost:3742' }),
      buildRealtimeWsUrl({ protocol: 'http:', host: 'localhost:3742', token: 'jwt-123' }),
      buildRealtimeWsUrl({ protocol: 'https:', host: 'pos.example.com', token: 'jwt-123' }),
    ];
    for (const url of urls) {
      expect(url).toContain('/ws');
      expect(url).not.toContain('/api/ws');
    }
  });
});
