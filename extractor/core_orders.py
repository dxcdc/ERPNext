"""Read the Core order feed without ONGSYS credentials or write operations."""
import os
from datetime import datetime
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from common import PROTECTED_CONFIG_PATH, _read_env_file


class CoreOrdersError(RuntimeError):
    pass


class CoreOrdersClient:
    def __init__(self, base_url=None, api_key=None, session=None):
        protected = _read_env_file(os.getenv("CDC_NEXTERP_EXTRACTOR_ENV", PROTECTED_CONFIG_PATH))
        base_url = base_url or os.getenv("CORE_BASE_URL") or protected.get("CORE_BASE_URL", "")
        api_key = api_key or os.getenv("CORE_NEXTERP_M2M_KEY") or protected.get("CORE_NEXTERP_M2M_KEY", "")
        parsed = urlparse(base_url)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username
                or parsed.password or parsed.query or parsed.fragment):
            raise CoreOrdersError("CORE_BASE_URL must be an HTTPS URL without credentials or query.")
        if len(api_key) < 32:
            raise CoreOrdersError("Dedicated Core M2M credential is not configured.")
        self.url = base_url.rstrip("/") + "/api/v1/ongsys/pedidos/feed/"
        self.session = session or requests.Session()
        self.session.headers.update({"X-Client-App": "nexterp", "X-API-Key": api_key, "Accept": "application/json"})
        self.session.mount("https://", HTTPAdapter(max_retries=Retry(
            total=2, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET"}), respect_retry_after_header=False,
        )))

    def fetch_snapshot(self, known_snapshot=None, max_pages=10000):
        if max_pages < 1:
            raise CoreOrdersError("Invalid page budget.")
        params = {"page_size": 200, "page": 1}
        if known_snapshot:
            params["known_snapshot"] = known_snapshot
        expected = None
        records, seen_ids = [], set()
        for _ in range(max_pages):
            try:
                response = self.session.get(self.url, params=params, timeout=(5, 30), allow_redirects=False)
            except requests.RequestException:
                raise CoreOrdersError("Core unavailable; no data applied.") from None
            if response.status_code != 200:
                raise CoreOrdersError(f"Core HTTP {response.status_code}; no data applied.")
            try:
                page = response.json()
                paging, meta = page["paginacao"], page["meta"]
                rows = page["dados"]
                total = paging["total_registros"]
                observed = datetime.fromisoformat(meta["ultima_sincronizacao"])
                if (page["status"] != "success" or page["contract_version"] != "v1"
                        or page["dataset"] != "ongsys.orders" or page["complete"] is not True
                        or meta["coleta_completa"] is not True or not isinstance(rows, list)
                        or type(total) is not int or total < 1 or observed.tzinfo is None
                        or paging["pagina_atual"] != params["page"]
                        or type(paging["tem_proxima"]) is not bool
                        or type(page["not_modified"]) is not bool):
                    raise ValueError
                identity = (page["snapshot"], total, meta["ultima_sincronizacao"])
                if expected is not None and expected != identity:
                    raise ValueError
                expected = identity
                normalized = {"snapshot": page["snapshot"], "total": total,
                              "observed_through": meta["ultima_sincronizacao"],
                              "collection_state": meta["estado_coleta"],
                              "complete": True, "not_modified": page["not_modified"]}
                if page["not_modified"]:
                    if records or page["snapshot"] != known_snapshot or rows or paging["tem_proxima"]:
                        raise ValueError
                    return {**normalized, "data": []}
                if not rows:
                    raise ValueError
                for row in rows:
                    order_id = str(row["idPedido"])
                    if (not order_id or order_id in seen_ids or not row["statusPedido"]
                            or not row["tipoPedido"] or not isinstance(row["itensPedido"], list)):
                        raise ValueError
                    seen_ids.add(order_id)
                records.extend(rows)
                if len(records) > total:
                    raise ValueError
                if not paging["tem_proxima"]:
                    if len(records) != total:
                        raise ValueError
                    return {**normalized, "data": records}
                params = {"page_size": 200, "page": params["page"]+1, "snapshot": page["snapshot"]}
            except (KeyError, TypeError, ValueError):
                raise CoreOrdersError("Invalid, incomplete or changing Core snapshot; no data applied.") from None
        raise CoreOrdersError("Core page budget reached; no data applied.")
