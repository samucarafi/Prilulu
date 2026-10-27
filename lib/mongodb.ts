import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("Configure MONGODB_URI para acessar o banco de dados.");

type Cache = { connection: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalCache = globalThis as typeof globalThis & { mongooseCache?: Cache };
const cache = globalCache.mongooseCache ?? { connection: null, promise: null };
globalCache.mongooseCache = cache;

export async function connectMongoDB() {
  if (cache.connection) return cache.connection;
  cache.promise ??= mongoose.connect(uri);
  cache.connection = await cache.promise;
  return cache.connection;
}
