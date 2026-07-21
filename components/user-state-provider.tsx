"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getClientUserState, type ClientUserState } from "@/lib/auth/client";

const UserStateContext = createContext<ClientUserState | null>(null);

export function UserStateProvider({ children }: { children: ReactNode }) {
  const [userState, setUserState] = useState<ClientUserState | null>(null);

  useEffect(() => {
    let active = true;

    void getClientUserState()
      .then((state) => {
        if (active) {
          setUserState(state);
        }
      })
      .catch(() => {
        if (active) {
          setUserState(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <UserStateContext.Provider value={userState}>
      {children}
    </UserStateContext.Provider>
  );
}

export function useUserState() {
  return useContext(UserStateContext);
}
