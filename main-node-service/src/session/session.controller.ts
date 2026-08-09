import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';

/**
 * Active-router session endpoints (monolith parity).
 *
 * The monolith's `session.controller.ts` mounted `api/session` with:
 *   GET  /api/session/active  → { authenticated, username, activeRouter }
 *   POST /api/session/router  → set req.session.activeRouter = body.sessionId
 *
 * These are strictly BFF-local (they read/write the cookie session), so they
 * are handled here rather than proxied to a downstream service.
 */
@Controller('api/session')
export class SessionController {
  @Get('active')
  getActive(@Req() req: Request) {
    const session = (req as any).session || {};
    return {
      authenticated: !!session['mikhmon.jwt'] && !!session.user,
      username: session.user?.username || null,
      activeRouter: session.activeRouter || null,
    };
  }

  @Post('router')
  setActiveRouter(@Req() req: Request, @Body() body: { sessionId: string }) {
    const session = (req as any).session;
    session.activeRouter = body?.sessionId || null;
    return { success: true, activeRouter: session.activeRouter };
  }
}
