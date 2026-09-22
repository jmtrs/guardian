import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { AUTH_INSTANCE } from './auth.constants';
import type { Auth, AuthSessionUser } from './auth.config';

export type AuthenticatedRequest = Request & {
  user?: AuthSessionUser;
};

@Injectable()
export class BetterAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value !== undefined) {
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }
    const session = await this.auth.api.getSession({ headers });
    if (!session) {
      throw new UnauthorizedException();
    }
    req.user = session.user;
    return true;
  }
}
