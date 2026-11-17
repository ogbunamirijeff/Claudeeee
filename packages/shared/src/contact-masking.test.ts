import { MASK_TOKEN, maskContactInfo } from './contact-masking';

describe('maskContactInfo', () => {
  it.each([
    'call me on 08031234567',
    'my line is 0803 123 4567',
    'reach me +234-803-123-4567',
    'account 0123456789 GTB',
    'email tunde.adeyemi@gmail.com',
    'tunde (at) gmail (dot) com',
    'zero eight zero three one two three four',
    'follow @tunde_fixes',
    'wa.me/2348031234567',
  ])('masks %p', (msg) => {
    const r = maskContactInfo(msg);
    expect(r.masked).toBe(true);
    expect(r.flagged).toBe(true);
    expect(r.text).toContain(MASK_TOKEN);
    expect(r.text).not.toMatch(/\d{7}/);
  });

  it.each([
    'I can come at 10am tomorrow',
    'The sockets cost ₦1,500 each',
    'Job JK-1042, 2 bedrooms, 3 sockets',
  ])('leaves normal messages alone: %p', (msg) => {
    expect(maskContactInfo(msg)).toEqual({ text: msg, masked: false, flagged: false });
  });

  it('flags attempts to move off-platform even without a number', () => {
    expect(maskContactInfo('just whatsapp me and pay directly')).toMatchObject({
      masked: false,
      flagged: true,
    });
  });
});
