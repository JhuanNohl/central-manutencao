import '@central/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { GuestOnly, RequireAuth, RequirePermission } from './auth/guards';
import { AppLayout } from './layouts/AppLayout';
import { AccountPage } from './pages/AccountPage';
import { AccountsPage } from './pages/admin/AccountsPage';
import { InvitationsPage } from './pages/admin/InvitationsPage';
import { NotificationsPage } from './pages/admin/NotificationsPage';
import { AcceptInvitationPage } from './pages/auth/AcceptInvitationPage';
import { ConfirmEmailPage } from './pages/auth/ConfirmEmailPage';
import { LoginPage } from './pages/auth/LoginPage';
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from './pages/auth/PasswordPages';
import { RegisterPage } from './pages/auth/RegisterPage';
import { CustomerDetailPage } from './pages/customers/CustomerDetailPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { HomePage } from './pages/HomePage';
import { MobileUploadPage } from './pages/mobile/MobileUploadPage';
import { MyRmasPage } from './pages/portal/MyRmasPage';
import { NewRmaPage } from './pages/portal/NewRmaPage';
import { PortalRmaDetailPage } from './pages/portal/PortalRmaDetailPage';
import { NewStaffRmaPage } from './pages/rmas/NewStaffRmaPage';
import { RmaDetailPage } from './pages/rmas/RmaDetailPage';
import { RmasPage } from './pages/rmas/RmasPage';
import { NotFoundPage } from './pages/NotFoundPage';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/share-tech/400.css';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Erros de autorização/validação não melhoram com nova tentativa.
      retry: (failures, error) =>
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) && failures < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/entrar',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: '/cadastro',
    element: (
      <GuestOnly>
        <RegisterPage />
      </GuestOnly>
    ),
  },
  { path: '/esqueci-senha', element: <ForgotPasswordPage /> },
  { path: '/redefinir-senha', element: <ResetPasswordPage /> },
  { path: '/confirmar-email', element: <ConfirmEmailPage /> },
  { path: '/convite', element: <AcceptInvitationPage /> },
  // Aberta pelo QR Code no celular, sem login: o token do link basta.
  { path: '/enviar', element: <MobileUploadPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'conta', element: <AccountPage /> },
      {
        path: 'atendimentos',
        element: (
          <RequirePermission permission="rma.own.read">
            <MyRmasPage />
          </RequirePermission>
        ),
      },
      {
        path: 'atendimentos/novo',
        element: (
          <RequirePermission permission="rma.own.create">
            <NewRmaPage />
          </RequirePermission>
        ),
      },
      {
        path: 'atendimentos/:number',
        element: (
          <RequirePermission permission="rma.own.read">
            <PortalRmaDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'chamados',
        element: (
          <RequirePermission permission="rma.read">
            <RmasPage />
          </RequirePermission>
        ),
      },
      {
        path: 'chamados/novo',
        element: (
          <RequirePermission permission="rma.write">
            <NewStaffRmaPage />
          </RequirePermission>
        ),
      },
      {
        path: 'chamados/:number',
        element: (
          <RequirePermission permission="rma.read">
            <RmaDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'clientes',
        element: (
          <RequirePermission permission="customers.read">
            <CustomersPage />
          </RequirePermission>
        ),
      },
      {
        path: 'clientes/:id',
        element: (
          <RequirePermission permission="customers.read">
            <CustomerDetailPage />
          </RequirePermission>
        ),
      },
      {
        path: 'admin/contas',
        element: (
          <RequirePermission permission="accounts.read">
            <AccountsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'admin/convites',
        element: (
          <RequirePermission permission="accounts.manage">
            <InvitationsPage />
          </RequirePermission>
        ),
      },
      {
        path: 'admin/avisos',
        element: (
          <RequirePermission permission="notifications.manage">
            <NotificationsPage />
          </RequirePermission>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
