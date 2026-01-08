import { config } from "#lib/config";
import { Svix } from "svix";

const svixClient = new Svix(config.svixWebhookApiKey);

export { svixClient };
