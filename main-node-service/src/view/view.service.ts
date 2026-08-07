import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';

/**
 * Provides view-model data for the Eta templates. Keeps controllers thin
 * and centralizes the shape of data passed to the UI.
 */
@Injectable()
export class ViewService {
  constructor(private readonly authService: AuthService) {}

  /** Base context shared by every page render. */
  async baseContext(session: any): Promise<Record<string, any>> {
    const user = this.authService.getUser(session);
    return {
      title: 'NODEMON - Dashboard',
      username: user?.username || 'Admin',
      userInitials: (user?.name || user?.username || 'A').slice(0, 1).toUpperCase(),
      pageTitle: 'Dashboard Utama',
      revenueToday: 'Rp 0',
      activeUsers: 0,
      user: user || null,
      authenticated: this.authService.isAuthenticated(session),
    };
  }
}
