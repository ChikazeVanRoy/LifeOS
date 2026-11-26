import { parseFeed, type AnkiCheck } from "./engine/anki";

/**
 * Reads the stats Anki Analytics uploads to its own Firebase project, straight from the browser.
 * It signs in as that project's account and reads that account's one snapshot document, which
 * holds daily totals and deck names (card text is already removed before the upload).
 */
export interface AnkiCloudConfig {
  projectId: string;
  apiKey: string;
  email: string;
  password: string;
}

const unavailable = (reason: string): AnkiCheck => ({ available: false, reason });

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000), cache: "no-store" });

const gunzip = async (base64: string) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
};

/** A sign-in lasts an hour, so it is kept and reused rather than repeated on every check. */
let session: { who: string; idToken: string; localId: string; until: number } | null = null;

type SignIn = { idToken: string; localId: string } | { reason: string };

const signIn = async (config: AnkiCloudConfig): Promise<SignIn> => {
  const who = `${config.apiKey}|${config.email}|${config.password}`;
  if (session?.who === who && Date.now() < session.until) return session;
  session = null;
  const auth = await post(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(config.apiKey)}`, {
    email: config.email,
    password: config.password,
    returnSecureToken: true,
  });
  if (!auth.ok) return { reason: "Anki Analytics' Firebase did not accept the sign-in. Check the project, key, email and password." };
  const { idToken, localId, expiresIn } = (await auth.json()) as { idToken?: string; localId?: string; expiresIn?: string };
  if (!idToken || !localId) return { reason: "Anki Analytics' Firebase sign-in did not answer as expected." };
  // Renewed five minutes early, so a check never uses a token about to run out.
  session = { who, idToken, localId, until: Date.now() + (Number(expiresIn) || 3600) * 1000 - 5 * 60_000 };
  return session;
};

const readSnapshot = (config: AnkiCloudConfig, { idToken, localId }: { idToken: string; localId: string }) =>
  fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/snapshots/${encodeURIComponent(localId)}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

export const readAnkiCloud = async (config: AnkiCloudConfig): Promise<AnkiCheck> => {
  try {
    let auth = await signIn(config);
    if ("reason" in auth) return unavailable(auth.reason);
    let doc = await readSnapshot(config, auth);
    if (doc.status === 401 || doc.status === 403) {
      // The kept sign-in may have been revoked: sign in afresh once before giving up.
      session = null;
      auth = await signIn(config);
      if ("reason" in auth) return unavailable(auth.reason);
      doc = await readSnapshot(config, auth);
    }
    if (doc.status === 404) return unavailable("Anki Analytics has not uploaded any stats yet. Run it on the Mac once, then try again.");
    if (doc.status === 403) return unavailable("Anki Analytics' Firebase is not letting this account read its stats.");
    if (!doc.ok) return unavailable("Anki Analytics' Firebase did not answer as expected.");

    const fields = ((await doc.json()) as { fields?: { gz?: { bytesValue?: string } } }).fields;
    if (!fields?.gz?.bytesValue) return unavailable("The stats Anki Analytics uploaded are incomplete.");
    const feed = parseFeed(JSON.parse(await gunzip(fields.gz.bytesValue)));
    if (!feed) return unavailable("This version of Anki Analytics sends data LifeOS does not recognise.");
    // The upload is made after Anki closes, so the stats are the last finished session.
    return { available: true, ankiRunning: false, updateAvailable: false, feed };
  } catch {
    return unavailable("Anki Analytics' Firebase could not be reached. Check the internet connection.");
  }
};
