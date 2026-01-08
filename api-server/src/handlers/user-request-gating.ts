import { sendUnauthorized } from "#lib/responders";
import { Request, Response as ExpressResponse, Router } from "express";

// This function is more or less a type-guard. There must always be a user because
// we'd have had either the jwt middleware or auth middleware putting it in.
// However, since that happens in a different control flow, TS wouldn't know it.
// So this is called by the handlers as a type appeasement as well as a little
// redundant user auth defense.
export function sendUnauthorized_unlessUser(
  req: Request,
  res: ExpressResponse,
) {
  const currentUser = req.user;
  if (!currentUser) {
    sendUnauthorized(
      req,
      res,
      "Missing authenticated user context for SSE request",
    );
    return undefined;
  }
  return currentUser;
}
