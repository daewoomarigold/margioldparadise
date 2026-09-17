// Shown by both TeacherDashboard.jsx and IslandView.jsx whenever useAuth's
// session is null (signed out) — the island requires sign-in too, same
// account as the dashboard, rather than a public/unauthenticated read
// path (see CLAUDE.md's Database section for why). Inline-styled (not
// teacher.css) so it doesn't depend on either page's own stylesheet/root
// class — this can render before either page's real layout does.
export default function LoginScreen({ onSignIn, error }) {
  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        background: '#0e0e1a',
        color: '#e0e0f0',
        fontFamily: 'ui-monospace, monospace',
        padding: 24,
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 15, letterSpacing: 1, color: '#ffe066' }}>★ MARIGOLD PARADISE</div>
      <div style={{ fontSize: 12, color: '#7070a0', maxWidth: 320 }}>Sign in to view or manage your classes.</div>
      <button
        onClick={onSignIn}
        style={{
          background: '#1a1a2e',
          border: '1px solid #4a4a7a',
          color: '#e0e0f0',
          fontFamily: 'inherit',
          fontSize: 13,
          padding: '10px 20px',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      >
        Sign in with Google
      </button>
      {error && <div style={{ fontSize: 11, color: '#ff6b6b', maxWidth: 320 }}>{error}</div>}
    </div>
  );
}
