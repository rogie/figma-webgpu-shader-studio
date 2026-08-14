/**
 * Proxy for Figma custom shader library reads.
 *
 * Figma REST (api.figma.com/v1) does not expose shader source list/get yet.
 * This function talks to the official Figma MCP HTTP endpoint with the caller's
 * token, mirroring list_shader_* / get_shader_* + resources/read.
 *
 * Write ops stay 501 until Figma ships create/update.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-figma-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MCP_URL =
  Deno.env.get("FIGMA_MCP_URL") || "https://mcp.staging.figma.com/mcp";
const FIGMA_OAUTH_AUTHORIZE =
  Deno.env.get("FIGMA_OAUTH_AUTHORIZE_URL") ||
  "https://staging.figma.com/oauth/mcp";
const FIGMA_OAUTH_TOKEN =
  Deno.env.get("FIGMA_OAUTH_TOKEN_URL") ||
  "https://api.staging.figma.com/v1/oauth/token";
const FIGMA_MCP_SCOPE = "mcp:connect";
const DEFAULT_REDIRECT_URIS = [
  "https://shader-studio.pages.dev/figma/oauth/callback",
  "http://localhost:5173/figma/oauth/callback",
];

type ShaderKind = "effect" | "fill";
type Op =
  | "list"
  | "get"
  | "test"
  | "create"
  | "update"
  | "oauth-authorize"
  | "oauth-exchange"
  | "oauth-refresh";

type RequestBody = {
  op?: Op;
  kind?: ShaderKind;
  id?: string;
  version?: string;
  cursor?: string;
  token?: string;
  redirectUri?: string;
  state?: string;
  codeChallenge?: string;
  code?: string;
  codeVerifier?: string;
  refreshToken?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function readToken(req: Request, body: RequestBody): string {
  const header = req.headers.get("x-figma-token")?.trim() || "";
  const fromBody = typeof body.token === "string" ? body.token.trim() : "";
  const fromEnv = Deno.env.get("FIGMA_ACCESS_TOKEN")?.trim() || "";
  return header || fromBody || fromEnv;
}

function listTool(kind: ShaderKind): string {
  return kind === "fill" ? "list_shader_fills" : "list_shader_effects";
}

function getTool(kind: ShaderKind): string {
  return kind === "fill" ? "get_shader_fill" : "get_shader_effect";
}

function oauthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("FIGMA_OAUTH_CLIENT_ID")?.trim() || "";
  const clientSecret = Deno.env.get("FIGMA_OAUTH_CLIENT_SECRET")?.trim() || "";
  if (!clientId || !clientSecret) {
    throw Object.assign(
      new Error("Figma OAuth is not configured on the server."),
      { code: "figma_oauth_not_configured", status: 503 },
    );
  }
  return { clientId, clientSecret };
}

function allowedRedirectUris(): string[] {
  const configured = Deno.env.get("FIGMA_OAUTH_REDIRECT_URIS")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_REDIRECT_URIS;
}

function requireRedirectUri(value?: string): string {
  const redirectUri = value?.trim() || "";
  if (!allowedRedirectUris().includes(redirectUri)) {
    throw Object.assign(new Error("OAuth redirect URI is not allowed."), {
      code: "oauth_redirect_not_allowed",
      status: 400,
    });
  }
  return redirectUri;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function exchangeOAuthToken(
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { clientId, clientSecret } = oauthCredentials();
  const response = await fetch(FIGMA_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      ...params,
      resource: MCP_URL,
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : `Figma OAuth token request failed (${response.status})`;
    throw Object.assign(new Error(message), {
      code: "figma_oauth_token_error",
      status: response.status,
    });
  }
  if (typeof payload.access_token !== "string") {
    throw Object.assign(new Error("Figma OAuth returned no access token."), {
      code: "figma_oauth_missing_token",
      status: 502,
    });
  }
  return {
    accessToken: payload.access_token,
    refreshToken:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : undefined,
    expiresIn:
      typeof payload.expires_in === "number" ? payload.expires_in : undefined,
    userId:
      typeof payload.user_id_string === "string"
        ? payload.user_id_string
        : undefined,
  };
}

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function parseSseJsonRpc(text: string): JsonRpc | null {
  const dataLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as JsonRpc;
  } catch {
    return null;
  }
}

async function parseMcpResponse(response: Response): Promise<{
  rpc: JsonRpc | null;
  sessionId: string | null;
  rawText: string;
}> {
  const sessionId = response.headers.get("mcp-session-id");
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    return { rpc: null, sessionId, rawText };
  }

  if (contentType.includes("application/json")) {
    try {
      return { rpc: JSON.parse(rawText) as JsonRpc, sessionId, rawText };
    } catch {
      return { rpc: null, sessionId, rawText };
    }
  }

  return { rpc: parseSseJsonRpc(rawText), sessionId, rawText };
}

class McpClient {
  #token: string;
  #sessionId: string | null = null;
  #initialized = false;
  #nextId = 1;

  constructor(token: string) {
    this.#token = token;
  }

  async #post(body: JsonRpc): Promise<JsonRpc> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.#token}`,
    };
    if (this.#sessionId) headers["Mcp-Session-Id"] = this.#sessionId;

    const response = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const { rpc, sessionId, rawText } = await parseMcpResponse(response);
    if (sessionId) this.#sessionId = sessionId;

    if (response.status === 401 || response.status === 403) {
      throw Object.assign(
        new Error(
          "Figma MCP authorization failed. Reconnect Figma and confirm this OAuth client is approved for mcp:connect.",
        ),
        { code: "figma_mcp_unauthorized", status: response.status },
      );
    }

    if (!response.ok) {
      throw Object.assign(
        new Error(
          rawText?.slice(0, 280) ||
            `Figma MCP request failed (${response.status})`,
        ),
        { code: "figma_mcp_error", status: response.status },
      );
    }

    if (!rpc) {
      throw Object.assign(
        new Error("Figma MCP returned an unreadable response."),
        { code: "figma_mcp_parse", status: 502 },
      );
    }

    if (rpc.error) {
      throw Object.assign(
        new Error(rpc.error.message || "Figma MCP tool error"),
        { code: "figma_mcp_rpc", status: 502, data: rpc.error.data },
      );
    }

    return rpc;
  }

  async ensureSession(): Promise<void> {
    if (this.#initialized) return;

    await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "figma-webgpu-shader-studio", version: "0.1.0" },
      },
    });

    // notifications/initialized has no response body requirements
    try {
      await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${this.#token}`,
          ...(this.#sessionId ? { "Mcp-Session-Id": this.#sessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });
    } catch {
      // Some transports ignore notification failures; tools may still work.
    }

    this.#initialized = true;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.ensureSession();
    const rpc = await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    });
    return rpc.result;
  }

  async readResource(uri: string): Promise<string> {
    await this.ensureSession();
    const rpc = await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "resources/read",
      params: { uri },
    });
    const result = rpc.result as {
      contents?: Array<{ text?: string; blob?: string; mimeType?: string }>;
    } | null;
    const content = result?.contents?.[0];
    if (typeof content?.text === "string") return content.text;
    if (typeof content?.blob === "string") {
      try {
        return atob(content.blob);
      } catch {
        return content.blob;
      }
    }
    throw Object.assign(new Error(`Empty MCP resource: ${uri}`), {
      code: "empty_resource",
      status: 502,
    });
  }
}

function extractToolPayload(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  const record = result as Record<string, unknown>;

  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent as Record<string, unknown>;
  }

  const content = Array.isArray(record.content) ? record.content : [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const text = (part as { text?: string }).text;
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // keep looking
    }
  }

  // Some servers return the payload at the top level.
  if ("items" in record || "id" in record || "files" in record) {
    return record;
  }
  return {};
}

async function listShaders(
  client: McpClient,
  kind: ShaderKind,
  cursor?: string,
) {
  const result = await client.callTool(listTool(kind), {
    ...(cursor ? { cursor } : {}),
  });
  const payload = extractToolPayload(result);
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    items: items.map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >;
      return {
        id: String(row.id || ""),
        name: String(row.name || "Untitled"),
        description:
          typeof row.description === "string" ? row.description : "",
      };
    }).filter((item) => item.id),
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

async function getShader(
  client: McpClient,
  kind: ShaderKind,
  id: string,
  version?: string,
) {
  const result = await client.callTool(getTool(kind), {
    id,
    ...(version ? { version } : {}),
  });
  const payload = extractToolPayload(result);
  const filesIn = Array.isArray(payload.files) ? payload.files : [];
  const files: Array<{
    filename: string;
    bytes?: number;
    uri?: string;
    text?: string;
  }> = [];

  for (const entry of filesIn) {
    const file = (entry && typeof entry === "object" ? entry : {}) as Record<
      string,
      unknown
    >;
    const filename = String(file.filename || "");
    const uri = typeof file.uri === "string" ? file.uri : undefined;
    let text = typeof file.text === "string" ? file.text : undefined;
    if (!text && uri) {
      text = await client.readResource(uri);
    }
    files.push({
      filename,
      bytes: typeof file.bytes === "number" ? file.bytes : undefined,
      uri,
      text,
    });
  }

  const byName = new Map(
    files.map((file) => [file.filename.toLowerCase(), file]),
  );

  return {
    id: String(payload.id || id),
    name: String(payload.name || "Shader"),
    description:
      typeof payload.description === "string" ? payload.description : "",
    type: typeof payload.type === "string" ? payload.type : kind,
    version: typeof payload.version === "string" ? payload.version : undefined,
    kind,
    files,
    mainTs: byName.get("main.ts")?.text || "",
    featuresJson: byName.get("features.json")?.text,
    productBrief: byName.get("product-brief.md")?.text,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body", code: "bad_json" });
  }

  const op = body.op;
  if (!op) {
    return jsonResponse(400, { error: "Missing op", code: "missing_op" });
  }

  if (op === "create" || op === "update") {
    return jsonResponse(501, {
      error:
        "Figma has not shipped create/update for the custom shader library yet.",
      code: "write_not_supported",
    });
  }

  if (op === "oauth-authorize") {
    try {
      const { clientId } = oauthCredentials();
      const redirectUri = requireRedirectUri(body.redirectUri);
      const state = body.state?.trim() || "";
      const codeChallenge = body.codeChallenge?.trim() || "";
      if (!state || !codeChallenge) {
        return jsonResponse(400, {
          error: "state and codeChallenge are required",
          code: "invalid_oauth_request",
        });
      }
      const url = new URL(FIGMA_OAUTH_AUTHORIZE);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", FIGMA_MCP_SCOPE);
      url.searchParams.set("state", state);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("resource", MCP_URL);
      return jsonResponse(200, { authorizationUrl: url.toString() });
    } catch (error) {
      const err = error as { message?: string; code?: string; status?: number };
      return jsonResponse(err.status || 502, {
        error: err.message || String(error),
        code: err.code || "figma_oauth_error",
      });
    }
  }

  if (op === "oauth-exchange") {
    try {
      const redirectUri = requireRedirectUri(body.redirectUri);
      const code = body.code?.trim() || "";
      const codeVerifier = body.codeVerifier?.trim() || "";
      if (!code || !codeVerifier) {
        return jsonResponse(400, {
          error: "code and codeVerifier are required",
          code: "invalid_oauth_exchange",
        });
      }
      const tokens = await exchangeOAuthToken({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });
      return jsonResponse(200, tokens);
    } catch (error) {
      const err = error as { message?: string; code?: string; status?: number };
      return jsonResponse(err.status || 502, {
        error: err.message || String(error),
        code: err.code || "figma_oauth_error",
      });
    }
  }

  if (op === "oauth-refresh") {
    try {
      const refreshToken = body.refreshToken?.trim() || "";
      if (!refreshToken) {
        return jsonResponse(400, {
          error: "refreshToken is required",
          code: "invalid_oauth_refresh",
        });
      }
      const tokens = await exchangeOAuthToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      return jsonResponse(200, tokens);
    } catch (error) {
      const err = error as { message?: string; code?: string; status?: number };
      return jsonResponse(err.status || 502, {
        error: err.message || String(error),
        code: err.code || "figma_oauth_error",
      });
    }
  }

  const token = readToken(req, body);
  if (!token) {
    return jsonResponse(401, {
      error: "Missing Figma access token",
      code: "missing_token",
    });
  }

  try {
    if (op === "test") {
      const client = new McpClient(token);
      await listShaders(client, "effect");
      return jsonResponse(200, { ok: true });
    }

    if (op === "list") {
      const kind = body.kind;
      if (kind !== "effect" && kind !== "fill") {
        return jsonResponse(400, {
          error: "kind must be effect or fill",
          code: "invalid_kind",
        });
      }
      const client = new McpClient(token);
      const listed = await listShaders(client, kind, body.cursor);
      return jsonResponse(200, listed);
    }

    if (op === "get") {
      const kind = body.kind;
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (kind !== "effect" && kind !== "fill") {
        return jsonResponse(400, {
          error: "kind must be effect or fill",
          code: "invalid_kind",
        });
      }
      if (!id) {
        return jsonResponse(400, {
          error: "id is required",
          code: "invalid_id",
        });
      }
      const client = new McpClient(token);
      const detail = await getShader(client, kind, id, body.version);
      if (!detail.mainTs?.trim()) {
        return jsonResponse(502, {
          error: "Figma shader is missing main.ts source.",
          code: "missing_main",
        });
      }
      return jsonResponse(200, detail);
    }

    return jsonResponse(400, { error: `Unknown op: ${op}`, code: "bad_op" });
  } catch (error) {
    const err = error as {
      message?: string;
      code?: string;
      status?: number;
    };
    const status =
      typeof err.status === "number" && err.status >= 400 && err.status < 600
        ? err.status
        : 502;
    return jsonResponse(status, {
      error: err.message || String(error),
      code: err.code || "figma_proxy_error",
    });
  }
});
