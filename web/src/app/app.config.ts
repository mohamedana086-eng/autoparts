import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // Requests go to /api on the same origin — the dev server proxies them to
    // the Next.js API, so the session cookie stays first-party and is sent
    // automatically without needing CORS or withCredentials.
    provideHttpClient(withFetch()),
  ],
};
