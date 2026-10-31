import manageprofile from "../../sendmessage/src/profile.js";
import sendmessage from "../../sendmessage/src/main.js";
import discoverprofiles from "../../discoverprofiles/src/main.js";
import recordswipe from "../../recordswipe/src/main.js";
import createorgetthread from "../../createorgetthread/src/main.js";
import managerelationship from "../../managerelationship/src/main.js";
import registerforevent from "../../registerforevent/src/main.js";
import canceleventregistration from "../../canceleventregistration/src/main.js";
import manageeventadmin from "../../manageeventadmin/src/main.js";

const handlers = new Map(Object.entries({ manageprofile, sendmessage, discoverprofiles,
  recordswipe, createorgetthread, managerelationship, registerforevent,
  canceleventregistration, manageeventadmin }));

export async function dispatch(context, routes = handlers) {
  const { req, res } = context;
  let envelope;
  try { envelope = req.bodyJson ?? JSON.parse(req.bodyText); }
  catch { return res.json({ message: "Invalid JSON payload" }, 400); }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)
      || !envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)) {
    return res.json({ message: "Expected operation and payload" }, 400);
  }
  const handler = routes.get(envelope.operation);
  if (!handler) return res.json({ message: "Unknown operation" }, 404);
  // Preserve runtime headers. Each handler verifies the injected JWT with Account
  // and applies its own authorization, including event administrator checks.
  return handler({ ...context, req: { ...req, bodyJson: envelope.payload,
    bodyText: JSON.stringify(envelope.payload) } });
}

export default dispatch;
