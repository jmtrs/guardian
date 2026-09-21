import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { AUTH_INSTANCE } from './auth.constants';
import type { Auth } from './auth.config';

/**
 * better-auth es framework-agnostic: su handler habla Web API (fetch Request).
 * Nest ya parsea el body JSON, asi que reconstruimos un Request Web a partir
 * del req de Express y delegamos. Sin toNodeHandler = sin conflicto de stream.
 */
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  @All('*path')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const url = `http://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    let body: string | undefined;
    if (req.body !== undefined && Object.keys(req.body).length > 0) {
      body = JSON.stringify(req.body);
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }

    const webRequest = new Request(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : (body ?? null),
    });

    const response = await this.auth.handler(webRequest);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key !== 'content-encoding' && key !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    const responseBody = await response.text();
    res.send(responseBody === '' ? undefined : responseBody);
  }
}
