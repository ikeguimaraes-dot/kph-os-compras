type SessionCookie = { name: string; value: string };

function validSession(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const text = decodeURIComponent(value);
    const data = JSON.parse(
      text.startsWith("base64-")
        ? atob(text.slice(7).replace(/-/g, "+").replace(/_/g, "/"))
        : text,
    );
    return (
      typeof data?.access_token === "string" &&
      !!data.access_token &&
      typeof data?.refresh_token === "string" &&
      !!data.refresh_token &&
      typeof data?.expires_at === "number"
    );
  } catch {
    return false;
  }
}

/** Adapta a sessão do shell ao formato SSR. Identidade só é aceita após getUser(). */
export function sessionCookies(
  input: SessionCookie[],
  url: string,
): SessionCookie[] {
  const name = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  const value = (key: string) => input.find((c) => c.name === key)?.value;
  let current = value(name);
  if (!current) {
    current = "";
    for (let i = 0; value(`${name}.${i}`); i++)
      current += value(`${name}.${i}`);
  }
  if (validSession(current)) return input;
  let restored = value("kph_auth_session_backup");
  if (!validSession(restored)) restored = undefined;
  if (!restored) {
    const access = value("kph_access_token");
    const refresh = value("kph_refresh_token");
    if (!access || !refresh) return input;
    // A data determina apenas quando renovar. Não autoriza o usuário.
    let expiresAt = 0;
    try {
      const encoded = access.split(".")[1];
      if (!encoded) return input;
      const payload = JSON.parse(
        atob(encoded.replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (typeof payload.exp === "number") expiresAt = payload.exp;
    } catch {
      return input;
    }
    restored = `base64-${btoa(
      JSON.stringify({
        access_token: access,
        refresh_token: refresh,
        token_type: "bearer",
        expires_at: expiresAt,
        expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")}`;
  }
  return [
    ...input.filter((c) => c.name !== name && !c.name.startsWith(`${name}.`)),
    { name, value: restored },
  ];
}
