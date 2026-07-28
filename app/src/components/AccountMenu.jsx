import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import {
  clearProviderKey,
  getProviderKeys,
  setProviderKey,
  subscribeProviderKeys,
} from "../lib/providerKeys.js";

export default function AccountMenu({
  open,
  onOpenChange,
  theme,
  onThemeChange,
  settingsOpen = false,
  onSettingsOpenChange,
}) {
  const { user, loading, configured, sendMagicLink, signOut } = useAuth();
  const authPopupRef = useRef(null);
  const settingsDialogRef = useRef(null);
  const settingsAnchorRef = useRef(null);
  const themeControlRef = useRef(null);
  const toastRef = useRef(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [openaiKey, setOpenaiKey] = useState(() => getProviderKeys().openai);
  const [anthropicKey, setAnthropicKey] = useState(
    () => getProviderKeys().anthropic
  );
  const [geminiKey, setGeminiKey] = useState(() => getProviderKeys().gemini);
  const [keysSaved, setKeysSaved] = useState(false);

  const setSettingsOpen = (next) => {
    onSettingsOpenChange?.(next);
  };

  useEffect(() => {
    return subscribeProviderKeys(() => {
      const keys = getProviderKeys();
      setOpenaiKey(keys.openai);
      setAnthropicKey(keys.anthropic);
      setGeminiKey(keys.gemini);
    });
  }, []);

  useEffect(() => {
    const popup = authPopupRef.current;
    if (!popup) return;
    if (open) {
      popup.anchor = settingsAnchorRef.current;
      popup.open = true;
    } else {
      popup.open = false;
    }
  }, [open]);

  useEffect(() => {
    const popup = settingsDialogRef.current;
    if (!popup) return;
    if (settingsOpen) {
      popup.anchor = settingsAnchorRef.current;
      popup.open = true;
    } else {
      popup.open = false;
    }
  }, [settingsOpen]);

  useEffect(() => {
    const control = themeControlRef.current;
    if (!control) return;
    const updateTheme = (event) => {
      const value = event.detail ?? event.target.value;
      if (value === "light" || value === "dark") onThemeChange(value);
    };
    control.addEventListener("input", updateTheme);
    return () => control.removeEventListener("input", updateTheme);
  }, [onThemeChange]);

  const close = () => {
    onOpenChange(false);
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await sendMagicLink(email.trim());
      toastRef.current?.showToast();
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

  const saveKeys = () => {
    setProviderKey("openai", openaiKey);
    setProviderKey("anthropic", anthropicKey);
    setProviderKey("gemini", geminiKey);
    setKeysSaved(true);
    window.setTimeout(() => setKeysSaved(false), 2000);
  };

  return (
    <>
      {user ? (
        <fig-menu position="top right">
          <fig-tooltip text={user.email || "Account"}>
            <fig-button
              ref={settingsAnchorRef}
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
          <fig-menu-item
            value="settings"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </fig-menu-item>
          <fig-menu-item value="sign-out" onClick={logout}>
            Sign out
          </fig-menu-item>
        </fig-menu>
      ) : (
        <fig-menu position="top right">
          <fig-tooltip text="Settings">
            <fig-button
              ref={settingsAnchorRef}
              fig-menu-trigger=""
              variant="ghost"
              icon="true"
              size="large"
              aria-label="Settings"
              disabled={loading}
            >
              <fig-icon name="settings" />
            </fig-button>
          </fig-tooltip>
          <fig-menu-item
            value="settings"
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </fig-menu-item>
          <fig-menu-item
            value="login"
            disabled={!configured}
            onClick={() => onOpenChange(true)}
          >
            Login
          </fig-menu-item>
        </fig-menu>
      )}

      <dialog
        is="fig-popup"
        ref={authPopupRef}
        class="auth-popup"
        position="top right"
        offset="8 0"
        variant="popover"
        closedby="any"
        onClose={() => onOpenChange(false)}
        onCancel={close}
      >
        <fig-header>
          <h3>Sign in to Shader Studio</h3>
        </fig-header>
        <form onSubmit={submit}>
          <fig-content>
            <fig-field direction="horizontal">
              <label>Email</label>
              <fig-input-text
                type="email"
                full=""
                value={email}
                placeholder="you@example.com"
                required
                onInput={(event) => setEmail(event.target.value)}
                dangerouslySetInnerHTML={{ __html: "" }}
              />
            </fig-field>
            {error && <p className="form-message error">{error}</p>}
          </fig-content>
          <fig-footer>
            <fig-button type="button" variant="secondary" onClick={close}>
              Cancel
            </fig-button>
            <fig-button
              type="submit"
              variant="primary"
              disabled={sending || !email.trim()}
            >
              {sending ? "Sending…" : "Send magic link"}
            </fig-button>
          </fig-footer>
        </form>
      </dialog>
      <dialog
        is="fig-toast"
        ref={toastRef}
        theme="brand"
        duration="4000"
      >
        Check your email for the sign-in link.
      </dialog>
      <dialog
        is="fig-popup"
        ref={settingsDialogRef}
        class="settings-popup"
        position="top right"
        offset="8 0"
        variant="popover"
        closedby="any"
        onClose={() => setSettingsOpen(false)}
        onCancel={() => setSettingsOpen(false)}
      >
        <fig-header>
          <h3>Settings</h3>
        </fig-header>
        <fig-content>
          <fig-field direction="horizontal">
            <label>Theme</label>
            <fig-segmented-control
              ref={themeControlRef}
              full=""
              sizing="equal"
              value={theme}
            >
              <fig-segment
                value="light"
                selected={theme === "light"}
                aria-label="Light theme"
              >
                <fig-icon name="sun" />
              </fig-segment>
              <fig-segment
                value="dark"
                selected={theme === "dark"}
                aria-label="Dark theme"
              >
                <fig-icon name="moon" />
              </fig-segment>
            </fig-segmented-control>
          </fig-field>

          <div className="settings-keys">
            <h4>AI API keys</h4>
            <p className="settings-keys-note">
              Keys stay on this device and are sent only to the chat proxy when
              you message. They are never stored in Supabase.
            </p>
            <fig-field>
              <label>OpenAI</label>
              <fig-input-text
                type="password"
                full=""
                value={openaiKey}
                placeholder="sk-…"
                autocomplete="off"
                onInput={(event) => setOpenaiKey(event.target.value)}
                dangerouslySetInnerHTML={{ __html: "" }}
              />
            </fig-field>
            <fig-field>
              <label>Anthropic</label>
              <fig-input-text
                type="password"
                full=""
                value={anthropicKey}
                placeholder="sk-ant-…"
                autocomplete="off"
                onInput={(event) => setAnthropicKey(event.target.value)}
                dangerouslySetInnerHTML={{ __html: "" }}
              />
            </fig-field>
            <fig-field>
              <label>Gemini</label>
              <fig-input-text
                type="password"
                full=""
                value={geminiKey}
                placeholder="AIza…"
                autocomplete="off"
                onInput={(event) => setGeminiKey(event.target.value)}
                dangerouslySetInnerHTML={{ __html: "" }}
              />
            </fig-field>
          </div>
        </fig-content>
        <fig-footer>
          <fig-button
            type="button"
            variant="ghost"
            onClick={() => {
              clearProviderKey("openai");
              clearProviderKey("anthropic");
              clearProviderKey("gemini");
              setOpenaiKey("");
              setAnthropicKey("");
              setGeminiKey("");
            }}
          >
            Clear keys
          </fig-button>
          <fig-button type="button" variant="primary" onClick={saveKeys}>
            {keysSaved ? "Saved" : "Save keys"}
          </fig-button>
        </fig-footer>
      </dialog>
    </>
  );
}
