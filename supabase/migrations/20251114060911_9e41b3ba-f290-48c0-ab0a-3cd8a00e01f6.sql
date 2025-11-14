-- Enable pgcrypto extension for digest/encode functions used by generate_telemetry_hash trigger
CREATE EXTENSION IF NOT EXISTS pgcrypto;