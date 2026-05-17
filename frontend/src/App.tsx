import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setUnauthorizedHandler } from './api/client';
import { AuthGate } from './components/AuthGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastHost } from './components/Toast';
import { SetupPage } from './pages/Setup';
import { LoginPage } from './pages/Login';
import { KBListPage } from './pages/KBList';
import { DocumentListPage } from './pages/DocumentList';
import { RetrieveTestPage } from './pages/RetrieveTest';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function UnauthorizedBridge() {
  const nav = useNavigate();
  useEffect(() => {
    setUnauthorizedHandler(() => nav('/login', { replace: true }));
  }, [nav]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <UnauthorizedBridge />
          <Routes>
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<AuthGate><KBListPage /></AuthGate>} />
            <Route path="/kb/:id" element={<AuthGate><DocumentListPage /></AuthGate>} />
            <Route path="/kb/:id/retrieve" element={<AuthGate><RetrieveTestPage /></AuthGate>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <ToastHost />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
