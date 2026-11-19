import { formatPhone, maskPhone, normalizePhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['7135550123', '+17135550123'],
    ['(713) 555-0123', '+17135550123'],
    ['713.555.0123', '+17135550123'],
    ['1 713 555 0123', '+17135550123'],
    ['+1 (832) 555-0199', '+18325550199'],
    ['+12815550123', '+12815550123'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '',
    '713555012', // too short
    '71355501234', // 11 digits, not starting with 1
    '1135550123', // area code can't start with 1
    '0135550123', // or 0
    '7131550123', // exchange can't start with 1
    '9115550123', // N11 area code
    '7139110123', // N11 exchange
    '+447135550123', // UK
    '+7135550123', // "+" without country code
    '713abc0123',
  ])('rejects %p', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe('formatting', () => {
  it('masks all but the area code and last two digits', () => {
    expect(maskPhone('+17135550123')).toBe('+1 (713) •••-••23');
  });
  it('formats for display', () => {
    expect(formatPhone('+17135550123')).toBe('(713) 555-0123');
  });
});
