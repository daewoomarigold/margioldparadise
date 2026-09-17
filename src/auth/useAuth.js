// Shared auth hook — used by both TeacherDashboard.jsx and IslandView.jsx
// (see LoginScreen.jsx, shown by both when there's no session) so the
// same login gate/state logic isn't duplicated across the two pages.
import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient.js';

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = not checked yet, null = signed out, object = signed in
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (err) setError(err.message);
      setSession(data.session);
    });

    // Fires on sign-in, sign-out, and token refresh — keeps `session` (and
    // therefore both pages' gate) live without a reload.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  function signInWithGoogle() {
    setError('');
    supabase.auth.signInWithOAuth({ provider: 'google' }).then(({ error: err }) => {
      if (err) setError(err.message);
    });
  }

  function signOut() {
    supabase.auth.signOut();
  }

  return {
    session,
    loading: session === undefined,
    error,
    signInWithGoogle,
    signOut,
  };
}
