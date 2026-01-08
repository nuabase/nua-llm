import { dbConsoleMain } from "#lib/db";
import { Knex } from "knex";

/* Mapped to the required subset of users table in console/db/schema.rb */
export interface User {
  id: string;
  email_address: string;
  confirmed_at: Date | null;
  svix_uid: string | null;
}

export class UsersModel {
  private db: Knex = dbConsoleMain;
  constructor() {}

  async findById(id: string): Promise<User | null> {
    const user = await this.db("users").where({ id }).first();
    return user || null;
  }

  async findByApiTokenKeyHash(keyHash: string): Promise<User> {
    return this.db("users")
      .select("users.*")
      .innerJoin("api_keys", "users.id", "api_keys.user_id")
      .where("api_keys.key_hash", keyHash)
      .first();
  }
}
