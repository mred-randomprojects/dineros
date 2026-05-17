import { useLocation, useNavigate } from "react-router-dom";
import { Wallet, ArrowLeftRight, Tags } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/accounts", label: "Accounts", shortcut: "1", icon: Wallet },
  {
    path: "/transactions",
    label: "Transactions",
    shortcut: "2",
    icon: ArrowLeftRight,
  },
  { path: "/categories", label: "Categories", shortcut: "3", icon: Tags },
] as const;

export function NavBar() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur-sm">
      <div className="mx-auto flex max-w-lg items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.path ||
            location.pathname.startsWith(item.path + "/");
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              aria-label={`${item.label} (${item.shortcut})`}
              aria-keyshortcuts={item.shortcut}
              title={`${item.label} (${item.shortcut})`}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="flex items-baseline gap-1">
                <span>{item.label}</span>
                <span className="text-[10px] leading-none opacity-70">
                  {item.shortcut}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
