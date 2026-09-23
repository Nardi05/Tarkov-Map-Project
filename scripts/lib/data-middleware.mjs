/**
 * The live data endpoint, as connect middleware.
 *
 * `api/data.js` is a Vercel function, so it only exists once the
 * site is deployed. Without this, `npm run dev` and `npm run preview` served a
 * 404 for every `/api/data/…` request and fell back to the static snapshot —
 * which meant the path the deployed site actually takes was the one path never
 * exercised locally, and the console carried a 404 on every load.
 *
 * So the Vite config mounts this in both servers. Same handler, same pipeline,
 * same responses; the only difference is the adapter below, which gives a bare
 * Node response the two Express-shaped methods the handler expects.
 */
import handler from "../../api/data.js";

const PREFIX = "/api/data/";

export function dataMiddleware() {
  return async function tarkovData(req, res, next) {
    const url = req.url ?? "";
    if (!url.startsWith(PREFIX)) return next();

    const path = url.slice(PREFIX.length).split("?")[0];
    const segments = path.split("/").filter(Boolean).map(decodeURIComponent);

    // The handler reads `req.query.path`, which is what Vercel's catch-all
    // route gives it. Nothing else about the request is used.
    const shimReq = { ...req, query: { path: segments } };
    const shimRes = Object.assign(res, {
      status(code) {
        res.statusCode = code;
        return {
          json(body) {
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify(body));
          },
          send(body) {
            res.end(body);
          },
        };
      },
    });

    try {
      await handler(shimReq, shimRes);
    } catch (err) {
      next(err);
    }
  };
}
