/**
 * Shared gRPC TLS configuration.
 * TLS is on by default — can only be disabled explicitly for local development.
 * Refuses to disable TLS in production mode.
 */

const isProduction = process.env.NODE_ENV === 'production' || process.env.PRODUCTION === 'true' || process.env.RUST_ENV === 'production';
const explicitDisable = process.env.JAUMEMORY_GRPC_USE_TLS === 'false';

if (isProduction && explicitDisable) {
  throw new Error('FATAL: Cannot disable gRPC TLS in production mode');
}

export const grpcUseTls = !explicitDisable;
export const grpcAddress = process.env.JAUMEMORY_GRPC_URL || 'mem.jau.app:50051';
