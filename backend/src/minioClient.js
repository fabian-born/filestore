import { Client } from 'minio';
import { getSettings } from './settings.js';

function parseEndpoint(rawUrl) {
  const withProto = rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`;
  const parsed = new URL(withProto);
  const useSSL = parsed.protocol === 'https:';
  // The WHATWG URL parser drops the port when it matches the protocol's
  // default (e.g. "https://host:443" -> parsed.port === ""), so an explicit
  // 443/80 must not fall back to MinIO's conventional 9000 default.
  const port = parsed.port ? parseInt(parsed.port, 10) : useSSL ? 443 : 80;
  return { endPoint: parsed.hostname, port, useSSL };
}

export function buildClient({ minioUrl, minioAccessKey, minioSecretKey }) {
  const { endPoint, port, useSSL } = parseEndpoint(minioUrl);
  return new Client({ endPoint, port, useSSL, accessKey: minioAccessKey, secretKey: minioSecretKey });
}

let cachedClient = null;
let cachedKey = null;

// Rebuilds the client whenever the stored connection settings change, so
// updates made via the Settings UI take effect without a restart.
export function getMinioClient() {
  const settings = getSettings();
  const cacheKey = `${settings.minioUrl}|${settings.minioAccessKey}|${settings.minioSecretKey}`;
  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient = buildClient(settings);
    cachedKey = cacheKey;
  }
  return cachedClient;
}

export async function ensureBucket(bucket, client = getMinioClient()) {
  const exists = await client.bucketExists(bucket).catch(() => false);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}
