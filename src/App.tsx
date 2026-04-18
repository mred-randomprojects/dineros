import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Loader2, CloudUpload } from "lucide-react";
import { useAppData } from "./useAppData";
import { AuthProvider, useAuth } from "./auth";
import { NavBar } from "./components/NavBar";
import { Accounts } from "./components/Accounts";
import { Transactions } from "./components/Transactions";
import { LoginPage } from "./components/LoginPage";

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user == null) {
    return <LoginPage />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const appData = useAppData();
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.target.isContentEditable) return;
        if (e.target.closest('[role="dialog"]') != null) return;
      }

      if (e.key === "1") {
        navigate("/accounts");
      } else if (e.key === "2") {
        navigate("/transactions");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  return (
    <div className="mx-auto min-h-dvh max-w-lg pb-20">
      <Routes>
        <Route path="/" element={<Navigate to="/accounts" replace />} />
        <Route path="/accounts" element={<Accounts appData={appData} />} />
        <Route
          path="/transactions"
          element={<Transactions appData={appData} />}
        />
      </Routes>

      {appData.storageError != null && (
        <div className="fixed left-0 right-0 top-0 z-50 bg-destructive p-3 text-center text-sm text-destructive-foreground">
          {appData.storageError}
          <button
            className="ml-2 underline"
            onClick={() => appData.setStorageError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <button
        onClick={appData.forceCloudSync}
        disabled={appData.cloudSyncing}
        className="fixed bottom-20 right-3 z-40 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg active:scale-95 disabled:opacity-50"
      >
        {appData.cloudSyncing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CloudUpload className="h-3.5 w-3.5" />
        )}
        Sync
      </button>

      <NavBar />
    </div>
  );
}
