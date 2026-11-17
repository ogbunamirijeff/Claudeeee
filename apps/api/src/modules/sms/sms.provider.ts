export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsMessage {
  to: string; // E.164
  body: string;
  /** Transactional messages (OTP) must reach DND-registered numbers. */
  transactional: boolean;
}

export interface SmsProvider {
  readonly name: string;
  send(msg: SmsMessage): Promise<{ providerMessageId: string | null }>;
}
