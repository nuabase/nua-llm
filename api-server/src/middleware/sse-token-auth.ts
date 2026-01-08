import { sendUnauthorized } from "#lib/responders";
import { decodeSseTokenClaims, validateSseToken } from "#modules/sse-token";
import { UsersModel } from "../models/users-model";
import { Request, Response } from "express";

const usersModel = new UsersModel();

export async function sseTokenAuth(
  req: Request,
  res: Response,
  next: Function,
) {
  const tokenParam = req.query.token;
  if (typeof tokenParam !== "string" || tokenParam.length === 0) {
    return sendUnauthorized(
      req,
      res,
      "Missing or invalid token query parameter",
    );
  }

  const validation = await validateSseToken(tokenParam);
  if (!validation.isAuthenticated || !validation.userId) {
    const message = validation.error || "Unauthorized: token validation failed";
    return sendUnauthorized(req, res, message);
  }

  const claims = decodeSseTokenClaims(tokenParam);
  if (!claims) {
    return sendUnauthorized(req, res, "Token missing required claims");
  }

  const { rid: tokenRequestId } = claims;
  const routeRequestId = req.params.llm_request_id;
  if (!routeRequestId || tokenRequestId !== routeRequestId) {
    return sendUnauthorized(
      req,
      res,
      "Token does not authorize access to this request",
    );
  }

  const user = await usersModel.findById(validation.userId);
  if (!user) {
    return sendUnauthorized(req, res, "User associated with token not found");
  }

  if (!user.confirmed_at) {
    return sendUnauthorized(
      req,
      res,
      "User is not active. Please check your email for confirmation link.",
    );
  }

  req.user = user;
  next();
}
