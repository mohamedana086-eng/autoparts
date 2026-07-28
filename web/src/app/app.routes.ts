import { Routes } from '@angular/router';

// Pages are lazily loaded so the initial bundle stays small.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  { path: 'search', loadComponent: () => import('./pages/search.page').then((m) => m.SearchPage) },
  { path: 'product/:id', loadComponent: () => import('./pages/product.page').then((m) => m.ProductPage) },
  { path: 'cart', loadComponent: () => import('./pages/cart.page').then((m) => m.CartPage) },
  { path: 'login', loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage) },
  { path: 'register', loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage) },
  { path: '**', redirectTo: '' },
];
