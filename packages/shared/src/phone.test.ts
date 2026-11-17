import { formatNgPhone, maskPhone, normalizeNgPhone, toTermiiFormat } from './phone';

describe('normalizeNgPhone', () => {
  it.each([
    ['08031234512', '+2348031234512'],
    ['0803 123 4512', '+2348031234512'],
    ['8031234512', '+2348031234512'],
    ['2348031234512', '+2348031234512'],
    ['+234 803-123-4512', '+2348031234512'],
    ['07061234567', '+2347061234567'],
    ['09151234567', '+2349151234567'],
    ['08131234567', '+2348131234567'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeNgPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '0803123451', // too short
    '080312345123', // too long
    '06031234512', // not a mobile prefix
    '08231234512', // 82x is not allocated to mobile
    '+4478031234512', // foreign
    '+08031234512', // "+" with a local number
    '0803abc4512',
    '01-2345678', // Lagos landline
  ])('rejects %p', (input) => {
    expect(normalizeNgPhone(input)).toBeNull();
  });
});

describe('formatting', () => {
  it('masks all but the operator prefix and last two digits', () => {
    expect(maskPhone('+2348031234512')).toBe('+234 80•• ••• •12');
  });
  it('formats for display', () => {
    expect(formatNgPhone('+2348031234512')).toBe('0803 123 4512');
  });
  it('formats for Termii', () => {
    expect(toTermiiFormat('+2348031234512')).toBe('2348031234512');
  });
});
