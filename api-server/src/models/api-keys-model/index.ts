import { Knex } from "knex";

/* Mapped to the api_keys table in console/db/schema.rb */
export interface ApiKey {
  id: string;
  user_id: string;
  label: string;
  prefix: string;
  last4: string;
  key_hash: string;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class ApiKeysModel {
  constructor(private db: Knex) {}

  // NOTE: We don't have a findByKeyHash here. Instead there is a users.findByApiTokenKeyHash
}
