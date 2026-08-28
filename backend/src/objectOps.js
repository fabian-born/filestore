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

export function statExists(client, bucket, key) {
  return client.statObject(bucket, key).then(
    () => true,
    () => false
  );
}
