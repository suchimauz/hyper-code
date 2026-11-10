// http module config. PORT env → config.port, MAUZCODE_HTTP_HOST → config.host.
//   MAUZCODE_HTTP_HOST=127.0.0.1  plain HTTP only on loopback (CLI, REPL, h2 proxy);
//                              the outside world then reaches MauzCode only via HTTPS/HTTP2.
export default {
    port: { type: "integer", required: true, default: 3000, env: "PORT" },
    host: { type: "string", default: "0.0.0.0", env: "MAUZCODE_HTTP_HOST" },
} as const satisfies ConfigSchema;
