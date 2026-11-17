import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_UPLOAD_BYTES } from '@jiko/shared';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/access.decorators';
import { AppException } from '../../common/http/app-exception';
import { LocalStorageDriver, type DownloadClaims, type UploadClaims } from './local.driver';
import { STORAGE_DRIVER, type StorageDriver } from './storage.driver';

/**
 * Stand-in for S3 when STORAGE_DRIVER=local. Access is authorised by the signed token, the same
 * way S3 authorises a presigned URL, so the routes are public.
 */
@Controller('files')
@Public()
export class LocalStorageController {
  constructor(@Inject(STORAGE_DRIVER) private readonly storage: StorageDriver) {}

  private local(): LocalStorageDriver {
    if (!(this.storage instanceof LocalStorageDriver)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    }
    return this.storage;
  }

  @Post('local-upload')
  @HttpCode(204)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(
    @Body('token') token: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const local = this.local();
    const claims = local.verify<UploadClaims>(token ?? '', 'up');
    if (!claims)
      throw new AppException(HttpStatus.FORBIDDEN, 'UPLOAD_TOKEN_INVALID', 'Upload link expired');
    if (!file) throw new AppException(HttpStatus.BAD_REQUEST, 'FILE_MISSING', 'No file received');
    if (file.size > claims.max)
      throw new AppException(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', 'File is too large');
    if (file.mimetype !== claims.m)
      throw new AppException(HttpStatus.BAD_REQUEST, 'FILE_TYPE_MISMATCH', 'Unexpected file type');
    await local.write(claims.b, claims.k, file.buffer, file.mimetype);
  }

  @Get('local/:token')
  async download(@Param('token') token: string, @Res() res: Response) {
    const local = this.local();
    const claims = local.verify<DownloadClaims>(token, 'down');
    if (!claims) throw new AppException(HttpStatus.FORBIDDEN, 'URL_EXPIRED', 'Link expired');
    const obj = await local.read(claims.b, claims.k);
    if (!obj) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    res.setHeader('content-type', obj.contentType);
    res.setHeader('cache-control', 'private, max-age=300');
    res.send(obj.data);
  }
}
