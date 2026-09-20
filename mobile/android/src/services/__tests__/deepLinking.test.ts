import { parseAuthCallbackUrl } from '../deepLinking';

describe('parseAuthCallbackUrl', () => {
  it('returns null for URLs that are not our deep link', () => {
    expect(parseAuthCallbackUrl('https://example.com')).toBeNull();
    expect(parseAuthCallbackUrl('rxguard://some-other-host#foo=bar')).toBeNull();
    expect(parseAuthCallbackUrl('')).toBeNull();
  });

  it('parses a recovery link fragment', () => {
    const url = 'rxguard://auth-callback#access_token=abc123&refresh_token=def456&type=recovery';
    const result = parseAuthCallbackUrl(url);
    expect(result).not.toBeNull();
    expect(result?.type).toBe('recovery');
    expect(result?.accessToken).toBe('abc123');
    expect(result?.refreshToken).toBe('def456');
    expect(result?.errorCode).toBeNull();
  });

  it('parses a signup confirmation link fragment', () => {
    const url = 'rxguard://auth-callback#access_token=xyz789&refresh_token=uvw000&type=signup&expires_in=3600';
    const result = parseAuthCallbackUrl(url);
    expect(result?.type).toBe('signup');
    expect(result?.accessToken).toBe('xyz789');
  });

  it('parses an error response', () => {
    const url = 'rxguard://auth-callback#error=access_denied&error_description=Email+link+is+invalid+or+has+expired';
    const result = parseAuthCallbackUrl(url);
    expect(result?.errorCode).toBe('access_denied');
    expect(result?.errorDescription).toBe('Email link is invalid or has expired');
    expect(result?.accessToken).toBeNull();
  });

  it('handles an error arriving as a query string instead of a fragment', () => {
    const url = 'rxguard://auth-callback?error=server_error&error_description=Something+went+wrong';
    const result = parseAuthCallbackUrl(url);
    expect(result?.errorCode).toBe('server_error');
    expect(result?.errorDescription).toBe('Something went wrong');
  });

  it('decodes percent-encoded characters', () => {
    const url = 'rxguard://auth-callback#error_description=Link%20is%20invalid';
    const result = parseAuthCallbackUrl(url);
    expect(result?.errorDescription).toBe('Link is invalid');
  });
});
