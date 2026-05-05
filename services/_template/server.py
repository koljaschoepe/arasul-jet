"""Template Flask service.

Replace this docstring with a one-line description of what the service does.
Wire your endpoints below. Keep the /healthz endpoint — compose + monitoring
expect it.
"""

import logging
import os

from flask import Flask, jsonify

LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

app = Flask(__name__)


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok"})


# TODO: add your endpoints here.


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    log.info("starting template service on port %s", port)
    app.run(host="0.0.0.0", port=port)
