import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function AccountMenu({ open, onOpenChange }) {
  const { user, loading, configured, sendMagicLink, signOut } = useAuth();
  const dialogRef = useRef(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    onOpenChange(false);
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    setMessage("");
    try {
      await sendMagicLink(email.trim());
      setMessage("Check your email for the sign-in link.");
    } catch (authError) {
      setError(authError.message || String(authError));
    } finally {
      setSending(false);
    }
  };

  const logout = async () => {
    try {
      await signOut();
    } catch (authError) {
      setError(authError.message || String(authError));
      onOpenChange(true);
    }
  };

  return (
    <>
      {user ? (
        <fig-menu position="top right">
          <fig-tooltip text={user.email || "Account"} delay="0">
            <fig-button
              fig-menu-trigger=""
              variant="ghost"
              icon="true"
              size="large"
              aria-label="Account"
            >
              <span className="account-avatar">
                {(user.email || "?").slice(0, 1).toUpperCase()}
              </span>
            </fig-button>
          </fig-tooltip>
          <fig-menu-label>{user.email}</fig-menu-label>
          <fig-menu-item value="sign-out" onClick={logout}>
            Sign out
          </fig-menu-item>
        </fig-menu>
      ) : (
        <fig-tooltip
          text={configured ? "Sign in" : "Supabase is not configured"}
          delay="0"
        >
          <fig-button
            variant="ghost"
            icon="true"
            size="large"
            aria-label="Sign in"
            disabled={loading || !configured}
            onClick={() => onOpenChange(true)}
          >
            <span className="account-avatar">?</span>
          </fig-button>
        </fig-tooltip>
      )}

      <dialog
        is="fig-dialog"
        ref={dialogRef}
        className="auth-dialog"
        onClose={() => onOpenChange(false)}
        onCancel={close}
      >
        <form onSubmit={submit}>
          <fig-header>
            <h2>Sign in to Shader Studio</h2>
            <fig-button
              type="button"
              variant="ghost"
              icon="true"
              aria-label="Close"
              onClick={close}
            >
              <fig-icon name="close" />
            </fig-button>
          </fig-header>
          <div className="auth-dialog-content">
            <p>Save shaders, upload inputs, and share public previews.</p>
            <fig-field label="Email">
              <fig-input-text
                type="email"
                value={email}
                placeholder="you@example.com"
                required
                onInput={(event) => setEmail(event.target.value)}
                dangerouslySetInnerHTML={{ __html: "" }}
              />
            </fig-field>
            {message && <p className="form-message success">{message}</p>}
            {error && <p className="form-message error">{error}</p>}
          </div>
          <fig-footer>
            <fig-button type="button" variant="secondary" onClick={close}>
              Cancel
            </fig-button>
            <fig-button
              type="submit"
              variant="primary"
              disabled={sending || !email.trim()}
              onClick={submit}
            >
              {sending ? "Sending…" : "Send magic link"}
            </fig-button>
          </fig-footer>
        </form>
      </dialog>
    </>
  );
}
