import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, type AdminUser } from "./api";

interface AuthState {
  user: AdminUser | null;
  loading: boolean;
  denied: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  async function checkAdmin() {
    try {
      const result = await api<{ user: AdminUser }>("/admin/me");
      setUser(result.user);
      setDenied(false);
    } catch (error) {
      setUser(null);
      setDenied(error instanceof Error && "status" in error && error.status === 403);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkAdmin();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      denied,
      async signIn(email, password) {
        await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        const result = await api<{ user: AdminUser }>("/admin/me");
        setUser(result.user);
        setDenied(false);
      },
      async signOut() {
        await api<void>("/auth/logout", { method: "POST" });
        setUser(null);
        setDenied(false);
      },
    }),
    [denied, loading, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
