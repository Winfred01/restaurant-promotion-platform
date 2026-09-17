import { hash, verify } from "@node-rs/argon2";

const argon2Options = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1
};

export async function hashPassword(password: string) {
  return hash(password, argon2Options);
}

export async function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}
