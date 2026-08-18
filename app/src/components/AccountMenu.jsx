import { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext.jsx";
import {
  getProviderKeys,
  setProviderKey,
  subscribeProviderKeys,
} from "../lib/providerKeys.js";
import {
  getFigmaAccessToken,
  subscribeFigmaAccessToken,
} from "../lib/figmaAccessToken.js";
import { FIGMA_LIBRARY_UI_ENABLED } from "../lib/figmaLibraryUi.js";
import {
  beginFigmaOAuth,
  disconnectFigma,
  testFigmaConnection,
} from "../services/figmaShaders.js";
import { getProfile, saveProfile } from "../services/shaders.js";
import {
  readPreviewPixelRatioMode,
  subscribePreviewPixelRatioMode,
  writePreviewPixelRatioMode,
} from "../runtime/dpi.js";

function accountDisplayName(user) {
  return (
    user?.user_metadata?.user_name ||
    user?.user_metadata?.preferred_username ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    ""
  );
}

export default function AccountMenu({
  open,
  onOpenChange,
  theme,
  onThemeChange,
  canvasTheme,
  onCanvasThemeChange,
  settingsOpen = false,
  onSettingsOpenChange,
  onProfileChange,
}) {
  const {
    user,
    loading,
    configured,
    signInWithFigma,
    signInWithGitHub,
    signOut,
  } = useAuth();
  const authPopupRef = useRef(null);
  const settingsDialogRef = useRef(null);
  const settingsAnchorRef = useRef(null);
  const themeControlRef = useRef(null);
  const pixelRatioControlRef = useRef(null);
  const canvasThemeControlRef = useRef(null);
  const [sending, setSending] = useState(
    /** @type {"" | "figma" | "github"} */ ("")
  );
  const [error, setError] = useState("");
  const [openaiKey, setOpenaiKey] = useState(() => getProviderKeys().openai);
  const [anthropicKey, setAnthropicKey] = useState(
    () => getProviderKeys().anthropic
  );
  const [geminiKey, setGeminiKey] = useState(() => getProviderKeys().gemini);
  const [pixelRatioMode, setPixelRatioMode] = useState(
    readPreviewPixelRatioMode
  );
  const [figmaConnected, setFigmaConnected] = useState(
    () => Boolean(getFigmaAccessToken())
  );
  const [figmaTestState, setFigmaTestState] = useState(
    /** @type {"idle" | "testing" | "ok" | "error"} */ ("idle")
  );
  const [figmaTestMessage, setFigmaTestMessage] = useState("");
  const [displayName, setDisplayName] = useState(() =>
    accountDisplayName(user)
  );
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

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

  useEffect(
    () => subscribePreviewPixelRatioMode(setPixelRatioMode),
    []
  );

  useEffect(() => {
    if (!FIGMA_LIBRARY_UI_ENABLED) return undefined;
    return subscribeFigmaAccessToken(() => {
      setFigmaConnected(Boolean(getFigmaAccessToken()));
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setDisplayName("");
      return;
    }
    let cancelled = false;
    setDisplayName(accountDisplayName(user));
    getProfile(user.id)
      .then((profile) => {
        if (!cancelled && profile?.display_name) {
          setDisplayName(profile.display_name);
        }
      })
      .catch((profileError) => {
        if (!cancelled) {
          setSettingsError(profileError.message || String(profileError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  useEffect(() => {
    const control = pixelRatioControlRef.current;
    if (!control) return;
    const updatePixelRatio = (event) => {
      const detail = event.detail;
      const value =
        detail && typeof detail === "object" && "value" in detail
          ? detail.value
          : (detail ?? event.target.value);
      writePreviewPixelRatioMode(value);
    };
    control.addEventListener("input", updatePixelRatio);
    return () => control.removeEventListener("input", updatePixelRatio);
  }, []);

  useEffect(() => {
    const control = canvasThemeControlRef.current;
    if (!control) return;
    const updateCanvasTheme = (event) => {
      const value = event.detail ?? event.target.value;
      if (value === "light" || value === "dark") {
        onCanvasThemeChange?.(value);
      }
    };
    control.addEventListener("input", updateCanvasTheme);
    return () => control.removeEventListener("input", updateCanvasTheme);
  }, [onCanvasThemeChange]);

  const close = () => {
    onOpenChange(false);
    setError("");
  };

  const signIn = async (provider) => {
    setSending(provider);
    setError("");
    try {
      if (provider === "figma") await signInWithFigma();
      else await signInWithGitHub();
    } catch (authError) {
      setError(authError.message || String(authError));
      setSending("");
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

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError("");
    try {
      if (user) {
        const name = displayName.trim();
        if (!name) throw new Error("Display name is required.");
        const profile = await saveProfile(user.id, name);
        setDisplayName(profile.display_name);
        onProfileChange?.(profile.display_name);
      }
      setProviderKey("openai", openaiKey);
      setProviderKey("anthropic", anthropicKey);
      setProviderKey("gemini", geminiKey);
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 2000);
    } catch (saveError) {
      setSettingsError(saveError.message || String(saveError));
    } finally {
      setSettingsSaving(false);
    }
  };

  const connectFigma = async () => {
    setFigmaTestState("testing");
    setFigmaTestMessage("");
    try {
      await beginFigmaOAuth();
    } catch (oauthError) {
      setFigmaTestState("error");
      setFigmaTestMessage(oauthError.message || String(oauthError));
    }
  };

  const testFigma = async () => {
    setFigmaTestState("testing");
    setFigmaTestMessage("");
    try {
      await testFigmaConnection();
      setFigmaTestState("ok");
      setFigmaTestMessage("Figma MCP connection verified.");
    } catch (testError) {
      setFigmaTestState("error");
      setFigmaTestMessage(testError.message || String(testError));
    }
  };

  const removeFigmaConnection = () => {
    disconnectFigma();
    setFigmaConnected(false);
    setFigmaTestState("idle");
    setFigmaTestMessage("Figma disconnected from this device.");
  };

  // fig-menu relocates items into its popup. Remount on auth changes so React
  // never tries to reconcile nodes that FigUI has already moved.
  const menuKey = user ? "signed-in" : "signed-out";

  return (
    <>
      <fig-menu key={menuKey} position="bottom right">
        <fig-tooltip text={user ? user.email || "Account" : "Settings"}>
          <fig-button
            ref={settingsAnchorRef}
            fig-menu-trigger=""
            variant="ghost"
            icon="true"
            aria-label={user ? "Account" : "Settings"}
            disabled={!user && loading ? "" : undefined}
          >
            {user ? (
              <fig-avatar
                class="account-avatar"
                src={
                  user.user_metadata?.avatar_url ||
                  user.user_metadata?.picture ||
                  ""
                }
                name={
                  displayName ||
                  accountDisplayName(user) ||
                  user.email ||
                  "Account"
                }
              />
            ) : (
              <fig-icon name="settings" />
            )}
          </fig-button>
        </fig-tooltip>
        {user ? (
          <>
            <fig-menu-item
              value="settings"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </fig-menu-item>
            <fig-menu-item value="sign-out" onClick={logout}>
              Sign out
            </fig-menu-item>
          </>
        ) : (
          <>
            <fig-menu-item
              value="settings"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </fig-menu-item>
            <fig-menu-item
              value="login"
              disabled={!configured ? "" : undefined}
              onClick={() => onOpenChange(true)}
            >
              Sign in
            </fig-menu-item>
          </>
        )}
      </fig-menu>

      <dialog
        is="fig-popup"
        ref={authPopupRef}
        class="auth-popup"
        position="bottom right"
        offset="8 0"
        variant="popover"
        theme="menu"
        closedby="any"
        onClose={() => onOpenChange(false)}
        onCancel={close}
      >
        <fig-header>
          <h3>Sign in</h3>
        </fig-header>
        <fig-content>
          <p>
            Use a Figma or GitHub account with a verified @figma.com email.
          </p>
          {error && <p className="form-message error">{error}</p>}
        </fig-content>
        <fig-footer borderless="">
          <fig-button
            type="button"
            variant="primary"
            disabled={sending || !configured ? "" : undefined}
            onClick={() => {
              signIn("figma").catch(() => {});
            }}
          >
            {sending === "figma" ? "Connecting…" : "Sign in with Figma"}
          </fig-button>
          <fig-button
            type="button"
            variant="secondary"
            disabled={sending || !configured ? "" : undefined}
            onClick={() => {
              signIn("github").catch(() => {});
            }}
          >
            {sending === "github" ? "Connecting…" : "Sign in with GitHub"}
          </fig-button>
        </fig-footer>
      </dialog>
      <dialog
        is="fig-popup"
        ref={settingsDialogRef}
        class="settings-popup"
        position="bottom right"
        offset="8 0"
        variant="popover"
        theme="menu"
        closedby="any"
        onClose={() => setSettingsOpen(false)}
        onCancel={() => setSettingsOpen(false)}
      >
        <fig-header>
          <h3>Settings</h3>
        </fig-header>
        <fig-content>
          <fig-group name="App" collapsible="" open="">
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
                >
                  Light
                </fig-segment>
                <fig-segment
                  value="dark"
                  selected={theme === "dark"}
                >
                  Dark
                </fig-segment>
              </fig-segmented-control>
            </fig-field>
            <fig-field direction="horizontal">
              <label>Pixel ratio</label>
              <fig-segmented-control
                ref={pixelRatioControlRef}
                full=""
                sizing="equal"
                value={pixelRatioMode}
                aria-label="Preview pixel ratio"
              >
                <fig-segment
                  value="1x"
                  selected={pixelRatioMode === "1x"}
                >
                  Standard 1×
                </fig-segment>
                <fig-segment
                  value="2x"
                  selected={pixelRatioMode === "2x"}
                >
                  High-res 2×
                </fig-segment>
              </fig-segmented-control>
            </fig-field>
            <fig-field direction="horizontal">
              <label>Canvas theme</label>
              <fig-segmented-control
                ref={canvasThemeControlRef}
                full=""
                sizing="equal"
                value={canvasTheme}
              >
                <fig-segment
                  value="light"
                  selected={canvasTheme === "light"}
                >
                  Light
                </fig-segment>
                <fig-segment
                  value="dark"
                  selected={canvasTheme === "dark"}
                >
                  Dark
                </fig-segment>
              </fig-segmented-control>
            </fig-field>
          </fig-group>

          {user && (
            <fig-group name="User details">
              <fig-field direction="horizontal">
                <label>Display name</label>
                <fig-input-text
                  value={displayName}
                  maxlength="80"
                  full=""
                  required=""
                  onInput={(event) => setDisplayName(event.target.value)}
                  dangerouslySetInnerHTML={{ __html: "" }}
                />
              </fig-field>
              <fig-field direction="horizontal">
                <label>Email</label>
                <fig-input-text
                  type="email"
                  value={user.email || ""}
                  readonly=""
                  full=""
                  dangerouslySetInnerHTML={{ __html: "" }}
                />
              </fig-field>
            </fig-group>
          )}

          <fig-group name="AI API keys" collapsible="" open="">
            <p>
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
          </fig-group>

          {FIGMA_LIBRARY_UI_ENABLED && (
            <fig-group name="Figma" collapsible="" open="">
              <p>
                Connect with OAuth to browse and import your Figma shader effects
                and fills. OAuth tokens stay on this device; the client secret
                stays in the server function.
              </p>
              <fig-footer borderless="">
                {figmaConnected ? (
                  <>
                    <fig-button
                      type="button"
                      variant="secondary"
                      disabled={figmaTestState === "testing" ? "" : undefined}
                      onClick={() => {
                        testFigma().catch(() => {});
                      }}
                    >
                      {figmaTestState === "testing"
                        ? "Checking…"
                        : "Check connection"}
                    </fig-button>
                    <fig-button
                      type="button"
                      variant="destructiveSecondary"
                      onClick={removeFigmaConnection}
                    >
                      Disconnect
                    </fig-button>
                  </>
                ) : (
                  <fig-button
                    type="button"
                    variant="primary"
                    disabled={figmaTestState === "testing" ? "" : undefined}
                    onClick={() => {
                      connectFigma().catch(() => {});
                    }}
                  >
                    {figmaTestState === "testing"
                      ? "Connecting…"
                      : "Connect to Figma"}
                  </fig-button>
                )}
              </fig-footer>
              {figmaTestMessage && (
                <p
                  className={
                    figmaTestState === "error"
                      ? "form-message error"
                      : "form-message"
                  }
                >
                  {figmaTestMessage}
                </p>
              )}
            </fig-group>
          )}
          {settingsError && (
            <p className="form-message error">{settingsError}</p>
          )}
        </fig-content>
        <fig-footer>
          <fig-button
            type="button"
            variant="primary"
            disabled={
              settingsSaving || (user && !displayName.trim()) ? "" : undefined
            }
            onClick={saveSettings}
          >
            {settingsSaving ? "Saving…" : settingsSaved ? "Saved" : "Save"}
          </fig-button>
        </fig-footer>
      </dialog>
    </>
  );
}
