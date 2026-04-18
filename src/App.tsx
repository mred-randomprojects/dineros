import { Routes, Route, Navigate } from "react-router-dom";
import { useAppData } from "./useAppData";
import { NavBar } from "./components/NavBar";
import { Accounts } from "./components/Accounts";
import { Transactions } from "./components/Transactions";

export default function App() {
  const appData = useAppData();

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

      <NavBar />
    </div>
  );
}
