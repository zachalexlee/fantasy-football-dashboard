"""Thin Supabase PostgREST client for the worker.

Uses the service-role key (bypasses RLS) and upserts keyed on the natural
unique constraints, so every sync run is idempotent. No ORM, no extra deps.
"""

from __future__ import annotations

import logging
import time

import requests

log = logging.getLogger("db")


class Db:
    def __init__(self, supabase_url: str, service_key: str):
        self.base = supabase_url.rstrip("/") + "/rest/v1"
        self.session = requests.Session()
        self.session.headers.update({
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, path: str, retries: int = 3, **kwargs) -> requests.Response:
        delay = 2.0
        for attempt in range(retries + 1):
            try:
                resp = self.session.request(method, f"{self.base}/{path}", timeout=30, **kwargs)
                if resp.status_code >= 500 and attempt < retries:
                    time.sleep(delay)
                    delay *= 2
                    continue
                resp.raise_for_status()
                return resp
            except requests.RequestException as exc:
                if attempt == retries:
                    log.error("Supabase %s %s failed: %s", method, path, exc)
                    raise
                time.sleep(delay)
                delay *= 2
        raise RuntimeError("unreachable")

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> list[dict]:
        """Upsert rows, merging duplicates on the given conflict target.
        Returns the stored rows (with their uuids)."""
        if not rows:
            return []
        out: list[dict] = []
        # PostgREST handles large batches fine, but chunk to keep payloads modest.
        for i in range(0, len(rows), 500):
            resp = self._request(
                "POST", f"{table}?on_conflict={on_conflict}",
                json=rows[i:i + 500],
                headers={"Prefer": "resolution=merge-duplicates,return=representation"},
            )
            out.extend(resp.json())
        return out

    def select(self, table: str, query: str = "select=*") -> list[dict]:
        rows: list[dict] = []
        offset, page = 0, 1000
        while True:
            resp = self._request(
                "GET", f"{table}?{query}",
                headers={"Range": f"{offset}-{offset + page - 1}", "Range-Unit": "items"},
            )
            batch = resp.json()
            rows.extend(batch)
            if len(batch) < page:
                return rows
            offset += page

    def update(self, table: str, filters: str, patch: dict) -> None:
        self._request("PATCH", f"{table}?{filters}", json=patch,
                      headers={"Prefer": "return=minimal"})

    def delete(self, table: str, filters: str) -> None:
        self._request("DELETE", f"{table}?{filters}", headers={"Prefer": "return=minimal"})
