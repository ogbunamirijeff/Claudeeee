import { TwilioSmsProvider } from '../../src/modules/sms/twilio.provider';

describe('TwilioSmsProvider', () => {
  const cfg = { accountSid: 'AC123', authToken: 'secret', messagingServiceSid: 'MG456' };

  it('posts a form-encoded message with basic auth via the messaging service', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ sid: 'SM1' }) });
    const p = new TwilioSmsProvider(cfg, fetchMock);
    await expect(
      p.send({ to: '+17135550123', body: 'code 123456', transactional: true }),
    ).resolves.toEqual({
      providerMessageId: 'SM1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(init.headers.authorization).toBe(
      `Basic ${Buffer.from('AC123:secret').toString('base64')}`,
    );
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      To: '+17135550123',
      Body: 'code 123456',
      MessagingServiceSid: 'MG456',
    });
  });

  it('falls back to a From number', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ sid: 'SM2' }) });
    const p = new TwilioSmsProvider(
      { accountSid: 'AC1', authToken: 't', fromNumber: '+18885550100' },
      fetchMock,
    );
    await p.send({ to: '+17135550123', body: 'x', transactional: false });
    expect(new URLSearchParams(fetchMock.mock.calls[0][1].body).get('From')).toBe('+18885550100');
  });

  it('throws on provider errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ code: 21211, message: 'Invalid To' }),
    });
    const p = new TwilioSmsProvider(cfg, fetchMock);
    await expect(p.send({ to: '+17135550123', body: 'x', transactional: false })).rejects.toThrow(
      /400/,
    );
  });
});
