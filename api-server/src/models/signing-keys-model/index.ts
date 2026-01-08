import { decryptRailsMessageEncryptor } from "#lib/activesupport-message-encryptor";
import { config } from "#lib/config";
import { dbConsoleMain } from "#lib/db";
import { Knex } from "knex";

/* Mapped to the signing_keys table in console/db/schema.rb */
export interface SigningKey {
  id: string;
  user_id: string;
  label: string;
  kid: string;
  alg: string;
  key_type: string;
  status: string;
  prefix: string;
  last4: string;
  secret_ciphertext: string | null;
  secret_fingerprint: string | null;
  activated_at: Date | null;
  deprecated_at: Date | null;
  revoked_at: Date | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  use_count: number;
  created_at: Date;
  updated_at: Date;
}

export class SigningKeysModel {
  private db: Knex = dbConsoleMain;

  constructor() {}

  async findByUserIdAndKid(
    userId: string,
    kid: string,
  ): Promise<SigningKey | null> {
    const key = await this.db("signing_keys")
      .where({ user_id: userId, kid })
      .first();
    return key || null;
  }

  recordUse(kid: string) {
    // Don't update for every request. Use a random sampling. Other approaches
    // that we'll need as we go to scale in prod, are all documented here:
    // https://chatgpt.com/c/69183092-9c4c-8322-a9f4-08153edbeb09
    // Note that we're not `await` ing. No promise is returned. This is
    // fire and forget.
    const SAMPLE_RATE = 10; // 1 in 10 requests
    const i = Math.random();
    if (i < 1 / SAMPLE_RATE) {
      const promise = this.db("signing_keys")
        .where({ kid })
        .update({
          use_count: this.db.raw("use_count + 1"),
          last_used_at: new Date(),
          updated_at: new Date(),
        });
    }
    return;
  }
}
