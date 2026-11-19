import { MASK_TOKEN, maskContactInfo } from './contact-masking';

describe('maskContactInfo', () => {
  it.each([
    'call me at 713-555-0123',
    'my cell is (832) 555 0199',
    'reach me +1 281 555 0123',
    'text 7135550123 when outside',
    'routing 111000025 account 123456789',
    'email mike.johnson@gmail.com',
    'mike (at) gmail (dot) com',
    'seven one three five five five zero one two three',
    'follow @mike_fixes',
    'cash app me $MikeFixes',
    'wa.me/17135550123',
  ])('masks %p', (msg) => {
    const r = maskContactInfo(msg);
    expect(r.masked).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.text).toContain(MASK_TOKEN);
    expect(r.text).not.toMatch(/\d{7}/);
  });

  it.each([
    'I can come at 10am tomorrow',
    'The outlets cost $15 each',
    'Job JK-1042, 2 bedrooms, 3 outlets, $250 total',
  ])('leaves normal messages alone: %p', (msg) => {
    expect(maskContactInfo(msg)).toEqual({ text: msg, masked: false, flagged: false });
  });

  it('masks a bracketed area code without leaving stray punctuation', () => {
    expect(maskContactInfo('call (713) 555-0123 now').text).toBe('call [hidden until payment] now');
  });

  it('flags attempts to move off-platform even without a number', () => {
    expect(maskContactInfo('just pay me directly on Zelle')).toMatchObject({
      masked: false,
      flagged: true,
    });
    expect(maskContactInfo('I take Venmo, cheaper for you')).toMatchObject({
      masked: false,
      flagged: true,
    });
  });
});
