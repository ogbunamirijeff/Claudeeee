import { TermiiSmsProvider } from '../../src/modules/sms/termii.provider';

describe('TermiiSmsProvider', () => {
  const cfg = {
    baseUrl: 'https://api.ng.termii.com',
    apiKey: 'key',
    senderId: 'Jiko',
    channel: 'generic' as const,
  };

  it('sends OTPs on the DND channel in Termii number format', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ message_id: 'm1' }) });
    const p = new TermiiSmsProvider(cfg, fetchMock);
    await expect(
      p.send({ to: '+2348031234512', body: 'code 123456', transactional: true }),
    ).resolves.toEqual({
      providerMessageId: 'm1',
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.ng.termii.com/api/sms/send');
    expect(JSON.parse(init.body)).toEqual({
      api_key: 'key',
      to: '2348031234512',
      from: 'Jiko',
      sms: 'code 123456',
      type: 'plain',
      channel: 'dnd',
    });
  });

  it('throws on provider errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ message: 'bad sender' }),
    });
    const p = new TermiiSmsProvider(cfg, fetchMock);
    await expect(p.send({ to: '+2348031234512', body: 'x', transactional: false })).rejects.toThrow(
      /400/,
    );
  });
});
