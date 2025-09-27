import axios from 'axios';
import { PublicKey } from '@solana/web3.js';
import { logger } from './logger';

function tryParsePublicKey(value: string): PublicKey | null {
  try {
    return new PublicKey(value);
  } catch {
    return null;
  }
}

function resolveFromEnvMap(name: string): PublicKey | null {
  try {
    const raw = process.env.MODEL_NAME_MAP;
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, string>;
    const key = Object.keys(map).find(k => k.toLowerCase() === name.toLowerCase());
    if (!key) return null;
    const maybePubkey = tryParsePublicKey(map[key]);
    return maybePubkey;
  } catch (error) {
    logger.warn('Failed to resolve from MODEL_NAME_MAP', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function resolveFromRemote(name: string): Promise<PublicKey | null> {
  try {
    const url = process.env.MODEL_RESOLVER_URL;
    if (!url) return null;
    const res = await axios.get(url, { params: { name } });
    const pubkeyStr = res.data?.pubkey || res.data?.data?.pubkey;
    if (typeof pubkeyStr !== 'string') return null;
    const maybePubkey = tryParsePublicKey(pubkeyStr);
    return maybePubkey;
  } catch (error) {
    logger.warn('Failed to resolve from remote MODEL_RESOLVER_URL', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

export async function resolveModelIdentifierToPubkey(identifier: string): Promise<PublicKey> {
  // 1) Already a pubkey?
  const direct = tryParsePublicKey(identifier);
  if (direct) return direct;

  // 2) Env map
  const fromMap = resolveFromEnvMap(identifier);
  if (fromMap) return fromMap;

  // 3) Remote
  const fromRemote = await resolveFromRemote(identifier);
  if (fromRemote) return fromRemote;

  throw new Error(`Unable to resolve parent model identifier to public key: ${identifier}`);
}


