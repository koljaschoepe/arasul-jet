<?php
// Stellt die Forward-Auth des Geraets nach (C4): mit gueltigem Sitzungs-Cookie 200 und die zwei
// Kopfzeilen X-Arasul-User / X-Arasul-Role, sonst 401. Die echte Stelle ist
// GET /api/auth/verify im dashboard-backend; sie liefert dieselbe Form.
$c = $_COOKIE['arasul_session'] ?? '';
if ($c === 'gueltig-anna') { header('X-Arasul-User: anna'); header('X-Arasul-Role: user'); http_response_code(200); }
else { http_response_code(401); }
