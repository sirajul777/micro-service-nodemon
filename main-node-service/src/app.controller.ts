import { Controller, Get, Render, Req } from '@nestjs/common';
import { Request } from 'express';
import { ViewService } from './view/view.service';

/**
 * Renders the SPA-like Eta dashboard (views/index.eta). The index template
 * includes the login wrapper, sidebar, topbar, and all page sections; the
 * frontend (assets/app.js) drives the SPA behavior and calls the /api/*
 * proxy endpoints.
 */
@Controller()
export class AppController {
  constructor(private readonly viewService: ViewService) {}

  @Get()
  @Render('index')
  async getDashboard(@Req() req: Request) {
    return this.viewService.baseContext((req as any).session);
  }
}
