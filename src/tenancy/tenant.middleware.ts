import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Extend Express's Request type so `req.tenantId` is type-safe everywhere downstream.
declare module 'express' {
  interface Request {
    tenantId?: string;
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Phase 1 placeholder: read tenant from a header.
    // In Phase 1 we don't have real auth yet, so this lets us build and test
    // the tenancy plumbing in isolation before wiring up JWT.
    //
    // TODO (Lesson 3, when we add auth): replace this with decoding the JWT,
    // verifying its signature, and reading `tenantId` from the verified claims -
    // NEVER trust a client-supplied header for this in the real system, since
    // a malicious client could just set x-tenant-id to someone else's tenant.
    const tenantId = req.header('x-tenant-id');

    if (!tenantId) {
      throw new UnauthorizedException('Missing tenant context');
    }

    req.tenantId = tenantId;
    next();
  }
}
