import { $Enums } from '@prisma/client';
import { ALL_ENUMS } from '@jiko/shared';

describe('shared enums mirror schema.prisma', () => {
  it('has the same enum names', () => {
    expect(Object.keys(ALL_ENUMS).sort()).toEqual(Object.keys($Enums).sort());
  });

  it.each(Object.keys($Enums))('%s has identical values', (name) => {
    const prismaValues = Object.values(($Enums as Record<string, Record<string, string>>)[name]!).sort();
    const sharedValues = Object.values((ALL_ENUMS as Record<string, Record<string, string>>)[name] ?? {}).sort();
    expect(sharedValues).toEqual(prismaValues);
  });
});
