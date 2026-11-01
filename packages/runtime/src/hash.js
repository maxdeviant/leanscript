// Hash functions, bit-for-bit compatible with the C runtime so that hash-based containers iterate
// in the same order.

const M = 0xc6a4a7935bd1e995n;
const R = 47n;
const u64 = (n) => BigInt.asUintN(64, n);

/** MurmurHash64A of the first `len` bytes of `bytes`, as computed by `hash_str` in the C runtime. */
export function hashBytes(bytes, len, seed) {
  let h = u64(seed ^ u64(BigInt(len) * M));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blocks = len - (len % 8);
  for (let i = 0; i < blocks; i += 8) {
    let k = view.getBigUint64(i, true);
    k = u64(k * M);
    k ^= k >> R;
    k = u64(k * M);
    h ^= k;
    h = u64(h * M);
  }
  const tail = len % 8;
  if (tail > 0) {
    for (let i = tail - 1; i >= 0; i--) {
      h ^= BigInt(bytes[blocks + i]) << BigInt(8 * i);
    }
    h = u64(h * M);
  }
  h ^= h >> R;
  h = u64(h * M);
  h ^= h >> R;
  return h;
}

/** `lean_uint64_mix_hash`, including its `k ^= m` where MurmurHash would multiply. */
export function mixHash(h, k) {
  k = u64(k * M);
  k ^= k >> R;
  k ^= M;
  h ^= k;
  return u64(h * M);
}
