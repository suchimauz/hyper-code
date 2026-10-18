import { describe, expect, test } from 'bun:test';
const { serverURL, webURL, sameOrigin } = require('./security.cjs');

describe('saved server URL', () => {
  test('supports HTTPS, LAN HTTP, IPv6 and base paths', () => {
    expect(serverURL(' https://EXAMPLE.com ')).toBe('https://example.com/');
    expect(serverURL('http://192.168.1.10:3000/hyper/')).toBe('http://192.168.1.10:3000/hyper/');
    expect(serverURL('http://[::1]:3000')).toBe('http://[::1]:3000/');
  });
  for (const value of ['', 'host:3000', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', 'https://u:p@example.com', 'https://example.com/?token=secret', 'https://example.com/#token', null, {}, 'x'.repeat(4097)]) {
    test(`rejects unsafe or ambiguous input ${String(value).slice(0, 60)}`, () => {
      expect(() => serverURL(value)).toThrow();
    });
  }
});

describe('navigation / external links', () => {
  test('allows same origin paths, including application query strings', () => {
    expect(sameOrigin('https://example.com/path?q=1#x', 'https://example.com')).toBe(true);
  });
  for (const value of ['http://example.com/', 'https://example.com:444/', 'https://example.com.evil.test/', 'https://user@example.com/', 'file:///tmp/x', 'javascript:alert(1)', 'not a URL']) {
    test(`does not trust ${value}`, () => { expect(sameOrigin(value, 'https://example.com')).toBe(false); });
  }
  test('external protocol allowlist', () => {
    for (const value of ['file:///tmp/a', 'mailto:a@b.c', 'hyper://run', 'javascript:void(0)', 'https://user:pass@example.com']) expect(webURL(value)).toBeNull();
    expect(webURL('https://example.org/?q=hello').hostname).toBe('example.org');
  });
});
