import type { Hono } from "hono";

import type { ActivityLog } from "../activity-log";
import type { ActivityCategory } from "../activity-event";

export function registerActivityRoutes(app: Hono, activityLog: ActivityLog) {
  app.get("/api/activity", (c) => {
    const since = c.req.query("since");
    const category = c.req.query("category") as ActivityCategory | undefined;
    const limitStr = c.req.query("limit");
    const limit = limitStr ? parseInt(limitStr, 10) : 100;

    const events = activityLog.getEvents({
      since: since || undefined,
      category: category || undefined,
      limit: isNaN(limit) ? 100 : limit,
    });

    return c.json({ events });
  });
}
