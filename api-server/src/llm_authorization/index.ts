import { config } from "#lib/config";
import { hmacSha256 } from "#lib/crypto-utils";
import { User, UsersModel } from "../models/users-model";

export async function getUserFromServerToServerApiKey(
  apiKey: string,
): Promise<User | null> {
  const table = new UsersModel();
  const pepper = config.authn.generatedBearerApiKeysPepperV1;
  const keyHash = hmacSha256(pepper, apiKey);
  const user = await table.findByApiTokenKeyHash(keyHash);
  return user;
}
