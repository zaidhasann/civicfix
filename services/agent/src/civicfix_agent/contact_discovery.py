from __future__ import annotations

import logging
import re
from typing import Protocol
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)
EMAIL_PATTERN = re.compile(r'\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b', re.IGNORECASE)
GRIEVANCE_TERMS = ('grievance', 'jansunwai', 'complaint', 'igrs')


class ContactDiscovery(Protocol):
    def discover(self, query: str) -> ContactDiscoveryResult: ...

    def close(self) -> None: ...


class ContactDiscoveryResult(BaseModel):
    model_config = ConfigDict(extra='forbid')

    email: str | None
    department: str
    authority: str
    sources: list[str] = Field(default_factory=list)
    verification_status: str
    contact_source: str
    ward: str | None = None


class TavilyContactDiscovery:
    def __init__(
        self,
        api_key: str,
        timeout_seconds: float = 15.0,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_key:
            raise ValueError('TAVILY_API_KEY is required for online contact discovery')
        self.api_key = api_key
        self.http = client or httpx.Client(timeout=timeout_seconds)

    def close(self) -> None:
        self.http.close()

    def discover(self, query: str) -> ContactDiscoveryResult:
        city = _city_from_query(query)
        search_query = f'{city} municipal corporation grievance complaint email commissioner contact'
        try:
            first = self._search(search_query, include_domains=True)
            result = self._find_candidate(first.get('results', []), city)
            if result.email or result.sources:
                return result

            fallback = self._search(search_query, include_domains=False)
            return self._find_candidate(fallback.get('results', []), city)
        except (httpx.HTTPError, ValueError) as error:
            logger.warning('Tavily contact discovery failed', extra={'error': str(error)})
            return _not_found()

    def _search(self, query: str, *, include_domains: bool) -> dict[str, object]:
        payload: dict[str, object] = {
            'query': query,
            'search_depth': 'advanced',
            'max_results': 5,
            'include_answer': False,
            'include_raw_content': True,
        }
        if include_domains:
            payload['include_domains'] = ['nic.in', 'gov.in']
        response = self.http.post(
            'https://api.tavily.com/search',
            json=payload,
            headers={'Authorization': f'Bearer {self.api_key}'},
        )
        response.raise_for_status()
        body = response.json()
        if not isinstance(body, dict):
            raise TypeError('Tavily returned an invalid response')
        return body

    def _find_candidate(self, results: object, city: str) -> ContactDiscoveryResult:
        if not isinstance(results, list):
            return _not_found()
        portal_urls: list[str] = []
        for result in results:
            if not isinstance(result, dict):
                continue
            url = result.get('url')
            title = result.get('title', '')
            if not isinstance(url, str) or not _is_government_source(url):
                continue
            title_text = title if isinstance(title, str) else ''
            text = ' '.join(
                value
                for value in (result.get('content'), result.get('raw_content'))
                if isinstance(value, str)
            )
            searchable_text = f'{title_text} {text}'
            if city.casefold() not in searchable_text.casefold():
                continue
            deobfuscated = _deobfuscate(searchable_text)
            emails = [
                email.lower()
                for email in EMAIL_PATTERN.findall(deobfuscated)
                if _is_accepted_email(email, url)
            ]
            if emails:
                return ContactDiscoveryResult(
                    email=emails[0],
                    department='Government authority identified from official source',
                    authority=title_text or 'Government authority',
                    sources=[url],
                    verification_status='verified',
                    contact_source='online_search',
                    ward=_ward_from_text(deobfuscated),
                )
            if any(term in f'{url} {title_text}'.casefold() for term in GRIEVANCE_TERMS):
                portal_urls.append(url)
        return _not_found(portal_urls)


def _city_from_query(query: str) -> str:
    words = query.strip().split()
    stop_words = {'pothole', 'potholes', 'garbage', 'trash', 'waste', 'streetlight', 'drainage', 'official', 'email', 'government'}
    city_words: list[str] = []
    for word in words:
        if word.casefold() in stop_words:
            break
        city_words.append(word)
    return ' '.join(city_words) or query.strip()


def _is_government_source(url: str) -> bool:
    hostname = (urlparse(url).hostname or '').lower().rstrip('.')
    return hostname.endswith(('.gov.in', '.nic.in')) or hostname == 'gov.in'


def _deobfuscate(text: str) -> str:
    text = re.sub(r'\s+\bat\b\s+', '@', text, flags=re.IGNORECASE)
    text = re.sub(r'\s*\[(?:at)\]\s*|\s*\((?:at)\)\s*', '@', text, flags=re.IGNORECASE)
    return re.sub(r'\s*\[(?:dot)\]\s*|\s*\((?:dot)\)\s*', '.', text, flags=re.IGNORECASE)


def _registered_domain(url: str) -> str:
    hostname = (urlparse(url).hostname or '').lower().rstrip('.')
    labels = hostname.split('.')
    return '.'.join(labels[-3:]) if hostname.endswith(('.gov.in', '.nic.in')) else '.'.join(labels[-2:])


def _is_accepted_email(email: str, source_url: str) -> bool:
    domain = email.rsplit('@', 1)[-1].lower().rstrip('.')
    return domain.endswith(('.gov.in', '.nic.in')) or domain == _registered_domain(source_url)


def _ward_from_text(text: str) -> str | None:
    match = re.search(
        r'\bward(?:\s+(?:no\.?|number))?\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9 -]{0,80})',
        text,
        re.IGNORECASE,
    )
    return match.group(1).strip(' .,:;') if match else None


def _not_found(sources: list[str] | None = None) -> ContactDiscoveryResult:
    return ContactDiscoveryResult(
        email=None,
        department='CivicFix review queue',
        authority='Unconfirmed authority',
        sources=sources or [],
        verification_status='not_found',
        contact_source='online_search',
        ward=None,
    )
