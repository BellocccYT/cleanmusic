/** Small JSON response helpers shared by the hub and its modules. */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function fail(status, error, message) {
  return json({ error, message }, status);
}

export const TOO_MANY = () => fail(429, 'zu-oft', 'Zu viele Anfragen – bitte kurz warten.');
