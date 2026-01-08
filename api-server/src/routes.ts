import "./register-path-aliases";
import { Application, Request, Response } from "express";
import castHandler from "#handlers/cast-value-handler/handler";
import castArrayHandler from "./handlers/cast-array-handler/handler";
import requestsHandler from "./handlers/requests-handler/handler";
import sseHandler from "./handlers/sse-handler/handler";

export function mountApplicationRoutes(app: Application) {
  app.get("/", (req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message:
        "This endpoint does not serve content. Please read the API documentation at docs.nuabase.com.",
      docs: "https://docs.nuabase.com",
    });
  });

  app.use("/cast/value", castHandler);
  app.use("/cast/array", castArrayHandler);
  app.use("/requests", requestsHandler);
  app.use("/sse", sseHandler);
}
