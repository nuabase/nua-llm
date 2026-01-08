import { isNuaError } from "nua-llm-core";
import { decodeFrontendJWT } from "#llm_authorization/frontend-jwt-validator";
import { Request, Response } from "express";
import { sendFrontendTokenExpired, sendUnauthorized } from "../lib/responders";
import { getUserFromServerToServerApiKey } from "../llm_authorization";
import { User, UsersModel } from "../models/users-model";

const usersModel = new UsersModel();

export async function bearerApiKeyAuth(
  req: Request,
  res: Response,
  next: Function,
) {
  const authHeader = req.headers.authorization;
  if (!(authHeader && authHeader.startsWith("Bearer "))) {
    return sendUnauthorized(
      req,
      res,
      "Missing or invalid Authorization header. Use: 'Authorization: Bearer <token>'",
    );
  }

  const apiKey = authHeader.replace("Bearer ", "");
  let user: User | null = null;
  let endConsumerId: string | null = null;

  if (apiKey.startsWith("sk_")) {
    // This is a server-to-server private key, sent by our client's back-end server
    user = await getUserFromServerToServerApiKey(apiKey);
  } else {
    // Direct front-end to Nuabase call. This must be a JWT token minted by the client's server
    // and forwarded by their front-end to us
    const jwt = await decodeFrontendJWT(apiKey);
    if (jwt.jwtExpired) {
      return sendFrontendTokenExpired(req, res);
    }
    if (isNuaError(jwt)) {
      return sendUnauthorized(req, res, jwt.message);
    } else {
      user = await usersModel.findById(jwt.userId);
      endConsumerId = jwt.endConsumerId;
    }
  }

  if (!user) {
    return sendUnauthorized(req, res, "Invalid Authorization header");
  }

  if (!user.confirmed_at) {
    return sendUnauthorized(
      req,
      res,
      "User is not active. Please check your email for confirmation link.",
    );
  }

  req.user = user;

  if (endConsumerId) req.endConsumerId = endConsumerId;

  next();
}
