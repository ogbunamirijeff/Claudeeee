import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller';
import { AdminUsersController } from './admin-users.controller';

@Module({ controllers: [AdminUsersController, AdminAuditController] })
export class AdminModule {}
