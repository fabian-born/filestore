export async function listAllKeys(client, bucket, prefix) {
  const stream = client.listObjectsV2(bucket, prefix, true);
  const keys = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (obj) => obj.name && keys.push(obj.name));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return keys;
}

// Like listAllKeys, but keeps each object's size - needed for anything that
// has to update quota bookkeeping across a whole folder without a separate
// statObject call per file.
export async function listAllKeysWithSize(client, bucket, prefix) {
  const stream = client.listObjectsV2(bucket, prefix, true);
  const entries = [];
  await new Promise((resolve, reject) => {
    stream.on('data', (obj) => obj.name && entries.push({ key: obj.name, size: obj.size }));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return entries;
}

export function statExists(client, bucket, key) {
  return client.statObject(bucket, key).then(
    () => true,
    () => false
  );
}
