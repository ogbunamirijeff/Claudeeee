import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_KEY, AccessRule } from '../../src/common/decorators/access.decorators';
import { AccessGuard } from '../../src/common/guards/access.guard';
import type { PrismaService } from '../../src/prisma/prisma.service';

const SECRET = 's'.repeat(40);

function setup(rule: AccessRule | undefined, dbUser: object | null) {
  const handler = () => undefined;
  if (rule) Reflect.defineMetadata(ACCESS_KEY, rule, handler);
  const jwt = new JwtService({ secret: SECRET });
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(dbUser) },
  } as unknown as PrismaService;
  const guard = new AccessGuard(new Reflector(), jwt, prisma);
  const run = async (authorization?: string) => {
    const req: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
    const ctx = {
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { result: await guard.canActivate(ctx), req };
  };
  const token = (typ = 'access') => jwt.sign({ sub: 'u1', typ });
  return { run, token };
}

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ALLOWED',
    (e: { response?: { code?: string } }) => e.response?.code,
  );

describe('AccessGuard', () => {
  const client = { id: 'u1', phone: '+17135550123', roles: ['CLIENT'], status: 'ACTIVE' };

  it('denies routes that declare no access rule (fail closed)', async () => {
    const { run, token } = setup(undefined, client);
    expect(await code(run(`Bearer ${token()}`))).toBe('ROUTE_ACCESS_UNDECLARED');
  });

  it('allows public routes without a token', async () => {
    const { run } = setup({ kind: 'public' }, null);
    expect(await code(run())).toBe('ALLOWED');
  });

  it('requires a bearer token on authenticated routes', async () => {
    const { run } = setup({ kind: 'authenticated' }, client);
    expect(await code(run())).toBe('UNAUTHENTICATED');
    expect(await code(run('Bearer not-a-jwt'))).toBe('TOKEN_INVALID');
  });

  it('rejects tokens of the wrong type', async () => {
    const { run, token } = setup({ kind: 'authenticated' }, client);
    expect(await code(run(`Bearer ${token('refresh')}`))).toBe('TOKEN_INVALID');
  });

  it('attaches the user loaded from the database', async () => {
    const { run, token } = setup({ kind: 'authenticated' }, client);
    const { req } = await run(`Bearer ${token()}`);
    expect(req.user).toEqual({ id: 'u1', phone: client.phone, roles: ['CLIENT'] });
  });

  it('enforces roles using the database, not the token', async () => {
    const { run, token } = setup({ kind: 'roles', roles: ['ADMIN'] }, client);
    expect(await code(run(`Bearer ${token()}`))).toBe('FORBIDDEN');
    const admin = setup(
      { kind: 'roles', roles: ['ADMIN'] },
      { ...client, roles: ['CLIENT', 'ADMIN'] },
    );
    expect(await code(admin.run(`Bearer ${admin.token()}`))).toBe('ALLOWED');
  });

  it('blocks suspended and deleted users immediately', async () => {
    const s = setup({ kind: 'authenticated' }, { ...client, status: 'SUSPENDED' });
    expect(await code(s.run(`Bearer ${s.token()}`))).toBe('ACCOUNT_SUSPENDED');
    const d = setup({ kind: 'authenticated' }, { ...client, status: 'DELETED' });
    expect(await code(d.run(`Bearer ${d.token()}`))).toBe('TOKEN_INVALID');
  });
});
