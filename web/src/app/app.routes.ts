import { Routes } from '@angular/router';
import { adminGuard } from './core/admin.guard';

// Pages are lazily loaded so the initial bundle stays small.
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home.page').then((m) => m.HomePage) },
  { path: 'search', loadComponent: () => import('./pages/search.page').then((m) => m.SearchPage) },
  { path: 'bulk', loadComponent: () => import('./pages/bulk.page').then((m) => m.BulkPage) },
  { path: 'suppliers', loadComponent: () => import('./pages/suppliers.page').then((m) => m.SuppliersPage) },
  { path: 'supplier/:slug', loadComponent: () => import('./pages/supplier.page').then((m) => m.SupplierPage) },
  { path: 'product/:id', loadComponent: () => import('./pages/product.page').then((m) => m.ProductPage) },
  { path: 'cart', loadComponent: () => import('./pages/cart.page').then((m) => m.CartPage) },
  { path: 'orders', loadComponent: () => import('./pages/orders.page').then((m) => m.OrdersPage) },
  { path: 'login', loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage) },
  { path: 'register', loadComponent: () => import('./pages/register.page').then((m) => m.RegisterPage) },
  {
    path: 'admin',
    canMatch: [adminGuard],
    loadComponent: () => import('./admin/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', loadComponent: () => import('./admin/dashboard.page').then((m) => m.AdminDashboardPage) },
      { path: 'products', loadComponent: () => import('./admin/products.page').then((m) => m.AdminProductsPage) },
      { path: 'clients', loadComponent: () => import('./admin/clients.page').then((m) => m.AdminClientsPage) },
      {
        path: 'suppliers',
        loadComponent: () => import('./admin/suppliers.page').then((m) => m.AdminSuppliersPage),
      },
      {
        path: 'warehouses',
        loadComponent: () => import('./admin/warehouses.page').then((m) => m.AdminWarehousesPage),
      },
      {
        path: 'outlets',
        loadComponent: () => import('./admin/outlets.page').then((m) => m.AdminOutletsPage),
      },
      { path: 'carts', loadComponent: () => import('./admin/carts.page').then((m) => m.AdminCartsPage) },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./admin/notifications.page').then((m) => m.AdminNotificationsPage),
      },
      {
        path: 'client-categories',
        loadComponent: () => import('./admin/client-categories.page').then((m) => m.AdminClientCategoriesPage),
      },
      {
        path: 'currencies',
        loadComponent: () => import('./admin/currencies.page').then((m) => m.AdminCurrenciesPage),
      },
      {
        path: 'markup-rules',
        loadComponent: () => import('./admin/markup-rules.page').then((m) => m.AdminMarkupRulesPage),
      },
      { path: 'orders', loadComponent: () => import('./admin/orders.page').then((m) => m.AdminOrdersPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
