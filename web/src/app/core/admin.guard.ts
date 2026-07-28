import { inject } from '@angular/core';
import { Router, type CanMatchFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Keeps non-admins out of the admin UI.
 *
 * This is a convenience only — it decides what to render, not what is
 * allowed. Every /api/admin endpoint enforces the same rule server-side,
 * which is what actually protects the data.
 */
export const adminGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loaded()) await auth.refresh();

  if (auth.isAdmin()) return true;
  return router.createUrlTree([auth.isLoggedIn() ? '/' : '/login']);
};
