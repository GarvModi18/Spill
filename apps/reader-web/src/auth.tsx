import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export interface ReaderUser {
  id: string;
  name: string;
  email: string;
  role: "reader" | "admin";
  emailPreferences: { teaUpdates: boolean; productUpdates: boolean };
  createdAt: string;
}

interface AuthContextValue {
  user: ReaderUser | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  setUser(user: ReaderUser): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ReaderUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: ReaderUser }>("/users/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      setUser,
      async signIn(email, password) {
        const result = await api<{ user: ReaderUser }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setUser(result.user);
      },
      async signUp(name, email, password) {
        const result = await api<{ user: ReaderUser }>("/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password }),
        });
        setUser(result.user);
      },
      async signOut() {
        await api<void>("/auth/logout", { method: "POST" });
        setUser(null);
      },
    }),
    [loading, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
