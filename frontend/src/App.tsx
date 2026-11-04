import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { ToastProvider } from './components/Toast';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { PadPage } from './pages/PadPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <ToastProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors selection:bg-brand-500/20">
          <Routes>
            <Route
              path="/"
              element={
                <div className="min-h-screen flex flex-col">
                  <Navbar theme={theme} onToggleTheme={toggleTheme} />
                  <HomePage />
                </div>
              }
            />
            <Route
              path="/:pageName"
              element={<PadPage theme={theme} onToggleTheme={toggleTheme} />}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
