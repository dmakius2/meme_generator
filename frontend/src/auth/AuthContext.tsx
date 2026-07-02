import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CognitoUser,
  CognitoUserPool,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';
import type { CognitoUserSession } from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
});

interface AuthContextValue {
  email: string | null;
  idToken: string | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  forgotPassword: (email: string) => Promise<void>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      setLoading(false);
      return;
    }
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (!err && session) {
        setIdToken(session.getIdToken().getJwtToken());
        setEmail(currentUser.getUsername());
      }
      setLoading(false);
    });
  }, []);

  function signUp(emailInput: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      userPool.signUp(
        emailInput,
        password,
        [new CognitoUserAttribute({ Name: 'email', Value: emailInput })],
        [],
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  function confirmSignUp(emailInput: string, code: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: emailInput, Pool: userPool });
      user.confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
    });
  }

  function login(emailInput: string, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: emailInput, Pool: userPool });
      const authDetails = new AuthenticationDetails({ Username: emailInput, Password: password });
      user.authenticateUser(authDetails, {
        onSuccess: (session) => {
          setIdToken(session.getIdToken().getJwtToken());
          setEmail(emailInput);
          resolve();
        },
        onFailure: (err) => reject(err),
      });
    });
  }

  function logout() {
    userPool.getCurrentUser()?.signOut();
    setIdToken(null);
    setEmail(null);
  }

  function forgotPassword(emailInput: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: emailInput, Pool: userPool });
      user.forgotPassword({
        onSuccess: () => resolve(),
        onFailure: (err) => reject(err),
      });
    });
  }

  function confirmForgotPassword(emailInput: string, code: string, newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const user = new CognitoUser({ Username: emailInput, Pool: userPool });
      user.confirmPassword(code, newPassword, {
        onSuccess: () => resolve(),
        onFailure: (err) => reject(err),
      });
    });
  }

  return (
    <AuthContext.Provider
      value={{ email, idToken, loading, signUp, confirmSignUp, login, logout, forgotPassword, confirmForgotPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
